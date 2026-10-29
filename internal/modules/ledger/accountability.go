package ledger

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
)

// Events consumed from the verdict module.
const (
	eventDecided = "verdict.exchange.decided"
	eventProbe   = "verdict.probe.detected"
)

var (
	quotaV          = schema.Object(schema.Req("per", schema.Enum("hour", "day")), schema.Req("limit", schema.Integer()), schema.Req("used", schema.Integer()))
	selfLedgerProps = []schema.Prop{
		schema.Req("principal_id", schema.UUID()), schema.Req("at", schema.DateTime()),
		schema.Opt("bridge", bridgeView),
		schema.Req("settings", settingsView),
		schema.Req("quotas", schema.Object(schema.Req("messages", quotaV), schema.Req("egress", quotaV))),
	}
	selfLedgerView = schema.Object(selfLedgerProps...)
	reputationV    = schema.Object(schema.Req("passes", schema.Integer()), schema.Req("shapes", schema.Integer()),
		schema.Req("defers", schema.Integer()), schema.Req("denies", schema.Integer()), schema.Req("probes", schema.Integer()),
		schema.Req("standing", schema.Number().Range(0, 1).Doc("Reputation: passes and half the shapes against denies, from 0 to 1.")), schema.Req("quota_factor", schema.Number().Range(0, 1)))
	penaltyV = schema.Object(schema.Req("reason", schema.String()), schema.Req("factor", schema.Number()), schema.Req("until", schema.DateTime()))
	// ObserverLedgerView is the full snapshot: what observers see and what the
	// snapshot job stores.
	ObserverLedgerView = schema.Object(append(append([]schema.Prop{}, selfLedgerProps...),
		schema.Req("reputation", reputationV), schema.Req("penalties", schema.Array(penaltyV)))...)
	cardView = schema.Object(schema.Req("id", schema.UUID()), schema.Req("handle", schema.String()), schema.Req("kind", schema.String()),
		schema.Opt("emotion", schema.Enum(core.EmotionNames()...).Doc("The principal's current emotion, unless they hide it. Never the color or the threshold.")))
)

func (m *Module) accountabilityRoutes(r *kernel.Registry) {
	r.Route(kernel.Route{Method: "GET", Path: "/v1/me/ledger", OperationID: "getMyLedger",
		Summary: "My ledger snapshot: bridge, settings and quotas with what I used", Tags: []string{"ledger"},
		Auth: kernel.AuthPrincipal, Responses: map[int]*schema.Schema{200: selfLedgerView}, Handler: m.myLedger})
	r.Route(kernel.Route{Method: "GET", Path: "/v1/principals/{id}", OperationID: "getPrincipalCard",
		Summary: "A principal's public card", Tags: []string{"principals"},
		Auth: kernel.AuthPrincipal, Params: idParam, Responses: map[int]*schema.Schema{200: cardView}, Handler: m.card})
	r.Route(kernel.Route{Method: "GET", Path: "/v1/principals/{id}/ledger", OperationID: "getPrincipalLedger",
		Summary: "A principal's full ledger snapshot, with reputation. Observers only.", Tags: []string{"ledger"},
		Auth: kernel.AuthPrincipal, Params: idParam, Responses: map[int]*schema.Schema{200: ObserverLedgerView}, Handler: m.observerLedger})
}

// window returns the start of the current quota window.
func window(kind services.QuotaKind, now time.Time) (time.Time, string) {
	now = now.UTC()
	if kind == services.QuotaEgress {
		return now.Truncate(24 * time.Hour), "day"
	}
	return now.Truncate(time.Hour), "hour"
}

type reputation struct {
	Passes      int     `json:"passes"`
	Shapes      int     `json:"shapes"`
	Defers      int     `json:"defers"`
	Denies      int     `json:"denies"`
	Probes      int     `json:"probes"`
	Score       float64 `json:"standing"`
	QuotaFactor float64 `json:"quota_factor"`
}

// score weighs passes fully and shapes half against denies; defers are
// neutral (a far receiver is not misbehaviour). Until minOutcomes outcomes
// exist the quota factor stays 1.
func (m *Module) score(r *reputation) {
	total := r.Passes + r.Shapes + r.Denies
	r.Score = (float64(r.Passes) + 0.5*float64(r.Shapes) + 1) / float64(total+2)
	r.Score = math.Round(r.Score*1000) / 1000
	r.QuotaFactor = 1
	if total >= m.cfg.MinOutcomes {
		r.QuotaFactor = math.Max(0.25, math.Min(1, 2*r.Score))
	}
}

