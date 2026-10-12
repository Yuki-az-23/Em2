package ledger

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/schema"
)

var (
	settingsView = schema.Object(
		schema.Req("threshold", schema.Number().Range(0, 1).Doc("Messages scoring below this against your bridge are deferred.")),
		schema.Req("threshold_is_default", schema.Boolean()),
		schema.Req("filter", schema.Boolean().Doc("When false nothing is deferred; verdicts are still computed and shown to you.")),
		schema.Req("card", schema.Enum("emotion", "hidden").Doc("Whether your public card shows your current emotion.")))
	settingsBody = schema.Object(
		schema.Opt("threshold", schema.Number().Range(0, 1).OrNull().Doc("null restores the default.")),
		schema.Opt("filter", schema.Boolean()),
		schema.Opt("card", schema.Enum("emotion", "hidden")))
	endpointView = schema.Object(schema.Req("url", schema.String()), schema.Req("updated_at", schema.DateTime()))
	endpointBody = schema.Object(schema.Req("url", schema.String().Len(8, 2048).Doc("http or https URL EM2 forwards your delivered ingress requests to.")))
	idParam      = map[string]*schema.Schema{"id": schema.UUID()}
)

func (m *Module) settingsRoutes(r *kernel.Registry) {
	tags := []string{"settings"}
	r.Route(kernel.Route{Method: "GET", Path: "/v1/me/settings", OperationID: "getSettings", Summary: "My receiver settings", Tags: tags,
		Auth: kernel.AuthPrincipal, Responses: map[int]*schema.Schema{200: settingsView}, Handler: m.getSettings})
	r.Route(kernel.Route{Method: "PATCH", Path: "/v1/me/settings", OperationID: "updateSettings", Summary: "Change my receiver settings", Tags: tags,
		Auth: kernel.AuthPrincipal, Scope: "bridge:write", Body: settingsBody, Responses: map[int]*schema.Schema{200: settingsView}, Handler: m.patchSettings})
	r.Route(kernel.Route{Method: "PUT", Path: "/v1/me/blocks/{id}", OperationID: "blockPrincipal", Summary: "Block a principal: their messages to you are denied", Tags: tags,
		Auth: kernel.AuthPrincipal, Scope: "bridge:write", Params: idParam, Responses: map[int]*schema.Schema{204: nil}, Handler: m.block})
	r.Route(kernel.Route{Method: "DELETE", Path: "/v1/me/blocks/{id}", OperationID: "unblockPrincipal", Summary: "Unblock a principal", Tags: tags,
		Auth: kernel.AuthPrincipal, Scope: "bridge:write", Params: idParam, Responses: map[int]*schema.Schema{204: nil}, Handler: m.unblock})
	r.Route(kernel.Route{Method: "GET", Path: "/v1/me/endpoint", OperationID: "getEndpoint", Summary: "My ingress upstream", Tags: []string{"ingress"},
		Auth: kernel.AuthPrincipal, Responses: map[int]*schema.Schema{200: endpointView}, Handler: m.getEndpoint})
	r.Route(kernel.Route{Method: "PUT", Path: "/v1/me/endpoint", OperationID: "setEndpoint", Summary: "Register my ingress upstream", Tags: []string{"ingress"},
		Auth: kernel.AuthPrincipal, Scope: "endpoint:write", Body: endpointBody, Responses: map[int]*schema.Schema{200: endpointView}, Handler: m.setEndpoint})
	r.Route(kernel.Route{Method: "DELETE", Path: "/v1/me/endpoint", OperationID: "deleteEndpoint", Summary: "Remove my ingress upstream", Tags: []string{"ingress"},
		Auth: kernel.AuthPrincipal, Scope: "endpoint:write", Responses: map[int]*schema.Schema{204: nil}, Handler: m.deleteEndpoint})
}

type settingsOut struct {
	Threshold          float64 `json:"threshold"`
	ThresholdIsDefault bool    `json:"threshold_is_default"`
	Filter             bool    `json:"filter"`
	Card               string  `json:"card"`
}

func (m *Module) readSettings(c kernel.Ctx, id string) (settingsOut, error) {
	out := settingsOut{Threshold: m.cfg.DefaultThreshold, ThresholdIsDefault: true, Filter: true, Card: "emotion"}
	var th *float32
	err := c.DB().QueryRow(c, `SELECT threshold, filter, card FROM settings WHERE principal_id = $1`, id).Scan(&th, &out.Filter, &out.Card)
	if kernel.IsNoRows(err) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	if th != nil {
		out.Threshold, out.ThresholdIsDefault = round2(float64(*th)), false
	}
	return out, nil
}

func round2(f float64) float64 { return float64(int(f*100+0.5)) / 100 }

func (m *Module) getSettings(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	s, err := m.readSettings(c, c.Principal().ID)
	if err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, s), nil
}

