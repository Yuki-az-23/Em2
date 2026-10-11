package verdict

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"em2.social/em2/core"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/ecbridge"
)

type assessed struct {
	MessageID   string    `json:"message_id"`
	ContentHash string    `json:"content_hash"`
	Plane       string    `json:"plane"`
	SenderID    string    `json:"sender_id"`
	SenderKind  string    `json:"sender_kind"`
	ChannelID   string    `json:"channel_id"`
	ReceiverID  string    `json:"receiver_id"`
	ParentID    string    `json:"parent_id"`
	Stance      *core.EC  `json:"stance"`
	Risk        float64   `json:"risk"`
	At          time.Time `json:"at"`
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func ecArgs(ec *core.EC) (any, any) {
	if ec == nil {
		return nil, nil
	}
	return int16(ec.Emotion), int16(ec.Color)
}

func ecFrom(e, c *int16) *core.EC {
	if e == nil || c == nil {
		return nil
	}
	return &core.EC{Emotion: core.Emotion(*e), Color: core.Color(*c)}
}

// onAssessed decides the verdicts of a new message for all its receivers and,
// for a reply, puts the replier's pressure on the parent.
func (m *Module) onAssessed(c kernel.Ctx, e kernel.Envelope) error {
	var ev assessed
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	hash, err := hex.DecodeString(ev.ContentHash)
	if err != nil {
		return err
	}
	now := c.Now()
	if _, err := c.DB().Exec(c, `INSERT INTO risk (content_hash, risk, updated_at) VALUES ($1, $2, $3)
		ON CONFLICT (content_hash) DO UPDATE SET risk = EXCLUDED.risk, updated_at = EXCLUDED.updated_at`, hash, ev.Risk, now); err != nil {
		return err
	}
	se, sc := ecArgs(ev.Stance)
	tag, err := c.DB().Exec(c, `INSERT INTO messages (message_id, content_hash, plane, author_id, author_kind, channel_id, receiver_id, parent_id,
		at, emotion, color, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING`,
		ev.MessageID, hash, ev.Plane, ev.SenderID, ev.SenderKind, nullable(ev.ChannelID), nullable(ev.ReceiverID), nullable(ev.ParentID),
		ev.At, se, sc, now)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil // already handled
	}

	var receivers []string
	if ev.ChannelID != "" {
		rows, err := c.DB().Query(c, `SELECT principal_id FROM subscriptions WHERE channel_id = $1 AND principal_id <> $2 ORDER BY principal_id`,
			ev.ChannelID, ev.SenderID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			receivers = append(receivers, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
	} else if ev.ReceiverID != "" && ev.ReceiverID != ev.SenderID {
		receivers = []string{ev.ReceiverID}
	} else if ev.Plane == string(core.PlaneEgress) {
		// Egress content is delivered to the agent that fetched it.
		receivers = []string{ev.ReceiverID}
	}
	settings, err := m.receivers.Receivers(c, receivers, ev.SenderID)
	if err != nil {
		return err
	}
	for _, rid := range receivers {
		rs := settings[rid]
		d := ecbridge.Decide(ev.Stance, ev.Risk, ecbridge.Receiver{Bridge: rs.Bridge, Threshold: rs.Threshold, Filter: rs.Filter, BlocksSender: rs.BlocksSender}, m.rules)
		if err := m.record(c, ev.MessageID, ev.Plane, rid, rs.Threshold, ev.Risk, d); err != nil {
			return err
		}
	}

	if ev.ParentID != "" && ev.Stance != nil {
		if _, err := m.interact(c, ev.ParentID, ev.SenderID, ev.SenderKind == string(core.KindAgent), ev.Stance, ecbridge.KindReply, nil); err != nil {
			return err
		}
	}
	return nil
}

// record stores a new exchange. In shadow mode every verdict is delivered and
// the real one is kept for the receiver to see (BLUEPRINT B9).
func (m *Module) record(c kernel.Ctx, messageID, plane, receiverID string, threshold, risk float64, d ecbridge.Decision) error {
	now := c.Now()
	shadow := c.Mode() != kernel.ModeEnforce
	state := "forwarded"
	var delivered, expires any = now, nil
	if !shadow {
		switch d.Kind {
		case core.VerdictDefer:
			state, delivered, expires = "deferred", nil, now.Add(m.rules.DeferTTL())
		case core.VerdictDeny:
			state, delivered = "denied", nil
		}
	}
	id := kernel.NewID()
	tag, err := c.DB().Exec(c, `INSERT INTO exchanges (id, message_id, receiver_id, state, kind, score, threshold, risk, reason, rule_version,
		shadow, decided_at, delivered_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		ON CONFLICT (message_id, receiver_id) DO NOTHING`,
		id, messageID, receiverID, state, string(d.Kind), d.Score, threshold, risk, d.Reason, m.rules.Version, shadow, now, delivered, expires)
	if err != nil || tag.RowsAffected() == 0 || delivered == nil {
		return err
	}
	return m.publishDelivered(c, id, messageID, plane, receiverID, risk, d, shadow)
}

func (m *Module) publishDelivered(c kernel.Ctx, id, messageID, plane, receiverID string, risk float64, d ecbridge.Decision, shadow bool) error {
	ev := map[string]any{"exchange_id": id, "message_id": messageID, "receiver_id": receiverID, "plane": plane, "kind": string(d.Kind),
		"risk": risk, "reason": d.Reason, "rule_version": m.rules.Version, "shadow": shadow}
	if d.Score != nil {
		ev["score"] = *d.Score
	}
	return c.Publish(EventDelivered, ev)
}

// interact applies one interaction to a message under a row lock and commits
// a transition when the pressure reaches θ. Pressure counts only from actors
// the message was delivered to with a pass verdict; the author never counts.
func (m *Module) interact(c kernel.Ctx, messageID, actorID string, agent bool, stance *core.EC, kind string, revert *brace) (ecbridge.Outcome, error) {
	var out ecbridge.Outcome
	var author string
	var e, col *int16
	var version int
	var poolsJSON []byte
	err := c.DB().QueryRow(c, `SELECT author_id, emotion, color, version, pools FROM messages WHERE message_id = $1 FOR UPDATE`, messageID).
		Scan(&author, &e, &col, &version, &poolsJSON)
	if kernel.IsNoRows(err) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	now := c.Now()
	current := ecFrom(e, col)
	logInteraction := func(effect string, added float64) error {
		_, err := c.DB().Exec(c, `INSERT INTO interactions (id, message_id, actor_id, kind, effect, added, at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			kernel.NewID(), messageID, actorID, kind, effect, added, now)
		return err
	}
	if current == nil {
		out.Effect = "unknown_state"
		return out, logInteraction(out.Effect, 0)
	}
	if kind != ecbridge.KindUnbrace && actorID != author {
		var pass bool
		if err := c.DB().QueryRow(c, `SELECT EXISTS (SELECT 1 FROM exchanges WHERE message_id = $1 AND receiver_id = $2 AND kind = 'pass')`,
			messageID, actorID).Scan(&pass); err != nil {
			return out, err
		}
		if !pass {
			out.Effect = "not_a_pass_receiver"
			return out, logInteraction(out.Effect, 0)
		}
	}
	st := ecbridge.PressureState{Author: author, Current: *current}
	if err := json.Unmarshal(poolsJSON, &st.Pools); err != nil {
		return out, fmt.Errorf("verdict: pools of %s: %w", messageID, err)
	}
	in := ecbridge.Interaction{Actor: actorID, Agent: agent, Stance: stance, Kind: kind, At: now}
	if revert != nil {
		in.Revert, in.RevertTarget = revert.added, revert.target
	}
	next, out := ecbridge.ApplyPressure(st, in, m.rules)
	if err := logInteraction(out.Effect, out.Added); err != nil {
		return out, err
	}
	if out.Effect != "added" {
		return out, nil
	}
	pools := next.Pools
	if pools == nil {
		pools = []ecbridge.Pool{}
	}
	pj, err := json.Marshal(pools)
	if err != nil {
		return out, err
	}
	if !out.Committed {
		_, err = c.DB().Exec(c, `UPDATE messages SET pools = $2, updated_at = $3 WHERE message_id = $1`, messageID, pj, now)
		return out, err
	}
	version++
	if _, err := c.DB().Exec(c, `UPDATE messages SET emotion = $2, color = $3, version = $4, transitions = transitions + 1, pools = $5, updated_at = $6
		WHERE message_id = $1`, messageID, int16(next.Current.Emotion), int16(next.Current.Color), version, pj, now); err != nil {
		return out, err
	}
	if _, err := c.DB().Exec(c, `DELETE FROM braces WHERE message_id = $1`, messageID); err != nil {
		return out, err
	}
	if _, err := c.DB().Exec(c, `INSERT INTO transitions (message_id, version, from_emotion, from_color, to_emotion, to_color, pressure,
		contributors, trigger_id, trigger_kind, rule_version, at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		messageID, version, int16(out.From.Emotion), int16(out.From.Color), int16(next.Current.Emotion), int16(next.Current.Color),
		out.Pressure, out.Contributors, actorID, kind, m.rules.Version, now); err != nil {
		return out, err
	}
	return out, c.Publish(EventTransitioned, map[string]any{"message_id": messageID, "from": out.From, "to": next.Current,
		"version": version, "at": now.UTC().Format(time.RFC3339Nano)})
}

// pending is a deferred exchange with what re-evaluation needs.
type pending struct {
	id, messageID, receiverID, authorID, plane string
	state                                      *core.EC
	risk                                       float64
}

func (m *Module) loadPending(c kernel.Ctx, where string, arg any) ([]pending, error) {
	rows, err := c.DB().Query(c, `SELECT x.id, x.message_id, x.receiver_id, g.author_id, g.plane, g.emotion, g.color, COALESCE(r.risk, x.risk)
		FROM exchanges x JOIN messages g ON g.message_id = x.message_id LEFT JOIN risk r ON r.content_hash = g.content_hash
		WHERE x.state = 'deferred' AND `+where+` ORDER BY x.decided_at, x.id FOR UPDATE OF x`, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []pending
	for rows.Next() {
		var p pending
		var e, col *int16
		var risk float32
		if err := rows.Scan(&p.id, &p.messageID, &p.receiverID, &p.authorID, &p.plane, &e, &col, &risk); err != nil {
			return nil, err
		}
		p.state, p.risk = ecFrom(e, col), float64(risk)
		out = append(out, p)
	}
	return out, rows.Err()
}

// reevaluate re-decides deferred exchanges. A deferred exchange is released
// (and delivered) when it now passes or is shaped, and expires when its
// content has meanwhile reached the deny limit; delivered exchanges are never
// withdrawn.
func (m *Module) reevaluate(c kernel.Ctx, list []pending) error {
	now := c.Now()
	for _, p := range list {
		settings, err := m.receivers.Receivers(c, []string{p.receiverID}, p.authorID)
		if err != nil {
			return err
		}
		rs := settings[p.receiverID]
		d := ecbridge.Decide(p.state, p.risk, ecbridge.Receiver{Bridge: rs.Bridge, Threshold: rs.Threshold, Filter: rs.Filter, BlocksSender: rs.BlocksSender}, m.rules)
		switch d.Kind {
		case core.VerdictDefer:
			if _, err := c.DB().Exec(c, `UPDATE exchanges SET score = $2, threshold = $3, reason = $4 WHERE id = $1`, p.id, d.Score, rs.Threshold, d.Reason); err != nil {
				return err
			}
		case core.VerdictDeny:
			if _, err := c.DB().Exec(c, `UPDATE exchanges SET state = 'expired', reason = $2 WHERE id = $1`, p.id, "Withdrawn: "+d.Reason); err != nil {
				return err
			}
		default:
			if _, err := c.DB().Exec(c, `UPDATE exchanges SET state = 'forwarded', kind = $2, score = $3, threshold = $4, risk = $5, reason = $6,
				rule_version = $7, released_at = $8, delivered_at = $8, expires_at = NULL WHERE id = $1`,
				p.id, string(d.Kind), d.Score, rs.Threshold, p.risk, d.Reason, m.rules.Version, now); err != nil {
				return err
			}
			if err := m.publishDelivered(c, p.id, p.messageID, p.plane, p.receiverID, p.risk, d, false); err != nil {
				return err
			}
		}
	}
	return nil
}

func (m *Module) onReceiverChanged(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		PrincipalID string `json:"principal_id"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	list, err := m.loadPending(c, `x.receiver_id = $1`, ev.PrincipalID)
	if err != nil {
		return err
	}
	return m.reevaluate(c, list)
}

func (m *Module) onTransitioned(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		MessageID string `json:"message_id"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	list, err := m.loadPending(c, `x.message_id = $1`, ev.MessageID)
	if err != nil {
		return err
	}
	return m.reevaluate(c, list)
}

func (m *Module) expireDeferred(c kernel.Ctx) error {
	_, err := c.DB().Exec(c, `UPDATE exchanges SET state = 'expired' WHERE state = 'deferred' AND expires_at <= $1`, c.Now())
	return err
}

// onPrincipalDeleted erases what the deleted principal received and subscribed to.
func (m *Module) onPrincipalDeleted(c kernel.Ctx, e kernel.Envelope) error {
	var ev struct {
		PrincipalID string `json:"principal_id"`
	}
	if err := json.Unmarshal(e.Payload, &ev); err != nil {
		return err
	}
	for _, q := range []string{`DELETE FROM subscriptions WHERE principal_id = $1`, `DELETE FROM exchanges WHERE receiver_id = $1`} {
		if _, err := c.DB().Exec(c, q, ev.PrincipalID); err != nil {
			return err
		}
	}
	return nil
}

// exchanges implements services.Exchanges for adapters.
type exchanges struct{ scope *kernel.Scope }

func (x *exchanges) Responded(ctx context.Context, exchangeID string, status int, latency time.Duration) error {
	return x.scope.Tx(ctx, func(c kernel.Ctx) error {
		_, err := c.DB().Exec(c, `UPDATE exchanges SET state = 'responded', responded_at = $2, upstream_status = $3, latency_ms = $4
			WHERE id = $1 AND state = 'forwarded'`, exchangeID, c.Now(), status, int(latency.Milliseconds()))
		return err
	})
}
