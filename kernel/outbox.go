package kernel

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"

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
// rows it handled. Every subscriber runs in this one transaction under its own
// savepoint (see deliver), so a subscriber sees an event at least once, and
// exactly once unless it has side effects outside the database.
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

	chained := 0
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
		for _, sub := range k.subs {
			if sub.event != ev.name || sub.version != ev.version {
				continue
			}
			key := sub.module + ":" + sub.event
			if done[key] {
				continue
			}
			published, err := k.deliver(ctx, tx, sub, key, env, actor)
			if err != nil {
				allOK = false
				k.metrics.failed.Add(1)
				k.log.Error("event delivery failed", "event", ev.name, "event_id", ev.id, "subscriber", sub.module, "attempt", ev.attempts+1, "error", err)
				continue
			}
			k.metrics.delivered.Add(1)
			chained += published
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
	if chained > 0 {
		k.metrics.published.Add(uint64(chained))
		k.nudge()
	}
	return len(batch), nil
}

// deliver runs one subscriber inside the dispatcher's transaction, under a
// savepoint and switched to the subscriber's role and search_path. A failure
// rolls back to the savepoint only. The subscriber's effects, its delivery
// record and the outbox update commit together, on one connection: the
// dispatcher never waits for a second connection while holding the first.
func (k *Kernel) deliver(ctx context.Context, tx pgx.Tx, sub subscription, key string, env Envelope, actor *core.Principal) (int, error) {
	if _, err := tx.Exec(ctx, "SAVEPOINT em2_delivery"); err != nil {
		return 0, err
	}
	c := k.newCtx(ctx, sub.module, actor, "event:"+env.ID)
	c.tx = &lazyTx{k: k, ctx: ctx, module: sub.module, tx: tx}
	err := k.enterScope(ctx, tx, sub.module)
	if err == nil {
		err = sub.handler(c, env)
	}
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO kernel.deliveries (event_id, subscriber) VALUES ($1, $2)`, env.ID, key)
	}
	if err != nil {
		if _, rbErr := tx.Exec(ctx, "ROLLBACK TO SAVEPOINT em2_delivery"); rbErr != nil {
			return 0, fmt.Errorf("%w (and rollback to savepoint failed: %v)", err, rbErr)
		}
		return 0, err
	}
	if _, err := tx.Exec(ctx, "RELEASE SAVEPOINT em2_delivery"); err != nil {
		return 0, err
	}
	// Back to the dispatcher's own scope for the outbox bookkeeping.
	if err := k.enterScope(ctx, tx, ""); err != nil {
		return 0, err
	}
	return len(c.published), nil
}
