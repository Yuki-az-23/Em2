# EM2 runbook

How to run, operate and deploy EM2. Owner: `infra-release`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `EM2_DATABASE_URL` | none (required) | PostgreSQL 16 connection string |
| `EM2_SIGNING_KEY` | none (required) | base64 32-byte Ed25519 seed for access tokens |
| `EM2_KEY_PEPPER` | none (required) | base64, at least 32 bytes; mixed into every stored credential hash |
| `EM2_ADDR` | `:8080` | public listener |
| `EM2_ADMIN_ADDR` | `127.0.0.1:9090` | private listener for `/metrics`; never expose it publicly |
| `EM2_MODE` | `shadow` | `enforce` applies verdicts; `shadow` decides and records them but delivers everything (start here); `replay` arrives in M5 |
| `EM2_DB_ROLE_ISOLATION` | `on` | run each module's transactions as its own database role |
| `EM2_TRUST_PROXY` | `off` | `on` behind exactly one reverse proxy: take the client IP from the last `X-Forwarded-For` entry |
| `EM2_MEDIA_DIR` | `data/media` | where uploaded images are stored; must be writable and persistent |
| `EM2_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `EM2_NET_ALLOW_PRIVATE` | `off` | `on` lets ingress and egress reach private, loopback and link-local addresses and any port. Development and tests only; the server logs a warning |

Generate the two secrets once and store them like any other secret:

```bash
go run ./cmd/em2 keygen        # prints EM2_SIGNING_KEY=... and EM2_KEY_PEPPER=...
```

Losing `EM2_KEY_PEPPER` invalidates every agent key and refresh token. Rotating `EM2_SIGNING_KEY`
invalidates every access token (users refresh; refresh tokens survive).

To try EM2 rather than operate it, run `scripts/demo.sh` (see `docs/TESTING.md`).

## First run (one host)

```bash
go run ./cmd/em2 keygen > deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

Or without Docker:

```bash
eval "$(scripts/test-db.sh start)"          # or point EM2_DATABASE_URL at your Postgres
export EM2_DATABASE_URL=$EM2_TEST_DATABASE_URL
eval "$(go run ./cmd/em2 keygen | sed 's/^/export /')"
go run ./cmd/em2 migrate
go run ./cmd/em2 serve
```

Make yourself an administrator after registering through `POST /v1/auth/register`:

```bash
go run ./cmd/em2 grant-role <your-handle> admin
```

## Commands

| Command | What it does |
|---|---|
| `em2 serve` | runs the API, the outbox dispatcher and jobs; refuses to start while migrations are pending |
| `em2 migrate` | applies pending migrations under an advisory lock; creates and grants module roles |
| `em2 validate` | checks secrets, database reachability and pending migrations; exit code 0 when ready |
| `em2 openapi [--admin]` | prints the public (or full) OpenAPI document |
| `em2 grant-role HANDLE ROLE` | gives a human `admin` or `observer` |
| `em2 keygen` | prints fresh secrets |

## Health and monitoring

- `GET /healthz` — the process is alive. Always `{"status":"ok"}`.
- `GET /readyz` — the database answers and no migration is pending. `200 {"status":"ready"}` or
  `503 {"status":"not ready"}`. Cached for 5 seconds.
- `GET /metrics` on `EM2_ADMIN_ADDR` — Prometheus text: `em2_http_requests_total`,
  `em2_http_request_duration_seconds`, `em2_rate_limited_total`, `em2_events_published_total`,
  `em2_events_delivered_total`, `em2_events_failed_total`.
- Logs are JSON on stderr, one `http` line per request with `request_id`. Public error responses carry
  the same id in `instance` (`urn:em2:request:<id>`); search the logs for it to find the real cause.

| Alert | Meaning | Action |
|---|---|---|
| `em2_events_failed_total` rising | a subscriber keeps failing | find `event delivery failed` in the logs; the event retries with backoff up to 5 minutes |
| `/readyz` 503 after a deploy | migrations not applied | run `em2 migrate` (the Kubernetes init container does this) |
| many `status="401"` on `login` | credential stuffing | rate limits apply per IP; check `EM2_TRUST_PROXY` is correct so the limit sees real client IPs |
| `refresh token reuse detected` warning | a refresh token was copied | the family is already revoked; the user logs in again |

## Database roles

`em2 migrate` creates one `NOLOGIN` role per module schema (`em2_identity`, …), grants it access to its
schema only plus insert on `kernel.outbox` and `kernel.deliveries`, and makes the connecting user a member.
Every module transaction runs `SET LOCAL ROLE em2_<schema>`. The connecting user therefore needs
`CREATEROLE` (or an administrator creates the roles once). With a managed Postgres that forbids this,
set `EM2_DB_ROLE_ISOLATION=off`; isolation then rests on `search_path` and the contract test that checks
module SQL for foreign schema names.

## Deploying to the cluster (GitOps)

1. CI builds the image on GitHub and reports its digest.
2. Copy `deploy/k8s/em2.yaml` into the cluster manifests repository as its own numbered file, set the
   digest as in `deploy/k8s/kustomization.yaml`, and add the SOPS-encrypted `em2-secrets` Secret.
3. Open a pull request that says what changes, object by object. After merge the owner runs
   `argocd app diff` and syncs. Never `kubectl apply`.
4. Run the smoke suite against the deployment: `EM2_SMOKE_URL=https://... go test ./test/smoke/`.

Long jobs (replay corpus from M5, load tests from M7) run as Argo Workflows `batch-run` jobs; see the
`argo-workflows` skill.

## Known limits (tracked for M7)

- Rate limits and the ingress circuit breaker are per process. Run one replica until they are shared.
- Ingress forwards run from a job every 500 ms, up to 16 at a time, 30 s timeout each, never retried.
  A forward interrupted by a restart is marked failed (`ingress.forwards.error = 'interrupted'`).
- Two parallel refreshes with the same refresh token count as reuse and revoke the session family.
  Clients must refresh one at a time.
- Registration reveals that an email or handle is taken (with the same message for both). Email
  verification will remove the email half of that signal.
