# EM2 agents and architecture contract

EM2 is an emotion-guided communication proxy. Agents talk through it; humans observe through it.
This file is the project-wide contract. It follows the `agent-architecture-seed` template and adds
the rules that are specific to EM2. The full design is in [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Architecture invariants

Seed invariants:

- The core contract (`core/`) is stable and is not rewritten for protocol- or provider-specific logic.
- Adapters (`internal/adapters/`) and plugins (`internal/plugins/`) register through the kernel registry.
- Data (`ingest`), execution (`verdict`), portfolio (`ledger`) and audit (`journal`) stay separate modules
  with separate Postgres schemas. A module never reads another module's tables.
- Each milestone is a major architecture step with its own gate.
- Every subsystem has its own tests and QA gate.

EM2 invariants:

- **Sender claims are untrusted.** Anything a sender or upstream asserts (an emotion/color label, headers,
  user agent) lives in `core.Claims`. The verdict engine, the ECBridge plugin and the feed never read it.
  A message's emotional state starts from the sender's ledger stance. See ADR-011.
- **Senders learn only accepted or denied.** Score, bridge, threshold, reason and rule version flow to the
  receiver and the journal, never back to the sender. Pass, shape and defer look identical to a sender.
- **No endpoint sets a message's emotion or color.** State changes only through pressure crossing a threshold.
- **No endpoint returns another principal's current bridge or threshold**, apart from the coarse public card.
- **Public errors are generic.** problem+json with a request id; technical detail goes to internal logs and the journal.
- **The UI contains no third-party code.** `web/` is AGPL-3.0-or-later code written in this repo, with no build step.
- **Dependencies are minimal.** Go: `github.com/jackc/pgx/v5` and `golang.org/x/crypto` only.

## Agent roles

Definitions live in `.claude/agents/`. Each has an "In EM2" section naming the paths it owns.

| Role | Owns |
|---|---|
| `orchestrator` | routing work to the owner, milestone awareness |
| `validator` | gate checks before `phase:done` and milestone signoff |
| `core-architect` | `core/`, `docs/contracts/`, `docs/adr/`, this file |
| `kernel-engineer` | `kernel/`, `cmd/em2`, run modes, `internal/modules/identity` |
| `data-engineer` | `internal/modules/ingest`, `pkg/markdown` |
| `execution-engineer` | `internal/modules/verdict`, `pkg/ecbridge` |
| `portfolio-reconciler` | `internal/modules/ledger` |
| `journal-auditor` | `internal/modules/journal` |
| `adapter-specialist` | `internal/adapters/`, `internal/storage/` |
| `plugin-specialist` | `internal/plugins/`, rulesets |
| `qa-regression` | `test/` |
| `infra-release` | `deploy/`, `.forgejo/`, `.github/`, `docs/RUNBOOK.md` |
| `docs-maintainer` | `docs/`, `agent/`, `CLAUDE.md`, `README.md` |
| `observatory-engineer` | `web/` |

`python3 scripts/orchestrator.py --path <file>` prints the owner for a path.

## Platform operations skills

- `argocd` — deploy via GitOps, never direct cluster mutation
- `argo-workflows` — long-running jobs and batch execution (replay corpus, load tests)
- `forgejo-api` — repo, issue, PR, and release operations via the LAN API
- `forgejo-actions` — CI workflow rules and runner selection
- `forgejo-workflow` — Git push/clone/key and repository conventions

CI runs in parallel on Forgejo (`.forgejo/workflows/ci.yml`, runner `docker`) and GitHub
(`.github/workflows/ci.yml`). The two files run the same jobs.

## Operating rules

- Read this file and the relevant `docs/contracts/` file before making changes.
- Keep subsystem boundaries intact. Cross-module calls go through services resolved from the registry
  or through events, and only to modules listed in `DependsOn`.
- Every task has a `milestone:` and a `project:` label (see `docs/task-taxonomy.md`).
- Every implementation has a verification step. A milestone unlocks the next only when
  `docs/milestones/M<n>.md` records green evidence for every required check.

## Required checks

| Scope | Checks | Command |
|---|---|---|
| task | unit, contract | `go test ./...` |
| subsystem | unit, smoke, regression | `go test ./... ./test/smoke/... ./test/regression/...` |
| milestone | milestone gate, integration | `python3 scripts/validate_project.py` and `EM2_TEST_DATABASE_URL=... go test ./test/integration/...` |
| release | smoke, health | `go test ./test/smoke/...` against the deployed URL; `GET /healthz`, `GET /readyz` |

## Deliverable expectation

Each task produces: scope, affected subsystem, milestone, verification plan, and evidence summary.

## Recursive self-update loop

- `scripts/seed_spec.py` is the single list of required files, milestones, modules and agents
- `scripts/project_manifest.py` writes `.project-manifest.json`
- `scripts/validate_project.py` confirms required files, agents and a fresh manifest (non-zero exit on failure)
- `scripts/orchestrator.py` selects the responsible subsystem owner
- `scripts/self_update.py` detects drift and repairs missing project metadata before work continues
