package ingest

import (
	"encoding/hex"
	"encoding/json"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/dossier"
)

// rebuildDossier recomputes the dossier of the content a new message carries.
// It runs from the outbox, in ingest's scope, so publishing stays uniform.
func (m *Module) rebuildDossier(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		ContentHash string `json:"content_hash"`
		MessageID   string `json:"message_id"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	hash, err := hex.DecodeString(ev.ContentHash)
	if err != nil {
		return err
	}
	now := c.Now()
	since := now.Add(-time.Duration(m.cfg.Rules.WindowHours) * time.Hour)

	st := dossier.Stats{ContentHash: hash, Now: now}
	if err := c.DB().QueryRow(c, `SELECT count(*), min(at) FROM messages WHERE content_hash = $1`, hash).Scan(&st.SeenTotal, &st.FirstSeen); err != nil {
		return err
	}
	if err := c.DB().QueryRow(c, `SELECT links FROM messages WHERE id = $1`, ev.MessageID).Scan(&st.Links); err != nil {
		return err
	}
	rows, err := c.DB().Query(c, `SELECT sender_id, at, stance_emotion, stance_color, claims->'ec' FROM messages
		WHERE content_hash = $1 AND at > $2`, hash, since)
	if err != nil {
		return err
	}
	for rows.Next() {
		var cp dossier.Copy
		var se, sc *int16
		var claim []byte
		if err := rows.Scan(&cp.SenderID, &cp.At, &se, &sc, &claim); err != nil {
			rows.Close()
			return err
		}
		if se != nil && sc != nil {
			cp.Stance = &core.EC{Emotion: core.Emotion(*se), Color: core.Color(*sc)}
		}
		if len(claim) > 0 && string(claim) != "null" {
			var ec core.EC
			if json.Unmarshal(claim, &ec) == nil {
				cp.Claim = &ec
			}
		}
		st.Window = append(st.Window, cp)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	d := dossier.Build(st, m.cfg.Rules)
	body, err := json.Marshal(dossierJSON(d))
	if err != nil {
		return err
	}
	if _, err := c.DB().Exec(c, `INSERT INTO dossiers (content_hash, first_seen, last_seen, seen_count, risk, version, body, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $3)
		ON CONFLICT (content_hash) DO UPDATE SET last_seen = EXCLUDED.last_seen, seen_count = EXCLUDED.seen_count,
			risk = EXCLUDED.risk, version = EXCLUDED.version, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`,
		hash, st.FirstSeen, now, st.SeenTotal, d.Risk, d.Version, body); err != nil {
		return err
	}
	return c.Publish(EventDossierUpdated, map[string]any{"content_hash": ev.ContentHash, "risk": d.Risk, "version": d.Version})
}

// dossierJSON is the public shape: the hash as hex rather than base64.
func dossierJSON(d core.Dossier) map[string]any {
	out := map[string]any{
		"content_hash": hex.EncodeToString(d.ContentHash), "first_seen": d.FirstSeen, "seen_count": d.SeenCount,
		"senders": d.Senders, "velocity": d.Velocity, "burstiness": d.Burstiness, "sender_concentration": d.SenderConc,
		"drift": d.Drift, "risk": d.Risk, "signals": d.Signals, "version": d.Version,
	}
	if len(d.Links) > 0 {
		out["links"] = d.Links
	}
	return out
}