func (m *Module) readReputation(c kernel.Ctx, id string) (reputation, error) {
	var r reputation
	err := c.DB().QueryRow(c, `SELECT passes, shapes, defers, denies, probes FROM reputation WHERE principal_id = $1`, id).
		Scan(&r.Passes, &r.Shapes, &r.Defers, &r.Denies, &r.Probes)
	if err != nil && !kernel.IsNoRows(err) {
		return r, err
	}
	m.score(&r)
	return r, nil
}

// factor is the multiplier on a principal's base quotas: the lower of the
// reputation factor and any active penalty. In shadow mode reputation and
// penalties are recorded for observers but do not reduce quotas.
func (m *Module) factor(c kernel.Ctx, id string) (float64, error) {
	if c.Mode() != kernel.ModeEnforce {
		return 1, nil
	}
	r, err := m.readReputation(c, id)
	if err != nil {
		return 0, err
	}
	f := r.QuotaFactor
	var p *float32
	if err := c.DB().QueryRow(c, `SELECT min(factor) FROM penalties WHERE principal_id = $1 AND until > $2`, id, c.Now()).Scan(&p); err != nil {
		return 0, err
	}
	if p != nil {
		f = math.Min(f, float64(*p))
	}
	return f, nil
}

func (m *Module) limit(c kernel.Ctx, id string, kind services.QuotaKind) (int, error) {
	f, err := m.factor(c, id)
	if err != nil {
		return 0, err
	}
	base := m.cfg.MessagesPerHour
	if kind == services.QuotaEgress {
		base = m.cfg.EgressPerDay
	}
	return max(1, int(math.Floor(float64(base)*f))), nil
}

// Consume implements services.Quotas.
func (m *Module) Consume(ctx context.Context, id string, kind services.QuotaKind) (bool, error) {
	ok := false
	err := m.scope.Tx(ctx, func(c kernel.Ctx) error {
		lim, err := m.limit(c, id, kind)
		if err != nil {
			return err
		}
		start, _ := window(kind, c.Now())
		var used int
		err = c.DB().QueryRow(c, `INSERT INTO usage (principal_id, kind, window_start, used) VALUES ($1, $2, $3, 1)
			ON CONFLICT (principal_id, kind, window_start) DO UPDATE SET used = usage.used + 1 WHERE usage.used < $4
			RETURNING used`, id, string(kind), start, lim).Scan(&used)
		if kernel.IsNoRows(err) {
			return nil
		}
		if err != nil {
			return err
		}
		ok = true
		return nil
	})
	return ok, err
}

type quotaOut struct {
	Per   string `json:"per"`
	Limit int    `json:"limit"`
	Used  int    `json:"used"`
}

type penaltyOut struct {
	Reason string    `json:"reason"`
	Factor float64   `json:"factor"`
	Until  time.Time `json:"until"`
}

// snapshot builds the ledger view of one principal. full adds reputation and
// penalties, which only observers see: a sender who could watch their own
// deny count would learn receivers' verdicts (ADR-011).
func (m *Module) snapshot(c kernel.Ctx, id string, full bool) (map[string]any, error) {
	out := map[string]any{"principal_id": id, "at": c.Now().UTC()}
	var b view
	var e, col int16
	err := c.DB().QueryRow(c, `SELECT emotion, color, set_at, source FROM bridges WHERE principal_id = $1`, id).Scan(&e, &col, &b.SetAt, &b.Source)
	if err == nil {
		b.Emotion, b.Color = core.Emotion(e), core.Color(col)
		out["bridge"] = b
	} else if !kernel.IsNoRows(err) {
		return nil, err
	}
	s, err := m.readSettings(c, id)
	if err != nil {
		return nil, err
	}
	out["settings"] = s
	quotas := map[string]quotaOut{}
	for name, kind := range map[string]services.QuotaKind{"messages": services.QuotaMessages, "egress": services.QuotaEgress} {
		lim, err := m.limit(c, id, kind)
		if err != nil {
			return nil, err
		}
		start, per := window(kind, c.Now())
		q := quotaOut{Per: per, Limit: lim}
		if err := c.DB().QueryRow(c, `SELECT COALESCE(max(used), 0) FROM usage WHERE principal_id = $1 AND kind = $2 AND window_start = $3`,
			id, string(kind), start).Scan(&q.Used); err != nil {
			return nil, err
		}
		quotas[name] = q
	}
	out["quotas"] = quotas
	if !full {
		return out, nil
	}
	rep, err := m.readReputation(c, id)
	if err != nil {
		return nil, err
	}
	out["reputation"] = rep
	rows, err := c.DB().Query(c, `SELECT reason, factor, until FROM penalties WHERE principal_id = $1 AND until > $2 ORDER BY until DESC`, id, c.Now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	pens := []penaltyOut{}
	for rows.Next() {
		var p penaltyOut
		var f float32
		if err := rows.Scan(&p.Reason, &f, &p.Until); err != nil {
			return nil, err
		}
		p.Factor = round2(float64(f))
		pens = append(pens, p)
	}
	out["penalties"] = pens
	return out, rows.Err()
}

func (m *Module) myLedger(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	s, err := m.snapshot(c, c.Principal().ID, false)
	if err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, s), nil
}

