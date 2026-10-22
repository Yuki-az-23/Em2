# Codex project guidance

EM2 is an emotion-guided communication proxy built on the sealed-core seed
architecture. `AGENTS.md` is the full contract; read it first.

## Required operating model

- keep the core contract (`core/`) stable; change it only with an ADR and a contract test
- register modules, adapters and plugins through the kernel registry; never import across modules
- keep data (`ingest`), execution (`verdict`), portfolio (`ledger`) and audit (`journal`) separate
- treat sender claims as untrusted; tell senders only accepted or denied (ADR-011)
- make each milestone a verified integration gate, recorded in `docs/milestones/`
- keep subsystem-specific CI and QA checks green on both Forgejo and GitHub

## Before you push

```bash
python3 scripts/validate_project.py
go vet ./... && go test ./...
eval "$(scripts/test-db.sh start)" && go test -race ./...
```
