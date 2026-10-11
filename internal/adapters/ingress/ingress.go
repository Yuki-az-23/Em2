// Package ingress is EM2's reverse-proxy plane (BLUEPRINT B12, ADR-013). A
// principal sends a request to another principal's handle; EM2 stores it as a
// direct message and answers the sender at once with the same 202 it gives
// every accepted message. When the receiver's verdict delivers the request
// (pass or shape, or later on release), EM2 forwards it to the receiver's
// registered upstream with the receiver's EM2-* verdict headers. A successful
// upstream answer becomes a reply message to the sender, which goes through
// the sender's own verdict. Upstream errors and banners never reach the sender.
package ingress

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"strconv"
	"sync"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/adapters/convert"
	"em2.social/em2/internal/netguard"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Config for the adapter.
type Config struct {
	Guard        *netguard.Guard // outbound policy for upstream calls
	Timeout      time.Duration   // per upstream call; default 30s
	MaxBody      int64           // request and reply bytes; default 1 MiB
	ForwardEvery time.Duration   // forwarding poll; default 500ms
	Pad          time.Duration   // fixed response time of the sender path; default 150ms
	// Circuit breaker per upstream: after Failures consecutive failures,
	// forwards fail at once for OpenFor.
	Failures int
	OpenFor  time.Duration
}

// Adapter is the ingress adapter.
type Adapter struct {
	cfg       Config
	client    *http.Client
	scope     *kernel.Scope
	handles   services.Handles
	dir       services.Directory
	stances   services.Stances
	messages  services.Messages
	endpoints services.Endpoints
	exchanges services.Exchanges

	mu      sync.Mutex
	breaker map[string]*breakerState
}

type breakerState struct {
	fails     int
	openUntil time.Time
}

