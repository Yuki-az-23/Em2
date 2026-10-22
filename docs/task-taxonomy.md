# Task, phase, milestone, and issue label taxonomy

This document defines the project taxonomy for EM2. It is the seed template's taxonomy with EM2's milestone
names; the label sets are unchanged so tooling built for the seed keeps working.

## 1. Task phases

Each task should pass through the following phases:

1. `phase:discovery`
   - Understand the requirement and map it to the affected subsystem.
2. `phase:design`
   - Define the contract, boundary, and minimal API impact.
3. `phase:implementation`
   - Implement the fix or feature within the correct subsystem.
4. `phase:verification`
   - Run unit, contract, or smoke tests to prove behavior.
5. `phase:review`
   - Check for cross-boundary breakage and milestone alignment.
6. `phase:done`
   - Mark the task as complete only when validation and QA are evidence-backed.

## 2. Milestone structure

Use a milestone-based release model:

- `milestone:M0` — seed alignment (contract, roles, skills, docs, scripts, CI, license)
- `milestone:M1` — kernel/runtime shell (core contract, kernel, identity, `em2` binary, deploy files)
- `milestone:M2` — data engine (`ingest`: normalizers, dossier, Markdown, media, replay reader)
- `milestone:M3` — execution engine (`verdict`, ECBridge v2, ingress forwarding, egress fetch)
- `milestone:M4` — portfolio and reconciliation (`ledger`: bridges, quotas, reputation, reconciliation)
- `milestone:M5` — runtime parity (enforce, shadow, replay; golden-table parity)
- `milestone:M6` — journal and audit (`journal`, observatory UI, wellbeing, agent discovery)
- `milestone:M7` — QA and contract hardening (security suite, load, release gate)

`docs/BLUEPRINT.md` section C1 lists each milestone's scope and gate evidence. A milestone is closed by
`docs/milestones/M<n>.md`, which records the result of every required check.

Every task must have one milestone label, unless it is a cross-cutting or planning issue.

## 3. Project labels

Use project-type labels to keep ownership explicit:

- `project:core`
- `project:kernel`
- `project:registry`
- `project:data`
- `project:execution`
- `project:portfolio`
- `project:journal`
- `project:adapters`
- `project:plugins`
- `project:infra`
- `project:frontend`
- `project:docs`

## 4. Priority labels

- `priority:p0`
- `priority:p1`
- `priority:p2`

## 5. Quality labels

- `type:bug`
- `type:feature`
- `type:refactor`
- `type:security`
- `type:docs`
- `type:ci`
- `type:qa`
- `type:regression`
- `type:smoke`
- `type:contract`

## 6. Issue workflow

Each issue should be completed using this workflow:

1. Add labels: project + milestone + priority + type
2. Set current phase to `phase:discovery`
3. Record affected contract or module boundary
4. Implement the smallest safe change
5. Run required validation
6. Update the issue with evidence
7. Move to `phase:done` only after milestone gate is green

## 7. Acceptance checklist for each task

A task is considered complete only when all are true:

- the scope is clearly bounded
- the affected subsystem is known
- the milestone is identified
- the contract or boundary is preserved
- tests or smoke checks were run
- a result summary is attached
- no required QA gate is skipped

## 8. Acceptance checklist for each milestone

A milestone is considered complete only when all are true:

- all subsystem issues for that milestone are closed or explicitly deferred
- all required contract tests pass
- all smoke tests pass
- regression tests pass
- integration check passes
- release gate or deploy gate passes when required
- milestone summary is documented
