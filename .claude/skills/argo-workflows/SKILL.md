---
name: argo-workflows
description: "Run long or heavy jobs (builds, test suites, dataset passes) as Argo Workflows on the platform's k3s cluster with the `argo` CLI, then follow them and read their output. Use when work would outlive a chat turn or a sandbox session, or when the user mentions Argo, workflows, batch jobs or batch-run."
---

# Argo Workflows (`argo` CLI)

`argo` is installed and already connected to the platform's Argo Server with a token for your
client. Do not set `ARGO_SERVER`, `ARGO_TOKEN` or a kubeconfig yourself, and never print, copy or
send the token file.

## Your values

- namespace: this devbox's client namespace, in `~/.config/argo-sbx/namespace` (`cat` it). `argo`
  uses it by default and it is the only one you can use: `sbx-batch-admin` on the admin devbox,
  `sbx-batch-ztania` on Tania's.
- template: `batch-run` — the only thing you can run

**No `~/.config/argo-sbx/token` on this devbox means it has no Argo access** (not every devbox is
an Argo client). Say so and stop; do not look for another credential. Access is added by the
platform owner (sandbox-platform `agents/argo/install.sh`).

## Run a job

    argo submit --from workflowtemplate/batch-run \
      -p command='git clone --depth 1 https://github.com/<owner>/<repo> && cd <repo> && make test' \
      -p timeout=1800 \
      -o name

- `command` runs with `sh -c` in `registry.sbx.local/sbx-runtime:v1`, under gVisor, as a non-root
  user, with a read-only root filesystem. The working directory is `/workspace` (writable, 8 GiB);
  `/tmp` is writable too (1 GiB). Both are thrown away when the job ends.
- `timeout` is in seconds (default 600). The job is killed when it runs out.
- It can reach the internet. It cannot reach anything on the LAN (Forgejo, model proxies, Proxmox,
  other containers) — clone public repos over HTTPS, and do not try to work around the block.
- `-o name` prints just the run's name (like `batch-run-x7k2p`). Keep it.

## Follow it and get the result

    argo wait <name>             # block until it finishes
    argo get <name>              # phase (Succeeded / Failed / Error), duration, message
    argo logs <name> -c main     # the command's output: this is the job's only result
    argo logs <name> -c main -f  # follow live output instead
    argo list                    # your recent runs
    argo delete <name>           # clean up when you are done

A finished run is deleted automatically one hour after it completes, logs included. Copy what you
need out of `argo logs` before then. The job cannot push anything anywhere: bring results back
through its output, then commit from your normal workspace.

## Rules

- Only `batch-run` can run. A workflow file with its own templates (`argo submit my.yaml`) is
  accepted by the API and then failed immediately by the controller with a message about
  "reference mode" (`templateReferencing: Strict`). That is by design — do not try to get around it.
- You can only see and touch your own namespace. `PermissionDenied … not allowed to … in namespace`
  for anything else is by design.
- Do not put untrusted or unreviewed code (from the internet, a chat user, a repo you have not
  read) through `batch-run`: use the sandbox tools (k8s-agent-sandbox skill) for that.

## If `argo` fails

- `argo: no Argo token here`, `… more than 24 h old`, or `Unauthenticated` / `401`: the platform's
  token delivery is broken. Tell the user and quote the error. Do not look for another credential.
- `PermissionDenied`: you addressed another namespace or a resource you do not have. Stay in
  your namespace and use `batch-run`.
- A run that ends `Failed` or `Error`: `argo get <name>` shows why; `argo logs <name> -c main` shows
  what the command printed before it stopped.
