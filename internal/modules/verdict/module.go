// Package verdict is EM2's execution engine (BLUEPRINT B6). For every
// assessed message it decides, per receiver, pass, shape, defer or deny with
// the receiver's bridge, threshold and blocks and the content's risk. It keeps
// the exchanges (the feed), the pressure interactions put on messages, and
// commits transitions of a message's emotional state.
//
// Verdicts belong to receivers. Nothing here is ever shown to a sender
// (ADR-011), and nothing here reads core.Message.Claims.
package verdict

import (
	"embed"
	"io/fs"
	"time"

	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/ecbridge"
	"em2.social/em2/pkg/schema"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Events emitted by verdict.
const (
	EventTransitioned = "verdict.message.transitioned"
	EventDelivered    = "verdict.exchange.delivered"
)

// Config for the module.
type Config struct {
	Rules *ecbridge.Ruleset // nil means the builtin default
	// ExpireEvery is how often deferred exchanges are checked for expiry.
	ExpireEvery time.Duration
}

// Module is the verdict module.
type Module struct {
	cfg       Config
	rules     *ecbridge.Ruleset
	receivers services.Receivers
	stances   services.Stances
	messages  services.Messages
}

// New builds the module.
func New(cfg Config) (*Module, error) {
	if cfg.Rules == nil {
		r, err := ecbridge.BuiltinRuleset(ecbridge.DefaultRuleset)
		if err != nil {
			return nil, err
		}
		cfg.Rules = r
	}
	if cfg.ExpireEvery <= 0 {
		cfg.ExpireEvery = time.Minute
	}
	return &Module{cfg: cfg, rules: cfg.Rules}, nil
}

func (m *Module) Manifest() kernel.Manifest {
	sub, _ := fs.Sub(migrations, "migrations")
	return kernel.Manifest{Name: "verdict", Version: "0.3.0", Kind: kernel.KindModule, Schema: "verdict",
		DependsOn: []string{"identity", "ledger", "ingest"}, Migrations: sub}
}

var (
	ecEvent           = schema.Object(schema.Req("emotion", schema.String()), schema.Req("color", schema.String()))
	transitionedEvent = schema.Object(schema.Req("message_id", schema.UUID()), schema.Req("from", ecEvent), schema.Req("to", ecEvent),
		schema.Req("version", schema.Integer()), schema.Req("at", schema.DateTime()))
	deliveredEvent = schema.Object(schema.Req("exchange_id", schema.UUID()), schema.Req("message_id", schema.UUID()),
		schema.Req("receiver_id", schema.UUID()), schema.Req("plane", schema.String()), schema.Req("kind", schema.String()),
		schema.Opt("score", schema.Number()), schema.Req("risk", schema.Number()), schema.Req("reason", schema.String()),
		schema.Req("rule_version", schema.String()), schema.Req("shadow", schema.Boolean()))
)

func (m *Module) Register(r *kernel.Registry) error {
	var err error
	if m.receivers, err = kernel.Resolve[services.Receivers](r); err != nil {
		return err
	}
	if m.stances, err = kernel.Resolve[services.Stances](r); err != nil {
		return err
	}
	if m.messages, err = kernel.Resolve[services.Messages](r); err != nil {
		return err
	}
	r.Provide(services.Exchanges(&exchanges{scope: r.Scope()}))
	r.Emits(kernel.EventDef{Name: EventTransitioned, Version: 1, Schema: transitionedEvent, Summary: "Pressure moved a message's emotional state one step"})
	r.Emits(kernel.EventDef{Name: EventDelivered, Version: 1, Schema: deliveredEvent, Summary: "A message was delivered to a receiver (internal; carries the receiver's verdict)"})
	r.Subscribe("ingest.message.assessed", 1, m.onAssessed)
	r.Subscribe("ledger.bridge.updated", 1, m.onReceiverChanged)
	r.Subscribe("ledger.settings.updated", 1, m.onReceiverChanged)
	r.Subscribe(EventTransitioned, 1, m.onTransitioned)
	r.Subscribe("identity.principal.deleted", 1, m.onPrincipalDeleted)
	r.Job("expire-deferred", m.cfg.ExpireEvery, m.expireDeferred)
	for _, rt := range m.routes() {
		r.Route(rt)
	}
	return nil
}
