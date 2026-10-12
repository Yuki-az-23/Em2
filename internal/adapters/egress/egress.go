// Package egress is EM2's forward-proxy plane (BLUEPRINT B12). An agent asks
// EM2 to fetch a URL; EM2 fetches it through the network guard, converts the
// content to Markdown and stores it as a message addressed to that agent with
// an unknown emotional state, so it gets a dossier and a verdict (shape: the
// state is not known) like everything else the agent consumes. The upstream
// learns nothing about EM2 or the agent: no EM2 headers, a generic agent.
//
// M3 ships the explicit fetch API only. The HTTP CONNECT listener (metadata
// only, no TLS interception) follows in M5.
package egress

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/adapters/convert"
	"em2.social/em2/internal/netguard"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
)

// Config for the adapter.
type Config struct {
	Guard   *netguard.Guard
	Timeout time.Duration // default 20s
	MaxBody int64         // default 5 MiB
}

// Adapter is the egress adapter.
type Adapter struct {
	cfg      Config
	client   *http.Client
	messages services.Messages
	quotas   services.Quotas
}

// New builds the adapter.
func New(cfg Config) *Adapter {
	if cfg.Guard == nil {
		cfg.Guard = &netguard.Guard{}
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 20 * time.Second
	}
	if cfg.MaxBody <= 0 {
		cfg.MaxBody = 5 << 20
	}
	return &Adapter{cfg: cfg, client: cfg.Guard.Client(cfg.Timeout)}
}

func (a *Adapter) Manifest() kernel.Manifest {
	return kernel.Manifest{Name: "egress", Version: "0.4.0", Kind: kernel.KindAdapter, DependsOn: []string{"ingest", "ledger"}}
}

var fetchOut = schema.Object(
	schema.Req("id", schema.UUID().Doc("The stored message. Its verdict arrives in your feed.")),
	schema.Req("url", schema.String().Doc("The final URL after redirects.")),
	schema.Req("status", schema.Integer()), schema.Req("content_type", schema.String()), schema.Req("bytes", schema.Integer()),
	schema.Req("truncated", schema.Boolean()), schema.Req("body_md", schema.String()))

func (a *Adapter) Register(r *kernel.Registry) error {
	var err error
	if a.messages, err = kernel.Resolve[services.Messages](r); err != nil {
		return err
	}
	if a.quotas, err = kernel.Resolve[services.Quotas](r); err != nil {
		return err
	}
	r.Route(kernel.Route{Method: "POST", Path: "/v1/egress/fetch", OperationID: "egressFetch",
		Summary: "Fetch a public http(s) URL through EM2. The content is kept as a message to you with an unknown emotional state.",
		Tags:    []string{"egress"}, Auth: kernel.AuthPrincipal, Scope: "egress:fetch",
		Body:      schema.Object(schema.Req("url", schema.String().Len(8, 2048))),
		Responses: map[int]*schema.Schema{200: fetchOut}, RateLimit: &kernel.RateLimit{Burst: 30, Per: time.Minute}, Handler: a.fetch})
	return nil
}

func (a *Adapter) fetch(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct{ URL string }
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	u, err := url.Parse(in.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return nil, kernel.BadRequest("The URL must be an absolute http or https URL without credentials.")
	}
	if ok, err := a.quotas.Consume(c, c.Principal().ID, services.QuotaEgress); err != nil {
		return nil, err
	} else if !ok {
		return nil, kernel.ErrRateLimited.WithDetail("Your daily egress quota is used up. See GET /v1/me/ledger.")
	}
	hreq, err := http.NewRequestWithContext(c, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, kernel.BadRequest("The URL is not valid.")
	}
	hreq.Header.Set("User-Agent", "Mozilla/5.0 (compatible)")
	hreq.Header.Set("Accept", "text/html, text/markdown, text/plain, application/json;q=0.9, */*;q=0.1")
	resp, err := a.client.Do(hreq)
	if err != nil {
		if errors.Is(err, netguard.ErrBlocked) {
			return nil, kernel.ErrForbidden.WithDetail("The address is not allowed.")
		}
		c.Log().Info("egress fetch failed", "host", u.Hostname(), "error", err)
		return nil, kernel.ErrUpstream
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, a.cfg.MaxBody+1))
	if err != nil {
		return nil, kernel.ErrUpstream
	}
	truncated := int64(len(body)) > a.cfg.MaxBody
	if truncated {
		body = body[:a.cfg.MaxBody]
	}
	final := resp.Request.URL.String()
	ct := resp.Header.Get("Content-Type")
	conv := convert.ToMarkdown(ct, body)
	id, err := a.messages.AcceptDirect(c, services.DirectMessage{Plane: core.PlaneEgress, Sender: *c.Principal(), External: final,
		ReceiverID: c.Principal().ID, BodyMD: conv.Markdown, Mime: ct, Header: claimHeaders(resp.Header)})
	if err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, map[string]any{"id": id, "url": final, "status": resp.StatusCode, "content_type": ct,
		"bytes": len(body), "truncated": truncated || conv.Truncated, "body_md": conv.Markdown}), nil
}

// claimHeaders keeps what the upstream asserted about its content's emotion;
// it is recorded as a claim and never trusted.
func claimHeaders(h http.Header) http.Header {
	out := http.Header{}
	for _, k := range []string{"EM2-Emotion", "EM2-Color"} {
		if v := h.Get(k); v != "" {
			out.Set(k, v)
		}
	}
	return out
}
