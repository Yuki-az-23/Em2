---
name: forgejo-api
description: Read and write Forgejo issues, pull requests, comments, labels and releases from this devbox. Use for any issue/PR/review/comment/release task, and ALWAYS before telling the user that Forgejo is unreachable, that it is behind Cloudflare, that there is no token, or that something needs `gh`.
---

# The Forgejo API from this devbox

You have a working API token and a route to it. If you are about to say
otherwise, run the self-check below first — that claim has been wrong every
time it has been made on this estate.

## Two different things share one server

Confusing them is the failure that keeps repeating:

| Job | Endpoint | Auth |
|---|---|---|
| clone / fetch / push | `git@192.168.1.50:<owner>/<repo>.git` | ed25519 key — see the `forgejo-workflow` skill |
| issues, PRs, comments, labels, releases | `http://192.168.1.50:3000/api/v1` | token in an `Authorization` header |

`forgejo-workflow` covers the left column only. It says "do not reach for a
token", and for **git remotes** that is still right — a token in a remote URL
sits in plaintext in a container the tenant has a shell in. The API token is a
different object with a different rule: it lives in a `0600` file and is only
ever sent as a header. Never put it in a URL, a remote, or `.git-credentials`.

## Never use `git.noit2.com` for the API

`git.noit2.com` is the **web UI**, behind Cloudflare Access and then Authentik.
An API call to it returns **302** to `noit2il.cloudflareaccess.com` — a login
page, not an error. Your token is never even looked at. Measured on all three
devboxes, 2026-09-10:

    http://192.168.1.50:3000/api/v1/version   -> 200
    https://git.noit2.com/api/v1/version      -> 302  (Cloudflare Access)

Same box, CT 910. **A 302 to Cloudflare means you used the wrong hostname, not
that access is blocked.** Use the LAN IP for every API call.

## The token

    ~/.config/forgejo/token     40 hex chars, mode 0600
    ~/.config/forgejo/env       same value as FORGEJO_TOKEN / FORGEJO_API

    TOKEN=$(cat ~/.config/forgejo/token)
    curl -s -H "Authorization: token $TOKEN" http://192.168.1.50:3000/api/v1/...

Scope is `write:issue,write:repository`. That is enough to list, create,
comment on, label, close and merge issues and PRs.

## Self-check — run this before claiming anything is impossible

```bash
TOKEN=$(cat ~/.config/forgejo/token)
API=http://192.168.1.50:3000/api/v1
for p in /version /repos/<owner>/<repo> /repos/<owner>/<repo>/issues; do
  printf '%-46s -> ' "$p"
  curl -s -m 8 -o /dev/null -w '%{http_code}\n' -H "Authorization: token $TOKEN" "$API$p"
done
```

Read the result like this:

| Code | Meaning |
|---|---|
| **200** | Working. Proceed. Do not ask the user to paste anything. |
| **302** | You used `git.noit2.com`. Switch to `http://192.168.1.50:3000`. |
| **000** | Nothing answered — this box is not in CT 910's port-3000 allowlist (`/etc/pve/firewall/910.fw` on node `pve`, 192.168.1.20). Only the operator can add it. Say exactly that. |
| **401** | Token file empty or truncated — check `wc -c`, expect 40. |
| **403** | **Scope**, never connectivity. See below. |
| **404** on a repo | That repo belongs to another tenant. Correct behaviour, not a fault. |

**A 403 on one endpoint family while another returns 200 is always a scope
problem.** `GET /api/v1/user` returns **403** here on purpose — the token has
no `read:user`. Any tool that "validates" a token by probing `/user` will call
this one broken. It is not. Judge the token by the endpoint you actually need.

## `gh` does not work here

This is Forgejo, not GitHub. `gh` is not installed and would not authenticate
if it were. If an intent pulls you toward a GitHub skill or a `gh` command,
that skill has captured the wrong platform — come back here.

## Doing the work

`curl` is fine for reads. For anything with a body, use Python — JSON quoting
through the shell is where these break:

```python
import json, os, urllib.request
API   = "http://192.168.1.50:3000/api/v1"
TOKEN = open(os.path.expanduser("~/.config/forgejo/token")).read().strip()

def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "token " + TOKEN)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, json.loads(r.read() or b"null")

call("GET",   "/repos/OWNER/REPO/issues?state=open")
call("POST",  "/repos/OWNER/REPO/issues", {"title": "...", "body": "..."})
call("POST",  "/repos/OWNER/REPO/issues/12/comments", {"body": "..."})
call("PATCH", "/repos/OWNER/REPO/issues/12", {"state": "closed"})
call("GET",   "/repos/OWNER/REPO/pulls?state=open")
```

## Scope of your access

The token is **yours**, not a shared admin one — comments and issues are
authored as this box's own Forgejo account, which is what the audit trail
should show. You can reach the repos you own and those you are a collaborator
on. A **404** on another tenant's repo is the tenant boundary working. Do not
try to route around it; ask the operator if you genuinely need access.

## If you still think you cannot

Say which check failed and what code it returned. Do not fall back to printing
an issue body for the user to copy by hand, and do not ask them to paste a
token — you have one.
