package verdict

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/ecbridge"
	"em2.social/em2/pkg/schema"
)

var (
	idParam      = map[string]*schema.Schema{"id": schema.UUID()}
	channelParam = map[string]*schema.Schema{"channel_id": schema.UUID()}
	pageQuery    = schema.Object(schema.Opt("cursor", schema.String().Len(1, 200)), schema.Opt("limit", schema.Integer().Range(1, 50)))
	ecSchema     = schema.Object(schema.Req("emotion", schema.Enum(core.EmotionNames()...)), schema.Req("color", schema.Enum(core.ColorNames()...)))
	principalV   = schema.Object(schema.Req("id", schema.UUID()), schema.Req("handle", schema.String()), schema.Req("kind", schema.String()))
	messageV     = schema.Object(schema.Req("id", schema.UUID()), schema.Req("plane", schema.String()), schema.Opt("channel_id", schema.UUID()),
		schema.Opt("receiver_id", schema.UUID()), schema.Opt("parent_id", schema.UUID()), schema.Req("author", principalV),
		schema.Req("at", schema.DateTime()), schema.Opt("state", ecSchema), schema.Req("body_md", schema.String()), schema.Req("body_html", schema.String()))
	verdictV = schema.Object(
		schema.Req("kind", schema.Enum("pass", "shape", "defer", "deny")),
		schema.Opt("score", schema.Number().Doc("Compatibility of the message's state with your bridge. Absent when either is unknown.")),
		schema.Req("threshold", schema.Number()), schema.Req("risk", schema.Number()), schema.Req("reason", schema.String()),
		schema.Req("rule_version", schema.String()),
		schema.Req("shadow", schema.Boolean().Doc("True when EM2 runs in shadow mode: delivered regardless of the verdict.")),
		schema.Req("decided_at", schema.DateTime()), schema.Opt("delivered_at", schema.DateTime()), schema.Opt("released_at", schema.DateTime()),
		schema.Opt("expires_at", schema.DateTime()))
	feedItem = schema.Object(schema.Req("message", messageV), schema.Req("verdict", verdictV.Doc("Your verdict. It is yours alone; the sender never sees it.")))
	stateV   = schema.Object(schema.Opt("state", ecSchema.Doc("Absent when the content's emotion is not known.")),
		schema.Req("version", schema.Integer()), schema.Req("transitions", schema.Integer()))
	transitionV = schema.Object(schema.Req("version", schema.Integer()), schema.Req("from", ecSchema), schema.Req("to", ecSchema),
		schema.Req("contributors", schema.Integer()), schema.Req("trigger_kind", schema.String()), schema.Req("at", schema.DateTime()),
		schema.Opt("trigger_id", schema.UUID().Doc("Shown to observers only.")))
	poolV     = schema.Object(schema.Req("target", ecSchema), schema.Req("pressure", schema.Number()), schema.Req("contributors", schema.Integer()))
	previewIn = schema.Object(schema.Req("receiver", ecSchema.Doc("A bridge to score against.")), schema.Req("message", ecSchema.Doc("A message state.")),
		schema.Opt("actor", ecSchema.Doc("An actor stance, to see where an interaction would pull the message.")),
		schema.Opt("threshold", schema.Number().Range(0, 1)))
	previewOut = schema.Object(schema.Req("score", schema.Number()), schema.Req("threshold", schema.Number()), schema.Req("fits", schema.Boolean()),
		schema.Req("explanation", schema.String()), schema.Opt("target", ecSchema), schema.Req("rule_version", schema.String()))
)

func page(item *schema.Schema) *schema.Schema {
	return schema.Object(schema.Req("items", schema.Array(item)), schema.Opt("next_cursor", schema.String()))
}

