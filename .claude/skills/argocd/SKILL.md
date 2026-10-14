---
name: argocd
description: How deploys to the platform's k3s cluster work — Argo CD watches noit2/sandbox-platform and the owner syncs it, so a cluster change is a pull request, never kubectl. Use when asked to deploy, change or add something on the cluster, when someone mentions Argo CD, GitOps, "sync", OutOfSync, an Application or ApplicationSet, or before touching cluster/manifests.
---

# Argo CD here

Argo CD (v3.5.3, on the platform's k3s cluster, VM 160) deploys the cluster from git. It is not Argo
**Workflows**: Workflows runs jobs (the `argo` CLI, the `argo-workflows` skill); Argo CD keeps the
cluster equal to a git repo.

## What it watches

| | |
|---|---|
| Application | `sandbox-platform-cluster` (project `default`, namespace `argocd`) |
| Repo, path, branch | `noit2/sandbox-platform`, `cluster/manifests/`, `main` |
| Sync | **manual**: no auto-sync, no auto-prune. Nothing deploys until the owner presses Sync |
| UI | `https://argocd.zonkey-cichlid.ts.net`, tailnet only, Authentik login, `authentik Admins` only |

Devboxes have **no Argo CD access**: no `argocd` CLI, no login, and no tailnet. That is by design.
You change the cluster through git, and the owner deploys it.

## Getting a change onto the cluster

1. Edit or add a manifest under `cluster/manifests/` in `noit2/sandbox-platform` (numbered files,
   e.g. `48-argocd.yaml`; put a new component in its own number), on a branch.
2. Open a pull request into `main`. Say what the cluster will change, object by object.
3. After the merge, **the owner** runs `argocd app diff sandbox-platform-cluster`, checks it shows
   exactly your change, and syncs.

A change that is not on `main` is not deployed: Argo CD reads nothing else. The reverse is also
true. Anything live on the cluster that `main` lacks is reverted by the next sync, which is why
fixes applied by hand must land on `main` before anyone syncs.

## Never

- **`kubectl apply` / `kubectl edit` on objects Argo CD tracks.** The next sync reverts it, and until
  then git and the cluster disagree without anyone knowing. The cluster API is not reachable from a
  devbox anyway.
- **`scripts/apply.sh` from a branch or an old checkout.** It rsyncs with `--delete`, so it removes
  from the VM whatever that checkout lacks.
- Putting a secret in a manifest in plain text. App secrets are SOPS-encrypted files decrypted in
  the cluster (see the repo's README); the owner holds the keys.

## Reading its state

- **OutOfSync on every object, with no content diff**, means the objects were created before Argo CD
  existed and carry no Argo CD tracking marker yet. The first manual sync (server-side apply, prune
  off) adds the marker and changes nothing else. As of 2026-09-29 that first sync has not been done,
  so OutOfSync is expected and is not drift.
- Real drift shows as a content diff in `argocd app diff`. Take it to the owner; do not "fix" it on
  the cluster.

## Not yet (planned)

PR preview environments still come from Argo **Workflows** (`pr-env-up`). An Argo CD ApplicationSet
with a pull-request generator is planned to replace that. Until it exists, do not write one: it would
be synced by nobody and would mislead the next reader.