func observer(p *core.Principal) bool { return p.HasRole("observer") || p.HasRole("admin") }

func (m *Module) observerLedger(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	if !observer(c.Principal()) {
		return nil, kernel.ErrNotFound
	}
	dir, err := m.dir.Public(c, []string{req.Params["id"]})
	if err != nil {
		return nil, err
	}
	if _, ok := dir[req.Params["id"]]; !ok {
		return nil, kernel.ErrNotFound
	}
	s, err := m.snapshot(c, req.Params["id"], true)
	if err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, s), nil
}

// card is the public card: handle, kind and, unless hidden, the current
// emotion. Unknown and deleted principals get the same 404.
func (m *Module) card(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	id := req.Params["id"]
	dir, err := m.dir.Public(c, []string{id})
	if err != nil {
		return nil, err
	}
	p, ok := dir[id]
	if !ok || p.Handle == "deleted" {
		return nil, kernel.ErrNotFound
	}
	out := map[string]any{"id": p.ID, "handle": p.Handle, "kind": p.Kind}
	var e *int16
	err = c.DB().QueryRow(c, `SELECT b.emotion FROM bridges b LEFT JOIN settings s ON s.principal_id = b.principal_id
		WHERE b.principal_id = $1 AND COALESCE(s.card, 'emotion') = 'emotion'`, id).Scan(&e)
	if err != nil && !kernel.IsNoRows(err) {
		return nil, err
	}
	if e != nil {
		out["emotion"] = core.Emotion(*e)
	}
	return kernel.JSON(http.StatusOK, out), nil
}

// onDecided records a verdict outcome for the sender's reputation.
func (m *Module) onDecided(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		ExchangeID string    `json:"exchange_id"`
		SenderID   string    `json:"sender_id"`
		Kind       string    `json:"kind"`
		At         time.Time `json:"at"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	col, ok := map[string]string{"pass": "passes", "shape": "shapes", "defer": "defers", "deny": "denies"}[ev.Kind]
	if !ok {
		return fmt.Errorf("ledger: unknown verdict kind %q", ev.Kind)
	}
	tag, err := c.DB().Exec(c, `INSERT INTO outcomes (exchange_id, sender_id, kind, at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
		ev.ExchangeID, ev.SenderID, ev.Kind, ev.At)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	_, err = c.DB().Exec(c, `INSERT INTO reputation (principal_id, `+col+`, updated_at) VALUES ($1, 1, $2)
		ON CONFLICT (principal_id) DO UPDATE SET `+col+` = reputation.`+col+` + 1, updated_at = EXCLUDED.updated_at`, ev.SenderID, c.Now())
	return err
}