func (m *Module) routes() []kernel.Route {
	feed, msgs, bridge := []string{"feed"}, []string{"messages"}, []string{"bridge"}
	return []kernel.Route{
		{Method: "GET", Path: "/v1/me/subscriptions", OperationID: "listSubscriptions", Summary: "Channels I subscribe to", Tags: feed,
			Auth: kernel.AuthPrincipal, Responses: map[int]*schema.Schema{200: schema.Object(schema.Req("items", schema.Array(
				schema.Object(schema.Req("channel_id", schema.UUID()), schema.Req("created_at", schema.DateTime())))))}, Handler: m.listSubscriptions},
		{Method: "PUT", Path: "/v1/me/subscriptions/{channel_id}", OperationID: "subscribe", Summary: "Subscribe to a channel: its new messages are offered to me", Tags: feed,
			Auth: kernel.AuthPrincipal, Scope: "feed:read", Params: channelParam, Responses: map[int]*schema.Schema{204: nil}, Handler: m.subscribe},
		{Method: "DELETE", Path: "/v1/me/subscriptions/{channel_id}", OperationID: "unsubscribe", Summary: "Unsubscribe from a channel", Tags: feed,
			Auth: kernel.AuthPrincipal, Scope: "feed:read", Params: channelParam, Responses: map[int]*schema.Schema{204: nil}, Handler: m.unsubscribe},
		{Method: "GET", Path: "/v1/me/feed", OperationID: "getFeed", Summary: "Messages delivered to me, newest first, each with my verdict", Tags: feed,
			Auth: kernel.AuthPrincipal, Scope: "feed:read", Query: pageQuery, Responses: map[int]*schema.Schema{200: page(feedItem)}, Handler: m.feed},
		{Method: "GET", Path: "/v1/me/deferred", OperationID: "getDeferred", Summary: "Messages held back from me because they do not fit my bridge", Tags: feed,
			Auth: kernel.AuthPrincipal, Scope: "feed:read", Query: pageQuery, Responses: map[int]*schema.Schema{200: page(feedItem)}, Handler: m.deferred},

		{Method: "PUT", Path: "/v1/messages/{id}/braces/me", OperationID: "brace", Summary: "Brace a message (pulls it toward my bridge)", Tags: msgs,
			Auth: kernel.AuthPrincipal, Scope: "brace", Params: idParam, Responses: map[int]*schema.Schema{204: nil},
			RateLimit: &kernel.RateLimit{Burst: 120, Per: time.Hour}, Handler: m.brace},
		{Method: "DELETE", Path: "/v1/messages/{id}/braces/me", OperationID: "unbrace", Summary: "Remove my brace", Tags: msgs,
			Auth: kernel.AuthPrincipal, Scope: "brace", Params: idParam, Responses: map[int]*schema.Schema{204: nil}, Handler: m.unbrace},
		{Method: "GET", Path: "/v1/messages/{id}/bridge", OperationID: "getMessageBridge", Summary: "A message's current emotional state", Tags: bridge,
			Auth: kernel.AuthPrincipal, Params: idParam, Responses: map[int]*schema.Schema{200: stateV}, Handler: m.messageState},
		{Method: "GET", Path: "/v1/messages/{id}/bridge/transitions", OperationID: "getMessageTransitions", Summary: "How a message's state moved", Tags: bridge,
			Auth: kernel.AuthPrincipal, Params: idParam, Responses: map[int]*schema.Schema{200: schema.Object(schema.Req("items", schema.Array(transitionV)))}, Handler: m.transitions},
		{Method: "GET", Path: "/v1/messages/{id}/bridge/pressure", OperationID: "getMessagePressure",
			Summary: "Pending pressure on a message, for its receivers and observers. Counts only, never who.", Tags: bridge,
			Auth: kernel.AuthPrincipal, Params: idParam,
			Responses: map[int]*schema.Schema{200: schema.Object(schema.Req("theta", schema.Number()), schema.Req("pools", schema.Array(poolV)))}, Handler: m.pressure},
		{Method: "POST", Path: "/v1/bridge/preview", OperationID: "previewBridge",
			Summary: "Compute a score and a target with the public rules, on values you supply", Tags: bridge,
			Body: previewIn, Responses: map[int]*schema.Schema{200: previewOut}, RateLimit: &kernel.RateLimit{Burst: 120, Per: time.Minute}, Handler: m.preview},
		{Method: "GET", Path: "/v1/bridge/rulesets/active", OperationID: "getActiveRuleset", Summary: "The ECBridge and verdict rules in force", Tags: bridge,
			Responses: map[int]*schema.Schema{200: schema.OpenObject(schema.Req("version", schema.String()))}, Handler: m.ruleset},
	}
}

