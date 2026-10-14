package identity

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/internal/modules/identity/internal/secret"
	"em2.social/em2/kernel"
)

var (
	errBadCredentials = kernel.ErrUnauthenticated.WithDetail("The email address or password is incorrect.")
	errUnavailable    = kernel.ErrConflict.WithDetail("The email address or handle is not available.")
	errHandleTaken    = kernel.ErrConflict.WithDetail("The handle is not available.")
)

type tokens struct {
	AccessToken      string `json:"access_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshToken     string `json:"refresh_token"`
	RefreshExpiresIn int    `json:"refresh_expires_in"`
}

func userAgent(req *kernel.Request) string {
	ua := req.Header.Get("User-Agent")
	if len(ua) > 200 {
		ua = ua[:200]
	}
	return ua
}

// issueSession creates a session row in family (a new family when empty) and
// returns fresh tokens.
func (m *Module) issueSession(c kernel.Ctx, principalID, family, ua string) (tokens, string, error) {
	now := c.Now()
	refresh, err := secret.NewRefreshToken()
	if err != nil {
		return tokens{}, "", err
	}
	sid := kernel.NewID()
	if family == "" {
		family = sid
	}
	if _, err := c.DB().Exec(c, `INSERT INTO sessions (id, principal_id, family_id, refresh_hash, user_agent, created_at, last_used_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`, sid, principalID, family, m.pepper.Hash(refresh), ua, now, now.Add(m.cfg.RefreshTTL)); err != nil {
		return tokens{}, "", err
	}
	access, err := m.signer.Sign(secret.Claims{Issuer: secret.Issuer, Subject: principalID, SessionID: sid, Kind: string(core.KindHuman),
		IssuedAt: now.Unix(), ExpiresAt: now.Add(m.cfg.AccessTTL).Unix(), ID: kernel.NewID()})
	if err != nil {
		return tokens{}, "", err
	}
	return tokens{AccessToken: access, TokenType: "Bearer", ExpiresIn: int(m.cfg.AccessTTL.Seconds()),
		RefreshToken: refresh, RefreshExpiresIn: int(m.cfg.RefreshTTL.Seconds())}, sid, nil
}

func (m *Module) register(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct{ Email, Password, Handle string }
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	hash, err := secret.HashPassword(in.Password, m.cfg.Argon2)
	if err != nil {
		return nil, err
	}
	id, now := kernel.NewID(), c.Now()
	if _, err := c.DB().Exec(c, `INSERT INTO principals (id, kind, handle, created_at, updated_at) VALUES ($1, 'human', $2, $3, $3)`, id, in.Handle, now); err != nil {
		if kernel.IsUniqueViolation(err) {
			return nil, errUnavailable
		}
		return nil, err
	}
	if _, err := c.DB().Exec(c, `INSERT INTO humans (principal_id, email, password_hash) VALUES ($1, $2, $3)`, id, in.Email, hash); err != nil {
		if kernel.IsUniqueViolation(err) {
			return nil, errUnavailable
		}
		return nil, err
	}
	if err := c.Publish(EventPrincipalRegistered, map[string]string{"principal_id": id, "kind": "human"}); err != nil {
		return nil, err
	}
	tok, _, err := m.issueSession(c, id, "", userAgent(req))
	if err != nil {
		return nil, err
	}
	view := principalView{ID: id, Handle: in.Handle, Kind: core.KindHuman, Email: in.Email, Roles: []string{"user"}, CreatedAt: now}
	return &kernel.Response{Status: http.StatusCreated, Location: "/v1/me", Body: map[string]any{"principal": view, "tokens": tok}}, nil
}

func (m *Module) login(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct{ Email, Password string }
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	var id, hash, status string
	err := c.DB().QueryRow(c, `SELECT p.id, h.password_hash, p.status FROM humans h JOIN principals p ON p.id = h.principal_id
		WHERE lower(h.email) = lower($1)`, in.Email).Scan(&id, &hash, &status)
	if kernel.IsNoRows(err) {
		_, _ = secret.VerifyPassword(in.Password, m.dummy) // same work as a real check
		return nil, errBadCredentials
	}
	if err != nil {
		return nil, err
	}
	ok, err := secret.VerifyPassword(in.Password, hash)
	if err != nil || !ok || status != "active" {
		return nil, errBadCredentials
	}
	tok, _, err := m.issueSession(c, id, "", userAgent(req))
	if err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, tok), nil
}

func (m *Module) refresh(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	if !secret.RefreshWellFormed(in.RefreshToken) {
		return nil, kernel.ErrUnauthenticated
	}
	var sid, pid, family, status string
	var expires time.Time
	var revoked *time.Time
	var replaced *string
	err := c.DB().QueryRow(c, `SELECT s.id, s.principal_id, s.family_id, s.expires_at, s.revoked_at, s.replaced_by, p.status
		FROM sessions s JOIN principals p ON p.id = s.principal_id
		WHERE s.refresh_hash = $1 FOR UPDATE OF s`, m.pepper.Hash(in.RefreshToken)).Scan(&sid, &pid, &family, &expires, &revoked, &replaced, &status)
	if kernel.IsNoRows(err) {
		return nil, kernel.ErrUnauthenticated
	}
	if err != nil {
		return nil, err
	}
	now := c.Now()
	if replaced != nil && revoked == nil {
		// A rotated token came back: someone else holds a copy. Revoke the whole
		// family, commit that, and refuse.
		if _, err := c.DB().Exec(c, `UPDATE sessions SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL`, family, now); err != nil {
			return nil, err
		}
		c.Log().Warn("refresh token reuse detected; session family revoked", "family_id", family)
		return nil, kernel.AfterCommit(kernel.ErrUnauthenticated)
	}
	if revoked != nil || !expires.After(now) || status != "active" {
		return nil, kernel.ErrUnauthenticated
	}
	tok, newSID, err := m.issueSession(c, pid, family, userAgent(req))
	if err != nil {
		return nil, err
	}
	if _, err := c.DB().Exec(c, `UPDATE sessions SET replaced_by = $2, last_used_at = $3 WHERE id = $1`, sid, newSID, now); err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, tok), nil
}

func (m *Module) logout(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	p := c.Principal()
	_, err := c.DB().Exec(c, `UPDATE sessions SET revoked_at = $3 WHERE family_id = (SELECT family_id FROM sessions WHERE id = $1 AND principal_id = $2)
		AND revoked_at IS NULL`, p.SessionID, p.ID, c.Now())
	if err != nil {
		return nil, err
	}
	return kernel.NoContent(), nil
}

type principalView struct {
	ID        string             `json:"id"`
	Handle    string             `json:"handle"`
	Kind      core.PrincipalKind `json:"kind"`
	Email     string             `json:"email,omitempty"`
	Roles     []string           `json:"roles,omitempty"`
	OwnerID   string             `json:"owner_id,omitempty"`
	Scopes    []string           `json:"scopes,omitempty"`
	CreatedAt time.Time          `json:"created_at"`
}

func (m *Module) getMe(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	p := c.Principal()
	v := principalView{ID: p.ID, Handle: p.Handle, Kind: p.Kind}
	switch p.Kind {
	case core.KindHuman:
		if err := c.DB().QueryRow(c, `SELECT h.email, h.roles, p.created_at FROM humans h JOIN principals p ON p.id = h.principal_id
			WHERE p.id = $1`, p.ID).Scan(&v.Email, &v.Roles, &v.CreatedAt); err != nil {
			return nil, err
		}
	default:
		if err := c.DB().QueryRow(c, `SELECT created_at FROM principals WHERE id = $1`, p.ID).Scan(&v.CreatedAt); err != nil {
			return nil, err
		}
		v.OwnerID, v.Scopes = p.OwnerID, p.Scopes
	}
	return kernel.JSON(http.StatusOK, v), nil
}

// deleteMe erases the account's personal data, keeps the handle reserved so
// nobody can re-register it to impersonate, and revokes every credential of
// the human and their agents.
func (m *Module) deleteMe(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	p, now := c.Principal(), c.Now()
	rows, err := c.DB().Query(c, `UPDATE principals SET status = 'deleted', updated_at = $2
		WHERE (id = $1 OR owner_id = $1) AND status <> 'deleted' RETURNING id, kind`, p.ID, now)
	if err != nil {
		return nil, err
	}
	type gone struct{ id, kind string }
	var deleted []gone
	for rows.Next() {
		var g gone
		if err := rows.Scan(&g.id, &g.kind); err != nil {
			rows.Close()
			return nil, err
		}
		deleted = append(deleted, g)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	stmts := []string{
		`UPDATE humans SET email = principal_id::text || '@deleted.invalid', password_hash = '!' WHERE principal_id = $1`,
		`UPDATE sessions SET revoked_at = $2 WHERE principal_id = $1 AND revoked_at IS NULL`,
		`UPDATE agent_keys SET revoked_at = $2 WHERE revoked_at IS NULL AND agent_id IN (SELECT id FROM principals WHERE owner_id = $1)`,
	}
	for _, s := range stmts {
		args := []any{p.ID}
		if strings.Contains(s, "$2") {
			args = append(args, now)
		}
		if _, err := c.DB().Exec(c, s, args...); err != nil {
			return nil, err
		}
	}
	for _, g := range deleted {
		payload := map[string]string{"principal_id": g.id, "kind": g.kind}
		if g.kind == "agent" {
			payload["owner_id"] = p.ID
		}
		if err := c.Publish(EventPrincipalDeleted, payload); err != nil {
			return nil, err
		}
	}
	return kernel.NoContent(), nil
}

type sessionView struct {
	ID         string     `json:"id"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt  time.Time  `json:"expires_at"`
	UserAgent  string     `json:"user_agent"`
	Current    bool       `json:"current"`
}

func (m *Module) listSessions(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	p := c.Principal()
	rows, err := c.DB().Query(c, `SELECT id, created_at, last_used_at, expires_at, user_agent FROM sessions
		WHERE principal_id = $1 AND revoked_at IS NULL AND replaced_by IS NULL AND expires_at > $2
		ORDER BY created_at DESC LIMIT 100`, p.ID, c.Now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []sessionView{}
	for rows.Next() {
		var s sessionView
		if err := rows.Scan(&s.ID, &s.CreatedAt, &s.LastUsedAt, &s.ExpiresAt, &s.UserAgent); err != nil {
			return nil, err
		}
		s.Current = s.ID == p.SessionID
		items = append(items, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, map[string]any{"items": items}), nil
}

func (m *Module) revokeSession(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	p := c.Principal()
	tag, err := c.DB().Exec(c, `UPDATE sessions SET revoked_at = $3 WHERE revoked_at IS NULL AND family_id =
		(SELECT family_id FROM sessions WHERE id = $1 AND principal_id = $2)`, req.Params["id"], p.ID, c.Now())
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, kernel.ErrNotFound
	}
	return kernel.NoContent(), nil
}

type agentView struct {
	ID          string     `json:"id"`
	Handle      string     `json:"handle"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Scopes      []string   `json:"scopes"`
	CreatedAt   time.Time  `json:"created_at"`
	Keys        *[]keyView `json:"keys,omitempty"`
}

type keyView struct {
	ID         string     `json:"id"`
	Lookup     string     `json:"lookup"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
}

const agentColumns = `p.id, p.handle, a.name, a.description, a.scopes, p.created_at`
const ownedAgent = `FROM principals p JOIN agents a ON a.principal_id = p.id WHERE p.owner_id = $1 AND p.status = 'active'`

func (m *Module) loadAgent(c kernel.Ctx, owner, id string) (agentView, error) {
	var v agentView
	err := c.DB().QueryRow(c, `SELECT `+agentColumns+` `+ownedAgent+` AND p.id = $2`, owner, id).
		Scan(&v.ID, &v.Handle, &v.Name, &v.Description, &v.Scopes, &v.CreatedAt)
	if kernel.IsNoRows(err) {
		return v, kernel.ErrNotFound
	}
	return v, err
}

func (m *Module) createAgent(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct {
		Handle, Name, Description string
		Scopes                    []string
	}
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	if len(in.Scopes) == 0 {
		in.Scopes = core.DefaultAgentScopes
	}
	in.Scopes = dedupe(in.Scopes)
	owner := c.Principal().ID
	var n int
	if err := c.DB().QueryRow(c, `SELECT count(*) `+ownedAgent, owner).Scan(&n); err != nil {
		return nil, err
	}
	if n >= m.cfg.MaxAgents {
		return nil, kernel.ErrConflict.WithDetail(fmt.Sprintf("An account can own at most %d agents.", m.cfg.MaxAgents))
	}
	id, now := kernel.NewID(), c.Now()
	if _, err := c.DB().Exec(c, `INSERT INTO principals (id, kind, handle, owner_id, created_at, updated_at) VALUES ($1, 'agent', $2, $3, $4, $4)`,
		id, in.Handle, owner, now); err != nil {
		if kernel.IsUniqueViolation(err) {
			return nil, errHandleTaken
		}
		return nil, err
	}
	if _, err := c.DB().Exec(c, `INSERT INTO agents (principal_id, name, description, scopes) VALUES ($1, $2, $3, $4)`,
		id, in.Name, in.Description, in.Scopes); err != nil {
		return nil, err
	}
	if err := c.Publish(EventPrincipalRegistered, map[string]string{"principal_id": id, "kind": "agent", "owner_id": owner}); err != nil {
		return nil, err
	}
	keys := []keyView{}
	v := agentView{ID: id, Handle: in.Handle, Name: in.Name, Description: in.Description, Scopes: in.Scopes, CreatedAt: now, Keys: &keys}
	return &kernel.Response{Status: http.StatusCreated, Location: "/v1/me/agents/" + id, Body: v}, nil
}

func (m *Module) listAgents(c kernel.Ctx, _ *kernel.Request) (*kernel.Response, error) {
	rows, err := c.DB().Query(c, `SELECT `+agentColumns+` `+ownedAgent+` ORDER BY p.created_at`, c.Principal().ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []agentView{}
	for rows.Next() {
		var v agentView
		if err := rows.Scan(&v.ID, &v.Handle, &v.Name, &v.Description, &v.Scopes, &v.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, map[string]any{"items": items}), nil
}

func (m *Module) getAgent(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	v, err := m.loadAgent(c, c.Principal().ID, req.Params["id"])
	if err != nil {
		return nil, err
	}
	rows, err := c.DB().Query(c, `SELECT id, lookup, created_at, last_used_at, expires_at FROM agent_keys
		WHERE agent_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > $2) ORDER BY created_at`, v.ID, c.Now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []keyView{}
	for rows.Next() {
		var k keyView
		if err := rows.Scan(&k.ID, &k.Lookup, &k.CreatedAt, &k.LastUsedAt, &k.ExpiresAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	v.Keys = &keys
	return kernel.JSON(http.StatusOK, v), nil
}

func (m *Module) updateAgent(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct {
		Name, Description *string
		Scopes            []string
	}
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	v, err := m.loadAgent(c, c.Principal().ID, req.Params["id"])
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		v.Name = *in.Name
	}
	if in.Description != nil {
		v.Description = *in.Description
	}
	if in.Scopes != nil {
		v.Scopes = dedupe(in.Scopes)
	}
	if _, err := c.DB().Exec(c, `UPDATE agents SET name = $2, description = $3, scopes = $4 WHERE principal_id = $1`,
		v.ID, v.Name, v.Description, v.Scopes); err != nil {
		return nil, err
	}
	if _, err := c.DB().Exec(c, `UPDATE principals SET updated_at = $2 WHERE id = $1`, v.ID, c.Now()); err != nil {
		return nil, err
	}
	return kernel.JSON(http.StatusOK, v), nil
}

func (m *Module) deleteAgent(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	owner, now := c.Principal().ID, c.Now()
	v, err := m.loadAgent(c, owner, req.Params["id"])
	if err != nil {
		return nil, err
	}
	if _, err := c.DB().Exec(c, `UPDATE principals SET status = 'deleted', updated_at = $2 WHERE id = $1`, v.ID, now); err != nil {
		return nil, err
	}
	if _, err := c.DB().Exec(c, `UPDATE agent_keys SET revoked_at = $2 WHERE agent_id = $1 AND revoked_at IS NULL`, v.ID, now); err != nil {
		return nil, err
	}
	if err := c.Publish(EventPrincipalDeleted, map[string]string{"principal_id": v.ID, "kind": "agent", "owner_id": owner}); err != nil {
		return nil, err
	}
	return kernel.NoContent(), nil
}

func (m *Module) createKey(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	var in struct {
		ExpiresInDays int `json:"expires_in_days"`
	}
	if err := req.Decode(&in); err != nil {
		return nil, err
	}
	v, err := m.loadAgent(c, c.Principal().ID, req.Params["id"])
	if err != nil {
		return nil, err
	}
	now := c.Now()
	var n int
	if err := c.DB().QueryRow(c, `SELECT count(*) FROM agent_keys WHERE agent_id = $1 AND revoked_at IS NULL
		AND (expires_at IS NULL OR expires_at > $2)`, v.ID, now).Scan(&n); err != nil {
		return nil, err
	}
	if n >= m.cfg.MaxKeys {
		return nil, kernel.ErrConflict.WithDetail(fmt.Sprintf("An agent can have at most %d active keys. Revoke one first.", m.cfg.MaxKeys))
	}
	key, lookup, err := secret.NewAgentKey()
	if err != nil {
		return nil, err
	}
	var expires *time.Time
	if in.ExpiresInDays > 0 {
		t := now.Add(time.Duration(in.ExpiresInDays) * 24 * time.Hour)
		expires = &t
	}
	id := kernel.NewID()
	if _, err := c.DB().Exec(c, `INSERT INTO agent_keys (id, agent_id, lookup, key_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		id, v.ID, lookup, m.pepper.Hash(key), now, expires); err != nil {
		return nil, err
	}
	body := map[string]any{"id": id, "key": key, "lookup": lookup, "created_at": now}
	if expires != nil {
		body["expires_at"] = *expires
	}
	return &kernel.Response{Status: http.StatusCreated, Location: "/v1/me/agents/" + v.ID, Body: body}, nil
}

func (m *Module) revokeKey(c kernel.Ctx, req *kernel.Request) (*kernel.Response, error) {
	v, err := m.loadAgent(c, c.Principal().ID, req.Params["id"])
	if err != nil {
		return nil, err
	}
	tag, err := c.DB().Exec(c, `UPDATE agent_keys SET revoked_at = $3 WHERE id = $1 AND agent_id = $2 AND revoked_at IS NULL`,
		req.Params["key_id"], v.ID, c.Now())
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, kernel.ErrNotFound
	}
	return kernel.NoContent(), nil
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
