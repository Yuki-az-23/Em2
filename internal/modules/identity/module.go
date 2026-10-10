// Package identity owns principals (humans and agents), passwords, sessions,
// access tokens and agent API keys. It registers the kernel's authenticator.
package identity

import (
	"embed"
	"errors"
	"io/fs"
	"time"

	"em2.social/em2/internal/modules/identity/internal/secret"
	"em2.social/em2/kernel"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Config holds identity's secrets and policy.
type Config struct {
	SigningSeed []byte // 32-byte Ed25519 seed for access tokens
	Pepper      []byte // >= 32 bytes, mixed into every stored credential hash
	AccessTTL   time.Duration
	RefreshTTL  time.Duration
	Argon2      secret.Argon2Params
	// MaxAgents per human and MaxKeys active keys per agent.
	MaxAgents, MaxKeys int
}

// FastArgon2 is for tests only.
var FastArgon2 = secret.Argon2Params{MemoryKiB: 1024, Time: 1, Threads: 1}

// Module is the identity module.
type Module struct {
	cfg    Config
	signer *secret.Signer
	pepper secret.Pepper
	dummy  string // a real hash used to equalise timing for unknown emails
}

// New validates config and builds the module.
func New(cfg Config) (*Module, error) {
	s, err := secret.NewSigner(cfg.SigningSeed)
	if err != nil {
		return nil, err
	}
	p, err := secret.NewPepper(cfg.Pepper)
	if err != nil {
		return nil, err
	}
	if cfg.AccessTTL <= 0 {
		cfg.AccessTTL = 15 * time.Minute
	}
	if cfg.RefreshTTL <= 0 {
		cfg.RefreshTTL = 30 * 24 * time.Hour
	}
	if cfg.Argon2 == (secret.Argon2Params{}) {
		cfg.Argon2 = secret.DefaultArgon2
	}
	if cfg.MaxAgents <= 0 {
		cfg.MaxAgents = 20
	}
	if cfg.MaxKeys <= 0 {
		cfg.MaxKeys = 5
	}
	dummy, err := secret.HashPassword("em2 timing equaliser", cfg.Argon2)
	if err != nil {
		return nil, errors.New("identity: cannot hash")
	}
	return &Module{cfg: cfg, signer: s, pepper: p, dummy: dummy}, nil
}

func (m *Module) Manifest() kernel.Manifest {
	sub, _ := fs.Sub(migrations, "migrations")
	return kernel.Manifest{Name: "identity", Version: "1.0.0", Kind: kernel.KindModule, Schema: "identity", Migrations: sub}
}

// Events emitted by identity. Payloads never carry email or credentials.
const (
	EventPrincipalRegistered = "identity.principal.registered"
	EventPrincipalDeleted    = "identity.principal.deleted"
)

func (m *Module) Register(r *kernel.Registry) error {
	r.Authenticator(m.authenticate)
	r.Emits(kernel.EventDef{Name: EventPrincipalRegistered, Version: 1, Schema: principalEvent, Summary: "A human or agent principal was created"})
	r.Emits(kernel.EventDef{Name: EventPrincipalDeleted, Version: 1, Schema: principalEvent, Summary: "A principal was deleted and its credentials revoked"})
	for _, rt := range m.routes() {
		r.Route(rt)
	}
	r.Job("expire-sessions", time.Hour, m.expireSessions)
	return nil
}
