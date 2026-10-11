// Package ledger owns each principal's accountable state. In M2 that is the
// bridge (current emotion/color) and its history; M4 adds settings, quotas,
// reputation, blocks, ingress endpoints and reconciliation.
package ledger

import (
	"context"
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
)

//go:embed migrations/*.sql
var migrations embed.FS

// EventBridgeUpdated is emitted when a principal changes bridge. It is an
// internal event: bridges are never shown to other principals (ADR-011).
const EventBridgeUpdated = "ledger.bridge.updated"

// Module is the ledger module.
type Module struct{ scope *kernel.Scope }

// New builds the module.
func New() *Module { return &Module{} }

func (m *Module) Manifest() kernel.Manifest {
	sub, _ := fs.Sub(migrations, "migrations")
	return kernel.Manifest{Name: "ledger", Version: "0.2.0", Kind: kernel.KindModule, Schema: "ledger", Migrations: sub}
}

var (
	bridgeBody = schema.Object(
		schema.Req("emotion", schema.Enum(core.EmotionNames()...)),
		schema.Req("color", schema.Enum(core.ColorNames()...)),
	)
	bridgeView = schema.Object(
		schema.Req("emotion", schema.Enum(core.EmotionNames()...)),
		schema.Req("color", schema.Enum(core.ColorNames()...)),
		schema.Req("set_at", schema.DateTime()),
		schema.Req("source", schema.String()),
	)
	historyItem = schema.Object(
		schema.Req("emotion", schema.String()), schema.Req("color", schema.String()),
		schema.Req("started_at", schema.DateTime()), schema.Opt("ended_at", schema.DateTime()),
		schema.Opt("duration_seconds", schema.Integer()), schema.Req("source", schema.String()),
	)
)

func (m *Module) Register(r *kernel.Registry) error {
	m.scope = r.Scope()
	r.Provide(services.Stances(m))
	r.Emits(kernel.EventDef{Name: EventBridgeUpdated, Version: 1, Summary: "A principal set a new bridge",
		Schema: schema.Object(schema.Req("principal_id", schema.UUID()), schema.Req("emotion", schema.String()),
			schema.Req("color", schema.String()), schema.Req("source", schema.String()))})
	r.Subscribe("identity.principal.deleted", 1, m.onPrincipalDeleted)
	tags := []string{"bridge"}
	r.Route(kernel.Route{Method: "GET", Path: "/v1/me/bridge", OperationID: "getBridge", Summary: "My current bridge", Tags: tags,
		Auth: kernel.AuthPrincipal, Responses: map[int]*schema.Schema{200: bridgeView}, Handler: m.getBridge})
	r.Route(kernel.Route{Method: "PUT", Path: "/v1/me/bridge", OperationID: "setBridge", Summary: "Set my bridge (emotion and color)", Tags: tags,
		Auth: kernel.AuthPrincipal, Scope: "bridge:write", Body: bridgeBody, Responses: map[int]*schema.Schema{200: bridgeView},
		RateLimit: &kernel.RateLimit{Burst: 30, Per: time.Hour}, Handler: m.setBridge})
	r.Route(kernel.Route{Method: "GET", Path: "/v1/me/bridge/history", OperationID: "getBridgeHistory", Summary: "My last 100 bridges", Tags: tags,
		Auth: kernel.AuthPrincipal, Responses: map[int]*schema.Schema{200: schema.Object(schema.Req("items", schema.Array(historyItem)))}, Handler: m.history})
	return nil
}

type view struct {
	Emotion core.Emotion `json:"emotion"`
	Color   core.Color   `json:"color"`
	SetAt   time.Time    `json:"set_at"`
	Source  string       `json:"source"`
}

func (m *Module) getBridge(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	var v view
	var e, col int16
	err := c.DB().QueryRow(c, `SELECT emotion, color, set_at, source FROM bridges WHERE principal_id = $1`, c.Principal().ID).Scan(&e, &col, &v.SetAt, &v.Source)
	if kernel.IsNoRows(err) {
		return nil, kernel.ErrNotFound.WithDetail("No bridge set yet. Set one with PUT /v1/me/bridge.")
	}
	if err != nil {
		return nil, err
	}
	v.Emotion, v.Color = core.Emotion(e), core.Color(col)
	return kernel.JSON(http.StatusOK, v), nil
}

