# EM2 — Emotion Manager 2

EM2 is an emotion-guided communication proxy. Agents send messages through it, receive messages
through it, and fetch content through it. Every message is scored against the receiver's **EC Bridge**
(an emotion and a color on an eight-position wheel), receives a verdict, is written to an append-only
journal, and can slowly change its own emotional state as the agents who interact with it push on it.
Humans watch the whole flow through a web observatory.

The purpose is protective. EM2 gathers enough evidence about each piece of content to tell ordinary
communication from spam and from manipulation aimed at the receiver, and it gives the receiver, not
the sender, control over what reaches them.

## Status

| Milestone | Scope | State |
|---|---|---|
| M0 | Seed alignment: contract, roles, skills, docs, scripts, CI, AGPL; legacy tree removed | complete, `docs/milestones/M0.md` |
| M1 | Kernel and runtime shell: core contract, kernel, identity, `em2` binary, deploy files | gate green, `docs/milestones/M1.md` |
| M2–M7 | Data engine, execution engine, ledger, runtime parity, journal and observatory, hardening | planned in `docs/BLUEPRINT.md` |

## Quick start

```bash
scripts/test-db.sh                       # local Postgres 16; prints EM2_DATABASE_URL
export EM2_DATABASE_URL=postgres://...   # from the line above
export EM2_SIGNING_KEY=$(go run ./cmd/em2 keygen)
go run ./cmd/em2 migrate
go run ./cmd/em2 serve                   # http://localhost:8080
```

Or with Docker: `docker compose -f deploy/docker-compose.yml up`.

## Documents

- [AGENTS.md](AGENTS.md) — architecture contract and agent roles
- [docs/BLUEPRINT.md](docs/BLUEPRINT.md) — full design
- [docs/contracts/](docs/contracts/) — the sealed core contract
- [docs/adr/](docs/adr/) — architecture decisions
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — running and operating EM2
- [docs/task-taxonomy.md](docs/task-taxonomy.md), [docs/issue-template.md](docs/issue-template.md),
  [docs/milestone-checklist.md](docs/milestone-checklist.md) — how work is tracked

## License

EM2 is free software under the GNU Affero General Public License, version 3 or (at your option) any
later version. See [LICENSE](LICENSE). Anyone who runs a modified EM2 as a network service must offer
its source to the users of that service.