// New builds the adapter.
func New(cfg Config) *Adapter {
	if cfg.Guard == nil {
		cfg.Guard = &netguard.Guard{}
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.MaxBody <= 0 {
		cfg.MaxBody = 1 << 20
	}
	if cfg.ForwardEvery <= 0 {
		cfg.ForwardEvery = 500 * time.Millisecond
	}
	if cfg.Pad <= 0 {
		cfg.Pad = 150 * time.Millisecond
	}
	if cfg.Failures <= 0 {
		cfg.Failures = 5
	}
	if cfg.OpenFor <= 0 {
		cfg.OpenFor = time.Minute
	}
	return &Adapter{cfg: cfg, client: cfg.Guard.Client(cfg.Timeout), breaker: map[string]*breakerState{}}
}

func (a *Adapter) Manifest() kernel.Manifest {
	sub, _ := fs.Sub(migrations, "migrations")
	return kernel.Manifest{Name: "ingress", Version: "0.3.0", Kind: kernel.KindAdapter, Schema: "ingress",
		DependsOn: []string{"identity", "ledger", "ingest", "verdict"}, Migrations: sub}
}

func (a *Adapter) Register(r *kernel.Registry) error {
	var err error
	if a.handles, err = kernel.Resolve[services.Handles](r); err != nil {
		return err
	}
	if a.dir, err = kernel.Resolve[services.Directory](r); err != nil {
		return err
	}
	if a.stances, err = kernel.Resolve[services.Stances](r); err != nil {
		return err
	}
	if a.messages, err = kernel.Resolve[services.Messages](r); err != nil {
		return err
	}
	if a.endpoints, err = kernel.Resolve[services.Endpoints](r); err != nil {
		return err
	}
	if a.exchanges, err = kernel.Resolve[services.Exchanges](r); err != nil {
		return err
	}
	a.scope = r.Scope()
	r.Subscribe("verdict.exchange.delivered", 1, a.onDelivered)
	r.Job("forward", a.cfg.ForwardEvery, a.forward)
	r.Route(kernel.Route{Method: "POST", Path: "/ingress/{handle}", OperationID: "sendIngress",
		Summary: "Send a request to a principal through EM2. The response is the same 202 for every accepted request; " +
			"the receiver's verdict decides whether it is forwarded to their upstream, and an answer arrives in your feed as a reply.",
		Tags: []string{"ingress"}, Auth: kernel.AuthPrincipal, Scope: "post:create", Idempotent: true,
		Params:    map[string]*schema.Schema{"handle": schema.String().Match(`[A-Za-z0-9_][A-Za-z0-9_-]{0,63}`)},
		RawBody:   []string{"application/json", "text/plain", "text/markdown"},
		MaxBody:   a.cfg.MaxBody,
		Responses: map[int]*schema.Schema{202: schema.Object(schema.Req("id", schema.UUID()))},
		RateLimit: &kernel.RateLimit{Burst: 60, Per: time.Minute}, MinDuration: a.cfg.Pad, Handler: a.send})
	return nil
}

// send accepts a request. Unknown handles get the same 202 (with an id that
// leads nowhere), so the route cannot be used to discover principals.
func (a *Adapter) send(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	p := c.Principal()
	stance, err := a.stances.Stance(c, p.ID)
	if err != nil {
		return nil, err
	}
	if stance == nil {
		return nil, kernel.ErrConflict.WithDetail("Set your bridge with PUT /v1/me/bridge before sending.")
	}
	ct := req.Header.Get("Content-Type")
	conv := convert.ToMarkdown(ct, req.Body)
	if !conv.Text {
		return nil, kernel.BadRequest("The body must be UTF-8 text or JSON.")
	}
	if len(bytes.TrimSpace(req.Body)) == 0 {
		return nil, kernel.BadRequest("The body is empty.")
	}
	target, err := a.handles.ByHandle(c, req.Params["handle"])
	if err != nil {
		return nil, err
	}
	accepted := func(id string) *kernel.Response {
		return &kernel.Response{Status: http.StatusAccepted, Location: "/v1/messages/" + id, Body: map[string]string{"id": id}}
	}
	if target == nil {
		return accepted(kernel.NewID()), nil
	}
	// The request row is written first so the message is stored in the same
	// transaction: the verdict that forwards it cannot run before both exist.
	id := kernel.NewID()
	if _, err := c.DB().Exec(c, `INSERT INTO requests (message_id, sender_id, receiver_id, content_type, body, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)`, id, p.ID, target.ID, ct, []byte(req.Body), c.Now()); err != nil {
		return nil, err
	}
	if _, err := a.messages.AcceptDirect(c, services.DirectMessage{ID: id, Plane: core.PlaneIngress, Sender: *p, ReceiverID: target.ID,
		BodyMD: conv.Markdown, Header: req.Header}); err != nil {
		return nil, err
	}
	return accepted(id), nil
}

type delivered struct {
	ExchangeID  string   `json:"exchange_id"`
	MessageID   string   `json:"message_id"`
	ReceiverID  string   `json:"receiver_id"`
	Plane       string   `json:"plane"`
	Kind        string   `json:"kind"`
	Score       *float64 `json:"score"`
	Risk        float64  `json:"risk"`
	Reason      string   `json:"reason"`
	RuleVersion string   `json:"rule_version"`
	Shadow      bool     `json:"shadow"`
}

// onDelivered queues a forward for a delivered ingress request. Replies have
// no request row and are never forwarded, so two upstreams cannot ping-pong.
func (a *Adapter) onDelivered(c kernel.Ctx, e kernel.Envelope) error {
	var ev delivered
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	if ev.Plane != string(core.PlaneIngress) {
		return nil
	}
	_, err := c.DB().Exec(c, `INSERT INTO forwards (exchange_id, message_id, receiver_id, state, verdict, created_at)
		SELECT $1, message_id, receiver_id, 'pending', $3, $4 FROM requests WHERE message_id = $2 AND receiver_id = $5
		ON CONFLICT DO NOTHING`, ev.ExchangeID, ev.MessageID, e.Payload, c.Now(), ev.ReceiverID)
	return err
}

type job struct {
	exchangeID, messageID, receiverID, senderID, contentType string
	body                                                     []byte
	verdict                                                  delivered
}

// plain hides the job's kernel context so each service call below runs in a
// short transaction of its own instead of one held across HTTP calls.
type plain struct{ context.Context }

func (a *Adapter) forward(c kernel.Ctx) error {
	ctx := plain{c}
	var jobs []job
	err := a.scope.Tx(ctx, func(tc kernel.Ctx) error {
		// A forward left in "sending" by a crash is failed, never repeated.
		if _, err := tc.DB().Exec(tc, `UPDATE forwards SET state = 'failed', finished_at = $1, error = 'interrupted'
			WHERE state = 'sending' AND claimed_at < $2`, tc.Now(), tc.Now().Add(-2*a.cfg.Timeout)); err != nil {
			return err
		}
		rows, err := tc.DB().Query(tc, `UPDATE forwards f SET state = 'sending', claimed_at = $1
			FROM requests q WHERE q.message_id = f.message_id AND f.exchange_id IN (
				SELECT exchange_id FROM forwards WHERE state = 'pending' ORDER BY created_at LIMIT 16 FOR UPDATE SKIP LOCKED)
			RETURNING f.exchange_id, f.message_id, f.receiver_id, q.sender_id, q.content_type, q.body, f.verdict`, tc.Now())
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var j job
			var v []byte
			if err := rows.Scan(&j.exchangeID, &j.messageID, &j.receiverID, &j.senderID, &j.contentType, &j.body, &v); err != nil {
				return err
			}
			if err := json.Unmarshal(v, &j.verdict); err != nil {
				return err
			}
			jobs = append(jobs, j)
		}
		return rows.Err()
	})
	if err != nil || len(jobs) == 0 {
		return err
	}
	var wg sync.WaitGroup
	for _, j := range jobs {
		wg.Add(1)
		go func(j job) {
			defer wg.Done()
			if err := a.forwardOne(ctx, c.Log(), j); err != nil {
				c.Log().Error("ingress forward bookkeeping failed", "exchange_id", j.exchangeID, "error", err)
			}
		}(j)
	}
	wg.Wait()
	return nil
}