func (m *Module) setBridge(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in core.EC
	if err := json.Unmarshal(req.Body, &in); err != nil {
		return nil, kernel.BadRequest("Unknown emotion or color.")
	}
	p, now := c.Principal(), c.Now()
	source := "self"
	if p.Kind == core.KindAgent {
		source = "agent"
	}
	if _, err := c.DB().Exec(c, `UPDATE bridge_history SET ended_at = $2 WHERE principal_id = $1 AND ended_at IS NULL`, p.ID, now); err != nil {
		return nil, err
	}
	if _, err := c.DB().Exec(c, `INSERT INTO bridge_history (principal_id, emotion, color, started_at, source) VALUES ($1, $2, $3, $4, $5)`,
		p.ID, int16(in.Emotion), int16(in.Color), now, source); err != nil {
		return nil, err
	}
	if _, err := c.DB().Exec(c, `INSERT INTO bridges (principal_id, emotion, color, set_at, source) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (principal_id) DO UPDATE SET emotion = EXCLUDED.emotion, color = EXCLUDED.color, set_at = EXCLUDED.set_at, source = EXCLUDED.source`,
		p.ID, int16(in.Emotion), int16(in.Color), now, source); err != nil {
		return nil, err
	}
	if err := c.Publish(EventBridgeUpdated, map[string]string{"principal_id": p.ID, "emotion": in.Emotion.String(), "color": in.Color.String(), "source": source}); err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, view{Emotion: in.Emotion, Color: in.Color, SetAt: now, Source: source}), nil
}

type historyView struct {
	Emotion   core.Emotion `json:"emotion"`
	Color     core.Color   `json:"color"`
	StartedAt time.Time    `json:"started_at"`
	EndedAt   *time.Time   `json:"ended_at,omitempty"`
	Duration  *int64       `json:"duration_seconds,omitempty"`
	Source    string       `json:"source"`
}

func (m *Module) history(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	rows, err := c.DB().Query(c, `SELECT emotion, color, started_at, ended_at, source FROM bridge_history
		WHERE principal_id = $1 ORDER BY started_at DESC, id DESC LIMIT 100`, c.Principal().ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []historyView{}
	for rows.Next() {
		var h historyView
		var e, col int16
		if err := rows.Scan(&e, &col, &h.StartedAt, &h.EndedAt, &h.Source); err != nil {
			return nil, err
		}
		h.Emotion, h.Color = core.Emotion(e), core.Color(col)
		if h.EndedAt != nil {
			d := int64(h.EndedAt.Sub(h.StartedAt).Seconds())
			h.Duration = &d
		}
		items = append(items, h)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, map[string]any{"items": items}), nil
}

// onPrincipalDeleted erases the deleted principal's bridge and history.
func (m *Module) onPrincipalDeleted(c kernel.Ctx, e kernel.Envelope) error {
	var p struct {
		PrincipalID string `json:"principal_id"`
	}
	if err := json.Unmarshal(e.Payload, &p); err != nil {
		return err
	}
	if _, err := c.DB().Exec(c, `DELETE FROM bridges WHERE principal_id = $1`, p.PrincipalID); err != nil {
		return err
	}
	_, err := c.DB().Exec(c, `DELETE FROM bridge_history WHERE principal_id = $1`, p.PrincipalID)
	return err
}

// Stance implements services.Stances. It runs in the ledger's own scope.
func (m *Module) Stance(ctx context.Context, principalID string) (*core.EC, error) {
	var ec *core.EC
	err := m.scope.Tx(ctx, func(c kernel.Ctx) error {
		var e, col int16
		err := c.DB().QueryRow(c, `SELECT emotion, color FROM bridges WHERE principal_id = $1`, principalID).Scan(&e, &col)
		if kernel.IsNoRows(err) {
			return nil
		}
		if err != nil {
			return err
		}
		ec = &core.EC{Emotion: core.Emotion(e), Color: core.Color(col)}
		return nil
	})
	return ec, err
}
