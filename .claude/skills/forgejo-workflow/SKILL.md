---
name: forgejo-workflow
description: Git against the estate's own Forgejo — how auth works here, repo conventions, and the failure modes. Use for any git operation, clone, push, remote change, or when a push asks for a password.
---

# Git here

`git.noit2.com` is Forgejo, running in CT 910 on this LAN. It is the only
remote your work should go to.

**This skill covers git only** — clone, fetch, push. Issues, pull requests,
comments, labels and every other `/api/v1` call go over a **token** to
`http://192.168.1.50:3000` instead; see the `forgejo-api` skill. Never send an
API call to `git.noit2.com`: it answers **302 to Cloudflare Access**, which is
a login page, not a permission error.

## Auth is a key, not a token

Every devbox holds an ed25519 key at `~/.ssh/id_forgejo`, generated inside the
container. The private half has never left it. Forgejo holds only the public
half, registered as `devbox-<vmid>`.

`~/.gitconfig` rewrites HTTP(S) URLs to SSH, so pasting a clone URL out of the
web UI does the right thing:

```
https://git.noit2.com/Azadmin/workspace.git   →   git@192.168.1.50:Azadmin/workspace.git
```

**The web UI is `git.noit2.com`; git traffic goes to `192.168.1.50` directly.**
That is deliberate — the Cloudflare tunnel carries HTTP only, so git-over-SSH
cannot route through it. `SSH_DOMAIN` is pinned to the IP for this reason.

## If a push asks for a password

Something is wrong with the key path — do not answer the prompt, and do not
reach for a token. (The API token in `~/.config/forgejo/token` is a separate
object for a separate job; it is never an answer to a git password prompt and
never belongs in a remote URL.) Check in this order:

```bash
ssh -T git@192.168.1.50                  # should greet you by username
git remote -v                            # should be git@… , never http://…
git config --global --get-all url.git@192.168.1.50:.insteadOf
git config --global credential.helper    # should print NOTHING
```

A remote of the form `http://user:hex@…` is the old token scheme. It was
removed on purpose: the token sat in plaintext in a container the tenant has a
shell in. Re-run `devbox-git-wire <vmid>` on the host rather than restoring it.

## Repos

| Owner | What |
|---|---|
| your own account | `workspace` — your `/workspace`, private, backed up |
| `noit2` org | shared platform repos, team-gated |

Teams on the org: `owners`, `builders`, `partners`. Membership follows the
Authentik group, not a Forgejo-local decision.

## Conventions

- Default branch `main`
- `.gitignore` already excludes `.env`, `*.key`, `*.pem`, `id_*`,
  `.git-credentials`, `auth.json`, `credentials.json`. Do not remove those
  lines — the workspace repo is where a secret would otherwise get committed.
- Commit as yourself; identity is already set from Authentik. Do not override
  `user.email` per-repo.

## Logging in to the web UI

`git.noit2.com` sits behind Cloudflare Access and then Authentik. Forgejo keeps
no separate password worth using — it links your account by **email**. If a
login creates a *second* account instead of using yours, the Authentik email
does not match the Forgejo one; fix the email rather than keeping both.
