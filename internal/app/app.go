// Package app is EM2's composition root: it reads configuration and wires the
// kernel with every module. The binary and the test suites both use it, so
// what is tested is what runs.
package app

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"em2.social/em2/internal/adapters/egress"
	"em2.social/em2/internal/adapters/ingress"
	"em2.social/em2/internal/modules/identity"
	"em2.social/em2/internal/modules/ingest"
	"em2.social/em2/internal/modules/ledger"
	"em2.social/em2/internal/modules/verdict"
	"em2.social/em2/internal/netguard"
	"em2.social/em2/internal/storage"
	"em2.social/em2/kernel"
	"em2.social/em2/pkg/ecbridge"
)

// Config is everything EM2 reads from its environment.
type Config struct {
	Addr          string // EM2_ADDR, default :8080
	AdminAddr     string // EM2_ADMIN_ADDR, default 127.0.0.1:9090 (metrics; keep private)
	DatabaseURL   string // EM2_DATABASE_URL
	SigningKey    []byte // EM2_SIGNING_KEY, base64 32-byte Ed25519 seed
	KeyPepper     []byte // EM2_KEY_PEPPER, base64, at least 32 bytes
	Mode          kernel.RunMode
	RoleIsolation bool   // EM2_DB_ROLE_ISOLATION, default on
	TrustProxy    bool   // EM2_TRUST_PROXY
	MediaDir      string // EM2_MEDIA_DIR, default ./data/media
	LogLevel      slog.Level
	// NetAllowPrivate lets ingress and egress reach private, loopback and
	// link-local addresses (EM2_NET_ALLOW_PRIVATE=on). Development only.
	NetAllowPrivate bool

	// Test hooks.
	FastHashing      bool
	DispatchInterval time.Duration
	ForwardEvery     time.Duration // ingress forwarding poll
	Now              func() time.Time
}

// FromEnv reads Config. Secrets are required only by commands that need them.
func FromEnv() (Config, error) {
	c := Config{
		Addr:          env("EM2_ADDR", ":8080"),
		AdminAddr:     env("EM2_ADMIN_ADDR", "127.0.0.1:9090"),
		DatabaseURL:   os.Getenv("EM2_DATABASE_URL"),
		RoleIsolation: env("EM2_DB_ROLE_ISOLATION", "on") != "off",
		TrustProxy:    env("EM2_TRUST_PROXY", "off") == "on",
		MediaDir:      env("EM2_MEDIA_DIR", "data/media"),

		NetAllowPrivate: env("EM2_NET_ALLOW_PRIVATE", "off") == "on",
	}
	var err error
	if c.Mode, err = kernel.ParseRunMode(env("EM2_MODE", string(kernel.ModeShadow))); err != nil {
		return c, err
	}
	if err := c.LogLevel.UnmarshalText([]byte(env("EM2_LOG_LEVEL", "info"))); err != nil {
		return c, fmt.Errorf("EM2_LOG_LEVEL: %w", err)
	}
	if v := os.Getenv("EM2_SIGNING_KEY"); v != "" {
		if c.SigningKey, err = base64.StdEncoding.DecodeString(v); err != nil {
			return c, errors.New("EM2_SIGNING_KEY is not valid base64")
		}
	}
	if v := os.Getenv("EM2_KEY_PEPPER"); v != "" {
		if c.KeyPepper, err = base64.StdEncoding.DecodeString(v); err != nil {
			return c, errors.New("EM2_KEY_PEPPER is not valid base64")
		}
	}
	return c, nil
}

func env(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

// Modules builds every module EM2 runs. Add new modules here.
func Modules(c Config) ([]kernel.Module, error) {
	icfg := identity.Config{SigningSeed: c.SigningKey, Pepper: c.KeyPepper}
	if c.FastHashing {
		icfg.Argon2 = identity.FastArgon2
	}
	id, err := identity.New(icfg)
	if err != nil {
		return nil, err
	}
	dir := c.MediaDir
	if dir == "" {
		dir = "data/media"
	}
	media, err := storage.NewFS(dir)
	if err != nil {
		return nil, err
	}
	in, err := ingest.New(ingest.Config{Media: media})
	if err != nil {
		return nil, err
	}
	rules, err := ecbridge.BuiltinRuleset(ecbridge.DefaultRuleset)
	if err != nil {
		return nil, err
	}
	vd, err := verdict.New(verdict.Config{Rules: rules})
	if err != nil {
		return nil, err
	}
	guard := &netguard.Guard{AllowPrivate: c.NetAllowPrivate}
	if c.NetAllowPrivate {
		guard.Ports = func(int) bool { return true }
	}
	return []kernel.Module{id, ledger.New(ledger.Config{DefaultThreshold: rules.Threshold}), in, vd,
		ingress.New(ingress.Config{Guard: guard, ForwardEvery: c.ForwardEvery}), egress.New(egress.Config{Guard: guard})}, nil
}

// Open connects to the database (if configured) and boots a kernel with all modules.
func Open(ctx context.Context, c Config, log *slog.Logger) (*kernel.Kernel, *pgxpool.Pool, error) {
	var pool *pgxpool.Pool
	if c.DatabaseURL != "" {
		pc, err := pgxpool.ParseConfig(c.DatabaseURL)
		if err != nil {
			return nil, nil, errors.New("EM2_DATABASE_URL is not a valid connection string")
		}
		if pool, err = pgxpool.NewWithConfig(ctx, pc); err != nil {
			return nil, nil, err
		}
	}
	mods, err := Modules(c)
	if err != nil {
		if pool != nil {
			pool.Close()
		}
		return nil, nil, err
	}
	k := kernel.New(kernel.Config{Pool: pool, Mode: c.Mode, Logger: log, RoleIsolation: c.RoleIsolation,
		TrustProxy: c.TrustProxy, DispatchInterval: c.DispatchInterval, Now: c.Now})
	if err := k.Register(mods...); err != nil {
		return nil, pool, err
	}
	if err := k.Boot(); err != nil {
		return nil, pool, err
	}
	return k, pool, nil
}
