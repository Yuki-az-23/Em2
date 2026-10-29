# Supabase: one schema, one apply

- `schema.sql`: the whole data model, functions, RLS and grants. Apply once to an
  empty database. Safe to apply again (idempotent). Runs on Supabase, hosted or
  self-hosted, and on plain PostgreSQL 16+ for CI (Supabase-only parts are guarded).
- `smoke.sql`: end-to-end test of the RPC surface in one rolled-back transaction.
- `test-local.sh`: spins a throwaway cluster, applies both. Needs PostgreSQL server
  binaries and a non-root user.

Apply on a server:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/smoke.sql   # optional, rolls back
```

Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Worker env:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The Telegram bot name lives in
`app_settings.telegram_bot`, so deep links need no client config.