func (m *Module) listSubscriptions(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	rows, err := c.DB().Query(c, `SELECT channel_id, created_at FROM subscriptions WHERE principal_id = $1 ORDER BY created_at DESC LIMIT 500`, c.Principal().ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type sub struct {
		ChannelID string    `json:"channel_id"`
		CreatedAt time.Time `json:"created_at"`
	}
	items := []sub{}
	for rows.Next() {
		var s sub
		if err := rows.Scan(&s.ChannelID, &s.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, s)
	}
	return kernel.JSON(http.StatusOK, map[string]any{"items": items}), rows.Err()
}

// subscribe is idempotent and accepts any channel id, so it reveals nothing
// about which channels exist.
func (m *Module) subscribe(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	_, err := c.DB().Exec(c, `INSERT INTO subscriptions (principal_id, channel_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		c.Principal().ID, req.Params["channel_id"], c.Now())
	return kernel.NoContent(), err
}

func (m *Module) unsubscribe(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	_, err := c.DB().Exec(c, `DELETE FROM subscriptions WHERE principal_id = $1 AND channel_id = $2`, c.Principal().ID, req.Params["channel_id"])
	return kernel.NoContent(), err
}

type verdictOut struct {
	Kind        string     `json:"kind"`
	Score       *float64   `json:"score,omitempty"`
	Threshold   float64    `json:"threshold"`
	Risk        float64    `json:"risk"`
	Reason      string     `json:"reason"`
	RuleVersion string     `json:"rule_version"`
	Shadow      bool       `json:"shadow"`
	DecidedAt   time.Time  `json:"decided_at"`
	DeliveredAt *time.Time `json:"delivered_at,omitempty"`
	ReleasedAt  *time.Time `json:"released_at,omitempty"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
}

type feedOut struct {
	Message services.MessageView `json:"message"`
	Verdict verdictOut           `json:"verdict"`
}

func round(f float64) float64 { return float64(int64(f*1e4+0.5)) / 1e4 }

func encodeCursor(at time.Time, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(at.UTC().Format(time.RFC3339Nano) + "|" + id))
}

func decodeCursor(s string) (time.Time, string, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return time.Time{}, "", err
	}
	ts, id, ok := strings.Cut(string(b), "|")
	if !ok {
		return time.Time{}, "", errors.New("bad cursor")
	}
	at, err := time.Parse(time.RFC3339Nano, ts)
	return at, id, err
}

