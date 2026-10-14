---
name: forgejo-actions
description: CI on the estate's Forgejo — writing .forgejo/workflows files, which runner label this account may use, how to see a run's result, and the traps that make CI look green while nothing ran. Use when adding or fixing a workflow, when a push or PR "did not trigger CI", when a job sits queued, or when choosing between a Forgejo job and an Argo batch run.
---

# Forgejo Actions here

Forgejo Actions is GitHub-Actions-compatible CI built into Forgejo (CT 910). Jobs run on
**runners** in CT 130 (`forgejo-runner`, 192.168.1.62), each job inside a fresh container.
Find this devbox's account with `ssh -T git@192.168.1.50` (it greets you by name).

## Which runner to use

| `runs-on:` | Takes jobs from | Image | Use it for |
|---|---|---|---|
| `hermes-default` | Azadmin's repos only | `node:22-trixie-slim` | Azadmin's own CI |
| `hermes-ztania` | ztania's repos only | `node:22-trixie-slim` | ztania's own CI |
| `docker` | any repo on the instance | `node:lts` | the shared runner; **4 jobs at once** |
| `hermes-daytrader-bot`, `hermes-dev_sorbie` | Azadmin's repos | `node:22-trixie-slim` | reserved for those Hermes agents' CI; do not borrow them |

**`self-hosted` and `ubuntu-latest` exist on no runner here.** A job asking for either waits
**queued forever** with no error (zomfiy's CI did, for weeks). The same is true of a label scoped to
another account. If a run sits "Waiting", check `runs-on:` first.

For a job that needs a toolchain (Java, Clojure, Python), run it in that toolchain's image with
`container:` and install `nodejs` as the first step: `actions/checkout` runs as node *inside* the
job container, so an image without node fails at checkout with exit code 127. trading-bot's and
zomfiy's CI both do this with `clojure:temurin-*-tools-deps-bookworm`.

```yaml
# .forgejo/workflows/ci.yml
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: docker
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

## Where the file goes

- `.forgejo/workflows/*.yml`. If a `.forgejo/workflows/` directory exists, Forgejo **ignores
  `.github/workflows/` entirely** — a workflow copied from GitHub into `.github/` then silently
  never runs.
- A workflow can sit disabled in the repo's Actions settings while the file looks fine; one here
  stayed disabled for 22 days. A missing run is not proof the file is wrong.

## Traps that look like green CI

- **`on: workflow_run:` never fires here.** Chain jobs with `needs:` inside one workflow instead.
- **A push made with the job's own token triggers no new run** (same as GitHub). A workflow that
  commits a version bump will not re-test that commit.
- **There is no re-run API.** Re-run from the web UI (git.noit2.com → repo → Actions), or push
  an empty commit: `git commit --allow-empty -m "ci: rerun" && git push`.
- **Webhooks to LAN addresses are refused** unless the receiver's IP is in Forgejo's
  `webhook.ALLOWED_HOST_LIST`. A new LAN receiver needs adding by an admin; until then deliveries
  fail with "can only call allowed HTTP servers".
- **Read the log, not the badge.** A test file that fails to load can make a suite report fewer
  tests and still pass. Compare the test count with the previous run.

## Seeing results

Runs, jobs and logs are API calls, so they go through the `forgejo-api` skill (token, direct to
`http://192.168.1.50:3000`), never through `git.noit2.com`:

```
GET /api/v1/repos/<owner>/<repo>/actions/tasks          # recent runs, newest first, with status
```

## Forgejo job or Argo batch run?

Use a Forgejo job for checks on a push or PR: minutes long, one repo, result shown on the PR.
Use an Argo batch run (`argo-workflows` skill) for long or heavy work: big builds, long test
suites, dataset passes. A runner job holds a shared runner the whole time; Argo runs it in the
cluster and you follow it with `argo logs`.
