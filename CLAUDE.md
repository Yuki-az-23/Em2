# CLAUDE.md

Guidance for Claude Code in this repository.

## What EM2 is

EM2 (Emotion Manager 2) is an emotion-guided communication proxy written in Go. Every message that
passes through it is scored against the receiver's "EC Bridge" (an emotion and a color on an
8-position wheel), gets a verdict (pass, shape, defer, deny), is journaled, and may add pressure that
moves the message's own emotion/color one wheel step. Agents are the actors; humans observe through a
zero-build web observatory.

Read these first:

- `AGENTS.md` — the architecture contract and invariants. It overrides anything else here.
- `docs/BLUEPRINT.md` — the full design (modules, schemas, REST, ECBridge v2, milestones).
- `docs/contracts/` — the sealed core contract, one file per core type.
- `docs/adr/` — decisions and their reasons. ADR-011 (trust boundary) matters for almost every change; ADR-013 explains when verdicts are decided and why ingress is asynchronous; ADR-014 why a principal never sees their own reputation.

## Commands

```bash
go build ./...                      # build everything
go test ./...                       # unit + contract tests (no database needed)
go vet ./...
go run ./cmd/em2 serve              # needs EM2_DATABASE_URL and EM2_SIGNING_KEY (see docs/RUNBOOK.md)
go run ./cmd/em2 migrate            # apply module migrations
go run ./cmd/em2 openapi            # print the public OpenAPI document
go run ./cmd/em2 golden             # regenerate the ECBridge golden tables
EM2_TEST_DATABASE_URL=postgres://... go test ./test/integration/...   # integration tests
python3 scripts/validate_project.py # seed gate: required files, agents, fresh manifest
python3 -m unittest discover -s scripts/tests -t .   # tests for the seed scripts
```

`scripts/test-db.sh` starts a throwaway local Postgres 16 and prints the URL for the integration tests.
`scripts/demo.sh` runs a narrated end-to-end scenario against the real binary (`docs/TESTING.md`).

## Layout

| Path | What |
|---|---|
| `core/` | sealed contract: types only, no logic, stdlib only |
| `kernel/` | registry, lifecycle, router, request pipeline, problem+json, rate limit, outbox, metrics, OpenAPI |
| `pkg/` | pure libraries: `schema` (validation), `markdown`, `dossier`, `ecbridge` (score, target, pressure, decision table, rulesets, golden tables) |
| `internal/modules/` | one package per module, one Postgres schema per module: `identity`, `ledger`, `ingest`, `verdict` |
| `internal/services/` | interfaces modules provide to each other (ADR-012); modules never import each other |
| `internal/storage/` | media store (filesystem) |
| `internal/adapters/` | protocol edges: `ingress` (reverse proxy, ADR-013), `egress` (fetch), `mcp` (MCP endpoint and discovery documents, ADR-015), `convert` (payload to Markdown) |
| `agent/` | what agents read: `SKILL.md`, MCP registry entry `server.json`, client examples |
| `internal/netguard/` | the only way EM2 dials out for a principal: checks every resolved address and redirect |
| `internal/plugins/` | policy plugins (later milestones) |
| `cmd/em2/` | the single binary |
| `test/` | `contract`, `regression`, `smoke`, `integration` (and later `security`) |
| `deploy/` | Dockerfile, docker-compose, Kubernetes manifests for the GitOps PR |
| `web/` | observatory UI (from M6); currently only `src/tokens.css` |
| `exhibit/` | the art exhibit, a separate React + Supabase + Cloudflare Worker app with its own tests and CI; see `exhibit/README.md` and ADR-016 |
| `scripts/` | seed coordination scripts (Python, stdlib only) |

## Rules that are easy to break

- Never add a field to a sender-facing response that carries a score, bridge, threshold, reason or rule version.
- Never let a verdict or ECBridge computation read `core.Message.Claims`.
- Return errors through `kernel.Problem` helpers; never write `err.Error()` into a response body.
- A module's SQL touches only its own schema. Cross-module data goes through registered services or events.
- No new Go dependency without an ADR. No third-party code in `web/`.
- Changes to `core/` need a matching change in `test/contract/` and an ADR.
- A service a module provides runs its queries through `Registry.Scope().Tx`, never with the caller's DB handle.
- Sender-facing paths (publish, ingress) return the same response for every accepted input and use `MinDuration`.
- Verdict fields (`score`, `threshold`, `rule_version`) may appear only on receiver-owned operations; the
  contract test lists them. Verdicts are decided after the dossier, never on the publish path (ADR-013).
- Never dial out for a principal except through `internal/netguard`.
- Never show a principal their own reputation or outcome counts; they would reveal receivers' verdicts (ADR-014).
- An MCP tool is a mapping to one public REST operation in `internal/adapters/mcp/tools.go`; never implement behaviour in the MCP adapter itself.
- After changing `pkg/ecbridge` scoring or targets, run `go run ./cmd/em2 golden` and review the diff.

## Legacy

Both earlier versions live only in git history: the Express/MongoDB backend at commit `8102416`
(`OLD/API/`), and the React/Supabase rebuild at commit `805d510` (`src/`, `supabase/`, `Docs/`).
The validator fails if any legacy path reappears.
`docs/legacy/README.md` explains how to read it and what was learned from it.
