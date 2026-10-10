# ADR-010: CI on Forgejo and GitHub in parallel; deploy by GitOps pull request

Status: accepted (M0)

## Decision
- `.forgejo/workflows/ci.yml` (runner label `docker`) and `.github/workflows/ci.yml` run the same jobs:
  seed validation, seed script tests, `go vet`, unit and contract tests, integration tests against a
  Postgres service, and the container build.
- Deploys never use `kubectl`. `deploy/k8s/` holds the manifests; a cluster change is a pull request
  to the cluster manifests repository, merged and then synced by the owner in Argo CD.
- Long jobs (replay corpus, load tests) run as Argo Workflows `batch-run` jobs.

## Consequences
Two CI files must stay in step; a CI check could compare their job names later. Forgejo ignores
`.github/workflows/` once `.forgejo/workflows/` exists, so each forge reads only its own file.
