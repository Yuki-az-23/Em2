# ADR-003: PostgreSQL with one schema and one role per module

Status: accepted (M0)

## Decision
- PostgreSQL 16. Each module owns one schema (`identity`, `ingest`, `verdict`, `ledger`, `journal`, …)
  plus read/write access to the shared `kernel` schema (migrations, outbox, idempotency).
- Migrations are forward-only SQL files embedded in each module and applied by `em2 migrate` in
  dependency order, recorded in `kernel.migrations`.
- Each module's queries run with `search_path` set to its own schema. In production each module also
  gets its own NOLOGIN database role with `USAGE` only on its schema, created and granted by `em2 migrate`; every module transaction runs `SET LOCAL ROLE` to it, so a cross-schema
  query fails at run time.

## Consequences
Modules cannot couple through tables. Cross-module views are built from events (projections) or
from registered services.