type result struct {
	state   string
	status  int
	latency time.Duration
	replyID string
	err     string
}

func (a *Adapter) forwardOne(ctx context.Context, log kernel.Logger, j job) error {
	res := a.call(ctx, j)
	if res.state == "done" && res.status > 0 {
		if err := a.exchanges.Responded(ctx, j.exchangeID, res.status, res.latency); err != nil {
			return err
		}
	}
	if res.err != "" {
		log.Warn("ingress upstream failed", "exchange_id", j.exchangeID, "status", res.status, "error", res.err)
	}
	return a.scope.Tx(ctx, func(tc kernel.Ctx) error {
		var reply any
		if res.replyID != "" {
			reply = res.replyID
		}
		var status any
		if res.status > 0 {
			status = res.status
		}
		var errText any
		if res.err != "" {
			errText = res.err
		}
		_, err := tc.DB().Exec(tc, `UPDATE forwards SET state = $2, finished_at = $3, upstream_status = $4, latency_ms = $5, reply_id = $6, error = $7
			WHERE exchange_id = $1`, j.exchangeID, res.state, tc.Now(), status, int(res.latency.Milliseconds()), reply, errText)
		return err
	})
}

func (a *Adapter) open(receiver string, now time.Time) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	b := a.breaker[receiver]
	return b != nil && now.Before(b.openUntil)
}

func (a *Adapter) record(receiver string, ok bool, now time.Time) {
	a.mu.Lock()
	defer a.mu.Unlock()
	b := a.breaker[receiver]
	if b == nil {
		b = &breakerState{}
		a.breaker[receiver] = b
	}
	if ok {
		b.fails = 0
		return
	}
	b.fails++
	if b.fails >= a.cfg.Failures {
		b.openUntil, b.fails = now.Add(a.cfg.OpenFor), 0
	}
}

