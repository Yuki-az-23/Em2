package kernel

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"em2.social/em2/core"
)

// dispatchLoop drains the outbox until ctx is done. It wakes on its interval
// and immediately after a local commit that published events.
func (k *Kernel) dispatchLoop(ctx context.Context) {
	t := time.NewTicker(k.cfg.DispatchInterval)
	defer t.Stop()
	for {
		for {
			n, err := k.DispatchOnce(ctx)
			if err != nil && ctx.Err() == nil {
				k.log.Error("outbox dispatch failed", "error", err)
			}
			if n == 0 || err != nil {
				break
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-k.wake:
		}
	}
}

type outboxRow struct {
	id         string
	name       string
	version    int
	payload    []byte
	actor      []byte
	traceID    *string
	occurredAt time.Time
	attempts   int
}

// DispatchOnce delivers one batch of due events and returns how many outbox
// rows it handled. Each subscriber runs in its own transaction, scoped to its
// schema, which also records the delivery; so a subscriber sees an event at
// least once, and exactly once unless it fails after its own side effects
// outside the database.
func (k *Kernel) DispatchOnce(ctx context.Context) (int, error) {
	if k.cfg.Pool == nil {
		return 0, ErrNoDatabase
	}
	tx, err := k.cfg.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	rows, err := tx.Query(ctx, `SELECT id, name, version, payload, actor, trace_id, occurred_at, attempts
		FROM kernel.outbox
		WHERE dispatched_at IS NULL AND next_attempt_at <= now()
		ORDER BY occurred_at, id
		LIMIT 100
		FOR NO KEY UPDATE SKIP LOCKED`)
	if err != nil {
		return 0, err
	}
	var batch []outboxRow
	for rows.Next() {
		var r outboxRow
		if err := rows.Scan(&r.id, &r.name, &r.version, &r.payload, &r.actor, &r.traceID, &r.occurredAt, &r.attempts); err != nil {
			rows.Close()
			return 0, err
		}
		batch = append(batch, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, ev := range batch {
		done := map[string]bool{}
		drows, err := tx.Query(ctx, `SELECT subscriber FROM kernel.deliveries WHERE event_id = $1`, ev.id)
		if err != nil {
			return 0, err
		}
		for drows.Next() {
			var s string
			if err := drows.Scan(&s); err != nil {
				drows.Close()
				return 0, err
			}
			done[s] = true
		}
		drows.Close()

		var actor *core.Principal
		if len(ev.actor) > 0 {
			actor = &core.Principal{}
			if err := json.Unmarshal(ev.actor, actor); err != nil {
				actor = nil
			}
		}
		trace := ""
		if ev.traceID != nil {
			trace = *ev.traceID
		}
		env := Envelope{ID: ev.id, Name: ev.name, Version: ev.version, OccurredAt: ev.occurredAt, Actor: actor, Payload: ev.payload, TraceID: trace}

		allOK := true
		for _, s := range k.subs {
			if s.event != ev.name || s.version != ev.version {
				continue
			}
			key := s.module + ":" + s.event
			if done[key] {
				continue
			}
			err := k.runInTx(ctx, s.module, actor, "event:"+ev.id, func(c *execCtx) error {
				if err := s.handler(c, env); err != nil {
					return err
				}
				_, err := c.tx.Exec(c, `INSERT INTO kernel.deliveries (event_id, subscriber) VALUES ($1, $2)`, ev.id, key)
				return err
			})
			if err != nil {
				allOK = false
				k.metrics.failed.Add(1)
				k.log.Error("event delivery failed", "event", ev.name, "event_id", ev.id, "subscriber", s.module, "attempt", ev.attempts+1, "error", err)
				continue
			}
			k.metrics.delivered.Add(1)
		}
		if allOK {
			_, err = tx.Exec(ctx, `UPDATE kernel.outbox SET dispatched_at = now() WHERE id = $1`, ev.id)
		} else {
			backoff := math.Min(k.cfg.DispatchInterval.Seconds()*math.Pow(2, float64(ev.attempts)), 300)
			_, err = tx.Exec(ctx, `UPDATE kernel.outbox SET attempts = attempts + 1, last_error_at = now(),
				next_attempt_at = now() + make_interval(secs => $2) WHERE id = $1`, ev.id, backoff)
		}
		if err != nil {
			return 0, fmt.Errorf("update outbox %s: %w", ev.id, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(batch), nil
}
