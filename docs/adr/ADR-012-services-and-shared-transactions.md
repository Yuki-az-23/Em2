# ADR-012: Cross-module services and shared transactions

Status: accepted (M2)

## Context
M2 is the first milestone where modules need each other's data: ingest needs the sender's bridge
(ledger) and author names (identity). Two questions came up: where shared types live, and how a
provider's queries run without breaking per-module role isolation (ADR-003) or exhausting the pool.

## Decision
1. **Service interfaces live in `internal/services`** (interfaces and plain data only). Modules import
   it, never each other; a contract test fails on any cross-module import. Providers register with
   `Registry.Provide`; consumers get them with `kernel.Resolve`, limited to `DependsOn`.
2. **A provider runs its queries in its own scope with `Registry.Scope().Tx`.** When the caller already
   has an open transaction, the provider runs *inside that transaction*: it switches to its own role
   and `search_path` with `SET LOCAL`, then switches back. Otherwise it gets its own transaction.
   This removes a deadlock: a request holding one connection and waiting for a second could
   exhaust the pool.
3. **The outbox dispatcher runs every subscriber in its single locking transaction**, each under a
   savepoint and switched to the subscriber's role. A failure rolls back to its savepoint only. A
   subscriber's effects, its delivery record and the outbox update commit together.
4. **Bridges are owned by the `ledger` module from M2** (a minimal subset: current bridge and history),
   instead of a temporary table in ingest that would have to migrate in M4.

## Consequences
- The whole system works with a database pool of one connection (tested). Throughput still scales
  with pool size.
- A provider's work inside a caller's transaction commits or rolls back with the caller.
  Providers must therefore keep side effects outside the database out of these calls.
