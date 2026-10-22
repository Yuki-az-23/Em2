package kernel

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"em2.social/em2/core"
)

// Logger is the structured logger handed to modules.
type Logger = *slog.Logger

// RunMode is how verdicts are applied (BLUEPRINT B9). In M1 it is carried and
// reported; the verdict module honours it from M3.
type RunMode string

const (
	ModeEnforce RunMode = "enforce"
	ModeShadow  RunMode = "shadow"
	ModeReplay  RunMode = "replay"
)

// ParseRunMode accepts enforce, shadow or replay.
func ParseRunMode(s string) (RunMode, error) {
	switch RunMode(s) {
	case ModeEnforce, ModeShadow, ModeReplay:
		return RunMode(s), nil
	}
	return "", fmt.Errorf("unknown run mode %q", s)
}

type pendingEvent struct {
	id      string
	name    string
	version int
	payload []byte
}

type execCtx struct {
	context.Context
	k         *Kernel
	module    string
	tx        *lazyTx
	principal *core.Principal
	log       *slog.Logger
	requestID string
	published []pendingEvent
}

func (k *Kernel) newCtx(parent context.Context, module string, p *core.Principal, requestID string) *execCtx {
	return &execCtx{
		Context:   parent,
		k:         k,
		module:    module,
		tx:        &lazyTx{k: k, ctx: parent, module: module},
		principal: p,
		log:       k.log.With("module", module, "request_id", requestID),
		requestID: requestID,
	}
}

func (c *execCtx) DB() DB                     { return c.tx }
func (c *execCtx) Log() Logger                { return c.log }
func (c *execCtx) Principal() *core.Principal { return c.principal }
func (c *execCtx) Now() time.Time             { return c.k.cfg.Now() }
func (c *execCtx) Mode() RunMode              { return c.k.cfg.Mode }
func (c *execCtx) RequestID() string          { return c.requestID }

// Publish validates the payload against the module's declared event and writes
// it to kernel.outbox inside the current transaction, so the event exists if
// and only if the handler's changes commit.
func (c *execCtx) Publish(event string, payload any) error {
	info, ok := c.k.events[event]
	if !ok || info.module != c.module {
		return fmt.Errorf("kernel: %s publishes undeclared event %s", c.module, event)
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("kernel: encode %s: %w", event, err)
	}
	if info.def.Schema != nil {
		if errs := info.def.Schema.ValidateJSON(b); len(errs) > 0 {
			return fmt.Errorf("kernel: %s payload does not match its schema: %v", event, errs)
		}
	}
	var actor []byte
	if c.principal != nil {
		actor, _ = json.Marshal(c.principal)
	}
	id := NewID()
	if _, err := c.tx.Exec(c, `INSERT INTO kernel.outbox (id, name, version, payload, actor, trace_id, occurred_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`, id, event, info.def.Version, b, actor, c.requestID, c.Now()); err != nil {
		return fmt.Errorf("kernel: write outbox: %w", err)
	}
	c.published = append(c.published, pendingEvent{id: id, name: event, version: info.def.Version, payload: b})
	return nil
}
