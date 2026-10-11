// Package ingest is EM2's data engine (BLUEPRINT B5): it normalizes every
// incoming message into a canonical core.Message, stores channels, messages
// and media, and keeps a dossier of evidence about each piece of content.
//
// Publishing never reveals the dossier: the sender gets the same 202 whatever
// the content's risk (ADR-011). Dossiers are rebuilt asynchronously from the
// outbox event, so the publish path does the same work for every message.
package ingest

import (
	"embed"
	"errors"
	"io/fs"
	"time"

	"em2.social/em2/internal/services"
	"em2.social/em2/internal/storage"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/dossier"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Events emitted by ingest.
const (
	EventMessageReceived = "ingest.message.received"
	EventDossierUpdated  = "ingest.dossier.updated"
)

// Config for the module.
type Config struct {
	Media    storage.Store
	Rules    *dossier.Rules // nil means the builtin dossier-1
	MaxMedia int64          // bytes; default 5 MiB
	// PublishPad is the fixed response time of POST /v1/messages (ADR-011).
	PublishPad time.Duration
}

// Module is the ingest module.
type Module struct {
	cfg     Config
	dir     services.Directory
	stances services.Stances
}

// New builds the module.
func New(cfg Config) (*Module, error) {
	if cfg.Media == nil {
		return nil, errors.New("ingest: a media store is required")
	}
	if cfg.Rules == nil {
		r, err := dossier.Builtin("dossier-1")
		if err != nil {
			return nil, err
		}
		cfg.Rules = r
	}
	if cfg.MaxMedia <= 0 {
		cfg.MaxMedia = 5 << 20
	}
	if cfg.PublishPad <= 0 {
		cfg.PublishPad = 150 * time.Millisecond
	}
	return &Module{cfg: cfg}, nil
}

func (m *Module) Manifest() kernel.Manifest {
	sub, _ := fs.Sub(migrations, "migrations")
	return kernel.Manifest{Name: "ingest", Version: "0.2.0", Kind: kernel.KindModule, Schema: "ingest",
		DependsOn: []string{"identity", "ledger"}, Migrations: sub}
}

func (m *Module) Register(r *kernel.Registry) error {
	var err error
	if m.dir, err = kernel.Resolve[services.Directory](r); err != nil {
		return err
	}
	if m.stances, err = kernel.Resolve[services.Stances](r); err != nil {
		return err
	}
	r.Emits(kernel.EventDef{Name: EventMessageReceived, Version: 1, Schema: messageEvent, Summary: "A message was accepted and stored"})
	r.Emits(kernel.EventDef{Name: EventDossierUpdated, Version: 1, Schema: dossierEvent, Summary: "A content dossier was rebuilt"})
	r.Subscribe(EventMessageReceived, 1, m.rebuildDossier)
	for _, rt := range m.routes() {
		r.Route(rt)
	}
	return nil
}
