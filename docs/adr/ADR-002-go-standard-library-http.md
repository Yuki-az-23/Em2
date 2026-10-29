# ADR-002: Go with the standard library HTTP server

Status: accepted (M0)

## Context
The owner chose Go or Rust and then Go. The kernel is the product, so a framework would duplicate it.

## Decision
Go 1.24, `net/http` with method and path-pattern routing, `log/slog`, `crypto/ed25519`. Third-party Go
modules are limited to `github.com/jackc/pgx/v5` (MIT) and `golang.org/x/crypto` (BSD-3-Clause, for
argon2id). Any new dependency needs an ADR. Rust was rejected: no standard-library HTTP server and
slower iteration; its advantage (a WebAssembly ECBridge shared with the UI) is covered by golden tables
that a small JavaScript mirror is tested against.

## Consequences
One static binary. Small attack surface and dependency review load.