func (m *Module) patchSettings(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in map[string]json.RawMessage
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	id := c.Principal().ID
	cur, err := m.readSettings(c, id)
	if err != nil {
		return nil, err
	}
	var th *float64
	if !cur.ThresholdIsDefault {
		v := cur.Threshold
		th = &v
	}
	if raw, ok := in["threshold"]; ok {
		th = nil
		if string(raw) != "null" {
			var v float64
			if err := json.Unmarshal(raw, &v); err != nil {
				return nil, kernel.BadRequest("threshold must be a number between 0 and 1, or null.")
			}
			th = &v
		}
	}
	filter, card := cur.Filter, cur.Card
	if raw, ok := in["filter"]; ok {
		_ = json.Unmarshal(raw, &filter)
	}
	if raw, ok := in["card"]; ok {
		_ = json.Unmarshal(raw, &card)
	}
	if _, err := c.DB().Exec(c, `INSERT INTO settings (principal_id, threshold, filter, card, updated_at) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (principal_id) DO UPDATE SET threshold = EXCLUDED.threshold, filter = EXCLUDED.filter, card = EXCLUDED.card,
			updated_at = EXCLUDED.updated_at`,
		id, th, filter, card, c.Now()); err != nil {
		return nil, err
	}
	if err := c.Publish(EventSettingsUpdated, map[string]string{"principal_id": id}); err != nil {
		return nil, err
	}
	s, err := m.readSettings(c, id)
	if err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, s), nil
}

// block is idempotent. Blocking an unknown id is accepted the same way, so
// the endpoint cannot be used to discover which ids exist.
func (m *Module) block(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	p := c.Principal()
	if req.Params["id"] == p.ID {
		return nil, kernel.BadRequest("You cannot block yourself.")
	}
	if _, err := c.DB().Exec(c, `INSERT INTO blocks (principal_id, blocked_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		p.ID, req.Params["id"], c.Now()); err != nil {
		return nil, err
	}
	return kernel.NoContent(), nil
}

func (m *Module) unblock(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	if _, err := c.DB().Exec(c, `DELETE FROM blocks WHERE principal_id = $1 AND blocked_id = $2`, c.Principal().ID, req.Params["id"]); err != nil {
		return nil, err
	}
	return kernel.NoContent(), nil
}

// ValidUpstream reports whether u is an acceptable ingress upstream URL. The
// address it resolves to is checked again by the network guard at every dial.
func ValidUpstream(u string) bool {
	p, err := url.Parse(u)
	if err != nil || p.User != nil || p.Host == "" || p.Fragment != "" || p.Opaque != "" {
		return false
	}
	return (p.Scheme == "https" || p.Scheme == "http") && !strings.ContainsAny(u, " \t\r\n")
}

type endpointOut struct {
	URL       string    `json:"url"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (m *Module) getEndpoint(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	var e endpointOut
	err := c.DB().QueryRow(c, `SELECT url, updated_at FROM endpoints WHERE principal_id = $1`, c.Principal().ID).Scan(&e.URL, &e.UpdatedAt)
	if kernel.IsNoRows(err) {
		return nil, kernel.ErrNotFound.WithDetail("No ingress upstream registered. Register one with PUT /v1/me/endpoint.")
	}
	if err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, e), nil
}

func (m *Module) setEndpoint(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct{ URL string }
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	if !ValidUpstream(in.URL) {
		return nil, kernel.BadRequest("The upstream must be an absolute http or https URL without credentials.")
	}
	e := endpointOut{URL: in.URL, UpdatedAt: c.Now()}
	if _, err := c.DB().Exec(c, `INSERT INTO endpoints (principal_id, url, updated_at) VALUES ($1, $2, $3)
		ON CONFLICT (principal_id) DO UPDATE SET url = EXCLUDED.url, updated_at = EXCLUDED.updated_at`, c.Principal().ID, e.URL, e.UpdatedAt); err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, e), nil
}

func (m *Module) deleteEndpoint(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	if _, err := c.DB().Exec(c, `DELETE FROM endpoints WHERE principal_id = $1`, c.Principal().ID); err != nil {
		return nil, err
	}
	return kernel.NoContent(), nil
}

// Receivers implements services.Receivers.
func (m *Module) Receivers(ctx context.Context, ids []string, senderID string) (map[string]services.ReceiverSettings, error) {
	out := make(map[string]services.ReceiverSettings, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	err := m.scope.Tx(ctx, func(c kernel.Ctx) error {
		rows, err := c.DB().Query(c, `SELECT r.id, b.emotion, b.color, s.threshold, COALESCE(s.filter, true),
				EXISTS (SELECT 1 FROM blocks k WHERE k.principal_id = r.id AND k.blocked_id = $2)
			FROM unnest($1::uuid[]) AS r(id)
			LEFT JOIN bridges b ON b.principal_id = r.id
			LEFT JOIN settings s ON s.principal_id = r.id`, ids, senderID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			var e, col *int16
			var th *float32
			var rs services.ReceiverSettings
			if err := rows.Scan(&id, &e, &col, &th, &rs.Filter, &rs.BlocksSender); err != nil {
				return err
			}
			if e != nil && col != nil {
				rs.Bridge = &core.EC{Emotion: core.Emotion(*e), Color: core.Color(*col)}
			}
			rs.Threshold = m.cfg.DefaultThreshold
			if th != nil {
				rs.Threshold = round2(float64(*th))
			}
			out[id] = rs
		}
		return rows.Err()
	})
	return out, err
}

// Endpoint implements services.Endpoints.
func (m *Module) Endpoint(ctx context.Context, principalID string) (*services.Endpoint, error) {
	var out *services.Endpoint
	err := m.scope.Tx(ctx, func(c kernel.Ctx) error {
		var u string
		err := c.DB().QueryRow(c, `SELECT url FROM endpoints WHERE principal_id = $1`, principalID).Scan(&u)
		if kernel.IsNoRows(err) {
			return nil
		}
		if err == nil {
			out = &services.Endpoint{PrincipalID: principalID, URL: u}
		}
		return err
	})
	return out, err
}
