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
	if err := c.DB().QueryRow(c, `SELECT count(*), count(*) FILTER (WHERE far) FROM reach WHERE content_hash = $1`, hash).
		Scan(&st.Reach.Deliveries, &st.Reach.Far); err != nil {
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
	if err := c.Publish(EventDossierUpdated, map[string]any{"content_hash": ev.ContentHash, "risk": d.Risk, "version": d.Version}); err != nil {
		return err
	}
	return m.publishAssessed(c, ev.MessageID, ev.ContentHash, d.Risk)
}

// publishAssessed announces that a new message's dossier is ready.
func (m *Module) publishAssessed(c kernel.Ctx, id, hash string, risk float64) error {
	var plane, sender, kind string
	var channel, receiver, parent *string
	var se, sc *int16
	var at time.Time
	if err := c.DB().QueryRow(c, `SELECT plane, sender_id, sender_kind, channel_id, receiver_id, parent_id, stance_emotion, stance_color, at
		FROM messages WHERE id = $1`, id).Scan(&plane, &sender, &kind, &channel, &receiver, &parent, &se, &sc, &at); err != nil {
		return err
	}
	ev := map[string]any{"message_id": id, "content_hash": hash, "plane": plane, "sender_id": sender, "sender_kind": kind,
		"risk": risk, "at": at.UTC().Format(time.RFC3339Nano)}
	for k, v := range map[string]*string{"channel_id": channel, "receiver_id": receiver, "parent_id": parent} {
		if v != nil {
			ev[k] = *v
		}
	}
	if se != nil && sc != nil {
		ev["stance"] = core.EC{Emotion: core.Emotion(*se), Color: core.Color(*sc)}
	}
	return c.Publish(EventMessageAssessed, ev)
}

// onDecided counts where a content was delivered, for bridging_vector. The
// next copy's dossier uses it.
func (m *Module) onDecided(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		ExchangeID  string `json:"exchange_id"`
		ContentHash string `json:"content_hash"`
		Far         bool   `json:"far"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	hash, err := hex.DecodeString(ev.ContentHash)
	if err != nil {
		return err
	}
	_, err = c.DB().Exec(c, `INSERT INTO reach (exchange_id, content_hash, far) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, ev.ExchangeID, hash, ev.Far)
	return err
}

// onTransitioned keeps the message's current state for readers.
func (m *Module) onTransitioned(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		MessageID string  `json:"message_id"`
		To        core.EC `json:"to"`
		Version   int     `json:"version"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	_, err := c.DB().Exec(c, `UPDATE messages SET state_emotion = $2, state_color = $3, state_version = $4
		WHERE id = $1 AND state_version < $4`, ev.MessageID, int16(ev.To.Emotion), int16(ev.To.Color), ev.Version)
	return err
}

// dossierJSON is the public shape: the hash as hex rather than base64.
func dossierJSON(d core.Dossier) map[string]any {
	out := map[string]any{
		"content_hash": hex.EncodeToString(d.ContentHash), "first_seen": d.FirstSeen, "seen_count": d.SeenCount,
		"senders": d.Senders, "velocity": d.Velocity, "burstiness": d.Burstiness, "sender_concentration": d.SenderConc,
		"drift": d.Drift, "bridging": d.Bridging, "risk": d.Risk, "signals": d.Signals, "version": d.Version,
	}
	if len(d.Links) > 0 {
		out["links"] = d.Links
	}
	return out
}
