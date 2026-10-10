package identity

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"em2.social/em2/core"
	"em2.social/em2/internal/modules/identity/internal/secret"
	"em2.social/em2/kernel"
)

// authenticate resolves a bearer credential: an agent API key (em2_ak_...) or
// a human access token. Every failure returns the same error.
func (m *Module) authenticate(c kernel.Ctx, cred string) (*core.Principal, error) {
	if strings.HasPrefix(cred, secret.AgentKeyPrefix) {
		return m.authenticateAgent(c, cred)
	}
	claims, err := m.signer.Verify(cred, c.Now())
	if err != nil || claims.Kind != string(core.KindHuman) {
		return nil, kernel.ErrUnauthenticated
	}
	p := &core.Principal{ID: claims.Subject, Kind: core.KindHuman, SessionID: claims.SessionID}
	err = c.DB().QueryRow(c, `SELECT p.handle, h.roles FROM sessions s
		JOIN principals p ON p.id = s.principal_id JOIN humans h ON h.principal_id = p.id
		WHERE s.id = $1 AND s.principal_id = $2 AND s.revoked_at IS NULL AND s.expires_at > $3 AND p.status = 'active'`,
		claims.SessionID, claims.Subject, c.Now()).Scan(&p.Handle, &p.Roles)
	if kernel.IsNoRows(err) {
		return nil, kernel.ErrUnauthenticated
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (m *Module) authenticateAgent(c kernel.Ctx, key string) (*core.Principal, error) {
	lookup, ok := secret.AgentKeyLookup(key)
	if !ok {
		m.pepper.Hash(key) // keep the work constant for malformed keys
		return nil, kernel.ErrUnauthenticated
	}
	now := c.Now()
	rows, err := c.DB().Query(c, `SELECT k.id, k.key_hash, k.last_used_at, p.id, p.handle, p.owner_id, a.scopes
		FROM agent_keys k
		JOIN agents a ON a.principal_id = k.agent_id
		JOIN principals p ON p.id = k.agent_id
		JOIN principals o ON o.id = p.owner_id
		WHERE k.lookup = $1 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > $2)
		  AND p.status = 'active' AND o.status = 'active'`, lookup, now)
	if err != nil {
		return nil, err
	}
	var found *core.Principal
	var lastUsed *time.Time
	for rows.Next() {
		var keyID, agentID, handle, owner string
		var hash []byte
		var scopes []string
		var lu *time.Time
		if err := rows.Scan(&keyID, &hash, &lu, &agentID, &handle, &owner, &scopes); err != nil {
			rows.Close()
			return nil, err
		}
		if m.pepper.Equal(key, hash) && found == nil {
			found = &core.Principal{ID: agentID, Handle: handle, Kind: core.KindAgent, OwnerID: owner, Scopes: scopes, KeyID: keyID}
			lastUsed = lu
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if found == nil {
		m.pepper.Hash(key)
		return nil, kernel.ErrUnauthenticated
	}
	if lastUsed == nil || now.Sub(*lastUsed) > time.Minute {
		if _, err := c.DB().Exec(c, `UPDATE agent_keys SET last_used_at = $2 WHERE id = $1`, found.KeyID, now); err != nil {
			return nil, err
		}
	}
	return found, nil
}

// expireSessions deletes sessions a week after they expired. The week keeps
// reuse detection working for refresh tokens that leak late.
func (m *Module) expireSessions(c kernel.Ctx) error {
	_, err := c.DB().Exec(c, `DELETE FROM sessions WHERE expires_at < $1`, c.Now().Add(-7*24*time.Hour))
	return err
}

// GrantRole adds a role to a human, for operators (em2 grant-role). It runs
// outside the kernel with the migration owner's connection.
func GrantRole(ctx context.Context, pool *pgxpool.Pool, handle, role string) error {
	switch role {
	case "admin", "observer":
	default:
		return fmt.Errorf("unknown role %q (want admin or observer)", role)
	}
	tag, err := pool.Exec(ctx, `UPDATE identity.humans SET roles = array_append(roles, $2)
		WHERE principal_id = (SELECT id FROM identity.principals WHERE handle = $1 AND kind = 'human' AND status = 'active')
		  AND NOT ($2 = ANY (roles))`, handle, role)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM identity.principals WHERE handle = $1 AND kind = 'human' AND status = 'active')`, handle).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return errors.New("no active human with that handle")
		}
	}
	return nil
}