// onProbe reduces the quotas of a sender who probed a receiver's threshold.
func (m *Module) onProbe(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		SenderID string `json:"sender_id"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	now := c.Now()
	if _, err := c.DB().Exec(c, `INSERT INTO penalties (principal_id, reason, factor, created_at, until) VALUES ($1, 'probe', $2, $3, $4)`,
		ev.SenderID, m.cfg.ProbePenaltyFactor, now, now.Add(m.cfg.ProbePenaltyFor)); err != nil {
		return err
	}
	_, err := c.DB().Exec(c, `INSERT INTO reputation (principal_id, probes, updated_at) VALUES ($1, 1, $2)
		ON CONFLICT (principal_id) DO UPDATE SET probes = reputation.probes + 1, updated_at = EXCLUDED.updated_at`, ev.SenderID, now)
	return err
}

type counts struct{ passes, shapes, defers, denies, probes int }

// reconcile recomputes every reputation row from the outcomes and penalties
// it was built from, repairs any difference, and records the run. It also
// drops usage windows and penalties that can no longer matter.
func (m *Module) reconcile(c kernel.Ctx) error {
	truth := map[string]*counts{}
	get := func(id string) *counts {
		if truth[id] == nil {
			truth[id] = &counts{}
		}
		return truth[id]
	}
	rows, err := c.DB().Query(c, `SELECT sender_id, kind, count(*) FROM outcomes GROUP BY sender_id, kind`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id, kind string
		var n int
		if err := rows.Scan(&id, &kind, &n); err != nil {
			rows.Close()
			return err
		}
		t := get(id)
		switch kind {
		case "pass":
			t.passes = n
		case "shape":
			t.shapes = n
		case "defer":
			t.defers = n
		case "deny":
			t.denies = n
		}
	}
	rows.Close()
	if rows.Err() != nil {
		return rows.Err()
	}
	if rows, err = c.DB().Query(c, `SELECT principal_id, count(*) FROM penalties WHERE reason = 'probe' GROUP BY principal_id`); err != nil {
		return err
	}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			rows.Close()
			return err
		}
		get(id).probes = n
	}
	rows.Close()
	if rows.Err() != nil {
		return rows.Err()
	}
	stored := map[string]counts{}
	if rows, err = c.DB().Query(c, `SELECT principal_id, passes, shapes, defers, denies, probes FROM reputation`); err != nil {
		return err
	}
	for rows.Next() {
		var id string
		var s counts
		if err := rows.Scan(&id, &s.passes, &s.shapes, &s.defers, &s.denies, &s.probes); err != nil {
			rows.Close()
			return err
		}
		stored[id] = s
		get(id)
	}
	rows.Close()
	if rows.Err() != nil {
		return rows.Err()
	}
	repaired := 0
	now := c.Now()
	for id, t := range truth {
		if s, ok := stored[id]; ok && s == *t {
			continue
		}
		repaired++
		if _, err := c.DB().Exec(c, `INSERT INTO reputation (principal_id, passes, shapes, defers, denies, probes, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (principal_id) DO UPDATE SET passes = EXCLUDED.passes, shapes = EXCLUDED.shapes,
			defers = EXCLUDED.defers, denies = EXCLUDED.denies, probes = EXCLUDED.probes, updated_at = EXCLUDED.updated_at`,
			id, t.passes, t.shapes, t.defers, t.denies, t.probes, now); err != nil {
			return err
		}
	}
	if _, err := c.DB().Exec(c, `INSERT INTO reconciliations (at, checked, repaired) VALUES ($1, $2, $3)`, now, len(truth), repaired); err != nil {
		return err
	}
	if repaired > 0 {
		m.drift.Add(uint64(repaired))
		c.Log().Warn("ledger reconciliation repaired reputation drift", "repaired", repaired, "checked", len(truth))
	}
	if _, err := c.DB().Exec(c, `DELETE FROM usage WHERE window_start < $1`, now.Add(-48*time.Hour)); err != nil {
		return err
	}
	_, err = c.DB().Exec(c, `DELETE FROM penalties WHERE until < $1`, now.Add(-7*24*time.Hour))
	return err
}

// snapshotAll stores the full snapshot of every principal with ledger state.
func (m *Module) snapshotAll(c kernel.Ctx) error {
	rows, err := c.DB().Query(c, `SELECT principal_id FROM bridges UNION SELECT principal_id FROM reputation`)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if rows.Err() != nil {
		return rows.Err()
	}
	for _, id := range ids {
		s, err := m.snapshot(c, id, true)
		if err != nil {
			return err
		}
		body, err := json.Marshal(s)
		if err != nil {
			return err
		}
		if _, err := c.DB().Exec(c, `INSERT INTO snapshots (principal_id, at, body) VALUES ($1, $2, $3)`, id, c.Now(), body); err != nil {
			return err
		}
	}
	return nil
}