// list pages the caller's exchanges ordered by the given time column.
func (m *Module) list(c kernel.Ctx, req *kernel.Request, where, orderCol string) (*kernel.Response, error) {
	limit := 20
	if v := req.Query.Get("limit"); v != "" {
		limit, _ = strconv.Atoi(v)
	}
	args := []any{c.Principal().ID, limit + 1}
	cond := ""
	if cur := req.Query.Get("cursor"); cur != "" {
		at, id, err := decodeCursor(cur)
		if err != nil {
			return nil, kernel.BadRequest("The cursor is not valid.")
		}
		cond = ` AND (` + orderCol + `, id) < ($3, $4::uuid)`
		args = append(args, at, id)
	}
	rows, err := c.DB().Query(c, `SELECT id, message_id, kind, score, threshold, risk, reason, rule_version, shadow, decided_at,
		delivered_at, released_at, expires_at, `+orderCol+` FROM exchanges WHERE receiver_id = $1 AND `+where+cond+`
		ORDER BY `+orderCol+` DESC, id DESC LIMIT $2`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type row struct {
		id, msg string
		v       verdictOut
		key     time.Time
	}
	var list []row
	var ids []string
	for rows.Next() {
		var r row
		var score *float32
		var th, risk float32
		if err := rows.Scan(&r.id, &r.msg, &r.v.Kind, &score, &th, &risk, &r.v.Reason, &r.v.RuleVersion, &r.v.Shadow, &r.v.DecidedAt,
			&r.v.DeliveredAt, &r.v.ReleasedAt, &r.v.ExpiresAt, &r.key); err != nil {
			return nil, err
		}
		if score != nil {
			s := round(float64(*score))
			r.v.Score = &s
		}
		r.v.Threshold, r.v.Risk = round(float64(th)), round(float64(risk))
		list = append(list, r)
		ids = append(ids, r.msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	views, err := m.messages.Views(c, ids)
	if err != nil {
		return nil, err
	}
	body := map[string]any{}
	if len(list) > limit {
		list = list[:limit]
		last := list[len(list)-1]
		body["next_cursor"] = encodeCursor(last.key, last.id)
	}
	items := []feedOut{}
	for _, r := range list {
		if v, ok := views[r.msg]; ok {
			items = append(items, feedOut{Message: v, Verdict: r.v})
		}
	}
	body["items"] = items
	return kernel.JSON(http.StatusOK, body), nil
}

func (m *Module) feed(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	return m.list(c, req, `delivered_at IS NOT NULL`, "delivered_at")
}

func (m *Module) deferred(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	return m.list(c, req, `state = 'deferred'`, "decided_at")
}

// readable reports whether the principal may read the message: channel
// messages are readable by every principal, direct ones by their two ends.
func (m *Module) readable(c kernel.Ctx, id string) (bool, error) {
	p := c.Principal()
	var ok bool
	err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM messages WHERE message_id = $1
		AND (channel_id IS NOT NULL OR author_id = $2 OR receiver_id = $2 OR $3))`, id, p.ID, observer(p)).Scan(&ok)
	return ok, err
}

func observer(p *core.Principal) bool { return p.HasRole("observer") || p.HasRole("admin") }

type brace struct {
	added  float64
	target core.EC
}

func (m *Module) brace(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	id, p := req.Params["id"], c.Principal()
	ok, err := m.readable(c, id)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, kernel.ErrNotFound
	}
	var exists bool
	if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM braces WHERE message_id = $1 AND actor_id = $2)`, id, p.ID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists {
		return kernel.NoContent(), nil
	}
	stance, err := m.stances.Stance(c, p.ID)
	if err != nil {
		return nil, err
	}
	out, err := m.interact(c, id, p.ID, p.Kind == core.KindAgent, stance, ecbridge.KindBrace, nil)
	if err != nil {
		return nil, err
	}
	added := 0.0
	if out.Effect == "added" && !out.Committed {
		added = out.Added
	}
	_, err = c.DB().Exec(c, `INSERT INTO braces (message_id, actor_id, added, target_emotion, target_color, at) VALUES ($1, $2, $3, $4, $5, $6)`,
		id, p.ID, added, int16(out.Target.Emotion), int16(out.Target.Color), c.Now())
	return kernel.NoContent(), err
}

func (m *Module) unbrace(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	id, p := req.Params["id"], c.Principal()
	var b brace
	var e, col int16
	err := c.DB().QueryRow(c, `DELETE FROM braces WHERE message_id = $1 AND actor_id = $2 RETURNING added, target_emotion, target_color`, id, p.ID).
		Scan(&b.added, &e, &col)
	if kernel.IsNoRows(err) {
		return kernel.NoContent(), nil
	}
	if err != nil {
		return nil, err
	}
	b.target = core.EC{Emotion: core.Emotion(e), Color: core.Color(col)}
	_, err = m.interact(c, id, p.ID, p.Kind == core.KindAgent, nil, ecbridge.KindUnbrace, &b)
	return kernel.NoContent(), err
}

func (m *Module) messageState(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	id := req.Params["id"]
	ok, err := m.readable(c, id)
	if err != nil || !ok {
		return nil, notFoundOr(err)
	}
	var e, col *int16
	var version, transitions int
	if err := c.DB().QueryRow(c, `SELECT emotion, color, version, transitions FROM messages WHERE message_id = $1`, id).Scan(&e, &col, &version, &transitions); err != nil {
		return nil, err
	}
	body := map[string]any{"version": version, "transitions": transitions}
	if s := ecFrom(e, col); s != nil {
		body["state"] = s
	}
	return kernel.JSON(http.StatusOK, body), nil
}

func notFoundOr(err error) error {
	if err != nil {
		return err
	}
	return kernel.ErrNotFound
}

func (m *Module) transitions(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	id := req.Params["id"]
	ok, err := m.readable(c, id)
	if err != nil || !ok {
		return nil, notFoundOr(err)
	}
	rows, err := c.DB().Query(c, `SELECT version, from_emotion, from_color, to_emotion, to_color, contributors, trigger_id, trigger_kind, at
		FROM transitions WHERE message_id = $1 ORDER BY version`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type tOut struct {
		Version      int       `json:"version"`
		From         core.EC   `json:"from"`
		To           core.EC   `json:"to"`
		Contributors int       `json:"contributors"`
		TriggerKind  string    `json:"trigger_kind"`
		At           time.Time `json:"at"`
		TriggerID    string    `json:"trigger_id,omitempty"`
	}
	obs := observer(c.Principal())
	items := []tOut{}
	for rows.Next() {
		var t tOut
		var fe, fc, te, tc int16
		var trigger string
		if err := rows.Scan(&t.Version, &fe, &fc, &te, &tc, &t.Contributors, &trigger, &t.TriggerKind, &t.At); err != nil {
			return nil, err
		}
		t.From = core.EC{Emotion: core.Emotion(fe), Color: core.Color(fc)}
		t.To = core.EC{Emotion: core.Emotion(te), Color: core.Color(tc)}
		if obs {
			t.TriggerID = trigger
		}
		items = append(items, t)
	}
	return kernel.JSON(http.StatusOK, map[string]any{"items": items}), rows.Err()
}

// pressure shows pending pressure to the message's receivers and observers,
// as counts: who pushed is never shown.
func (m *Module) pressure(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	id, p := req.Params["id"], c.Principal()
	var ok bool
	if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM messages WHERE message_id = $1 AND ($3
		OR EXISTS (SELECT 1 FROM exchanges WHERE message_id = $1 AND receiver_id = $2 AND delivered_at IS NOT NULL)))`, id, p.ID, observer(p)).Scan(&ok); err != nil {
		return nil, err
	}
	if !ok {
		return nil, kernel.ErrNotFound
	}
	var pj []byte
	if err := c.DB().QueryRow(c, `SELECT pools FROM messages WHERE message_id = $1`, id).Scan(&pj); err != nil {
		return nil, err
	}
	var pools []ecbridge.Pool
	if err := json.Unmarshal(pj, &pools); err != nil {
		return nil, err
	}
	type poolOut struct {
		Target       core.EC `json:"target"`
		Pressure     float64 `json:"pressure"`
		Contributors int     `json:"contributors"`
	}
	out := []poolOut{}
	for _, pl := range pools {
		out = append(out, poolOut{Target: pl.Target, Pressure: round(pl.Pressure), Contributors: len(pl.Contributors)})
	}
	return kernel.JSON(http.StatusOK, map[string]any{"theta": m.rules.Theta, "pools": out}), nil
}

func (m *Module) preview(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct {
		Receiver  core.EC  `json:"receiver"`
		Message   core.EC  `json:"message"`
		Actor     *core.EC `json:"actor"`
		Threshold *float64 `json:"threshold"`
	}
	if err := req.Decode(&in); err != nil {
		return nil, kernel.BadRequest("Unknown emotion or color.")
	}
	tau := m.rules.Threshold
	if in.Threshold != nil {
		tau = *in.Threshold
	}
	f := ecbridge.Compat(in.Receiver, in.Message, m.rules.WEmotion)
	body := map[string]any{"score": f, "threshold": tau, "fits": f >= tau, "rule_version": m.rules.Version,
		"explanation": ecbridge.Explain(in.Receiver, in.Message, tau, m.rules.WEmotion)}
	if in.Actor != nil {
		body["target"] = ecbridge.Target(*in.Actor, in.Message)
	}
	return kernel.JSON(http.StatusOK, body), nil
}

func (m *Module) ruleset(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	return &kernel.Response{Status: http.StatusOK, Body: m.rules, Headers: map[string]string{"Cache-Control": "public, max-age=300"}}, nil
}