// call forwards one request and turns a successful answer into a reply.
func (a *Adapter) call(ctx context.Context, j job) result {
	ep, err := a.endpoints.Endpoint(ctx, j.receiverID)
	if err != nil {
		return result{state: "failed", err: "endpoint lookup: " + err.Error()}
	}
	if ep == nil {
		// Nothing to forward to: the request stays in the receiver's feed.
		return result{state: "done", err: ""}
	}
	now := time.Now()
	if a.open(j.receiverID, now) {
		return result{state: "failed", err: "circuit open"}
	}
	dir, err := a.dir.Public(ctx, []string{j.senderID, j.receiverID})
	if err != nil {
		return result{state: "failed", err: "directory: " + err.Error()}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep.URL, bytes.NewReader(j.body))
	if err != nil {
		return result{state: "failed", err: "bad upstream url"}
	}
	v := j.verdict
	req.Header.Set("Content-Type", j.contentType)
	req.Header.Set("User-Agent", "EM2")
	req.Header.Set("EM2-Message-Id", j.messageID)
	req.Header.Set("EM2-Sender", dir[j.senderID].Handle)
	req.Header.Set("EM2-Verdict", v.Kind)
	if v.Score != nil {
		req.Header.Set("EM2-Score", strconv.FormatFloat(*v.Score, 'f', 4, 64))
	}
	req.Header.Set("EM2-Risk", strconv.FormatFloat(v.Risk, 'f', 4, 64))
	req.Header.Set("EM2-Reason", headerSafe(v.Reason))
	req.Header.Set("EM2-Rule-Version", v.RuleVersion)
	if v.Shadow {
		req.Header.Set("EM2-Shadow", "true")
	}
	start := time.Now()
	resp, err := a.client.Do(req)
	lat := time.Since(start)
	if err != nil {
		a.record(j.receiverID, false, time.Now())
		if errors.Is(err, netguard.ErrBlocked) {
			return result{state: "failed", latency: lat, err: "upstream address not allowed"}
		}
		return result{state: "failed", latency: lat, err: "upstream unreachable: " + err.Error()}
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, a.cfg.MaxBody+1))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		a.record(j.receiverID, false, time.Now())
		return result{state: "done", status: resp.StatusCode, latency: lat,
			err: fmt.Sprintf("upstream status %d: %s", resp.StatusCode, truncate(body, 512))}
	}
	a.record(j.receiverID, true, time.Now())
	res := result{state: "done", status: resp.StatusCode, latency: lat}
	if len(bytes.TrimSpace(body)) == 0 {
		return res
	}
	if int64(len(body)) > a.cfg.MaxBody {
		res.err = "upstream reply too large; not relayed"
		return res
	}
	rcv := dir[j.receiverID]
	conv := convert.ToMarkdown(resp.Header.Get("Content-Type"), body)
	id, err := a.messages.AcceptDirect(ctx, services.DirectMessage{Plane: core.PlaneIngress,
		Sender:     core.Principal{ID: rcv.ID, Handle: rcv.Handle, Kind: rcv.Kind},
		ReceiverID: j.senderID, ParentID: j.messageID, BodyMD: conv.Markdown, Header: claimHeaders(resp.Header)})
	if err != nil {
		res.err = "reply not stored: " + err.Error()
		return res
	}
	res.replyID = id
	return res
}

// claimHeaders keeps only what the upstream asserted about its content; the
// rest of its headers (Server, X-Powered-By, cookies) never travel further.
func claimHeaders(h http.Header) http.Header {
	out := http.Header{}
	for _, k := range []string{"EM2-Emotion", "EM2-Color"} {
		if v := h.Get(k); v != "" {
			out.Set(k, v)
		}
	}
	return out
}

func headerSafe(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c < 0x20 || c > 0x7e {
			b[i] = ' '
		}
	}
	return string(b)
}

func truncate(b []byte, n int) string {
	if len(b) > n {
		b = b[:n]
	}
	return string(b)
}
