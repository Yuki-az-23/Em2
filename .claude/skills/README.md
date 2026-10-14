# Platform operation skills

This repository includes the platform operation skill pack used for this estate's workflow and deployment model.

## Included skills

- `argocd`
- `argo-workflows`
- `forgejo-api`
- `forgejo-actions`
- `forgejo-workflow`

## Why they exist

These skills enforce the repo boundary and governance model:

- Forgejo handles git and API operations.
- Argo CD is the deployment gate for cluster manifest changes.
- Argo Workflows runs long-running jobs outside the chat session.
- Forgejo Actions is the native CI path for PR and push checks.

Use them with the core project architecture in AGENTS.md and the task framework in docs/.
