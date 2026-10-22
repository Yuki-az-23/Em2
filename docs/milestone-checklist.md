# Milestone checklist

Use this checklist at the end of each milestone.

## Milestone gate

- [ ] All required tasks for the milestone are assigned and closed or explicitly deferred.
- [ ] All subsystem gates are green.
- [ ] All contract tests pass.
- [ ] All smoke tests pass.
- [ ] Regression tests pass.
- [ ] No core contract violation remains.
- [ ] Integration tests for the milestone pass.
- [ ] Documentation for the milestone is updated.
- [ ] A brief milestone summary is recorded in `docs/milestones/M<n>.md`, with the command and result of every required check.
- [ ] No ADR-011 rule is weakened (no new sender-facing field carries receiver data; public errors stay generic).

## Per subsystem checklist

- [ ] The subsystem scope is clearly defined.
- [ ] Boundary contract is explicit.
- [ ] Required tests are present.
- [ ] The subsystem is validated in isolation.
- [ ] Cross-module impact is checked.
- [ ] Ready for milestone integration.

## Final signoff

- [ ] The milestone status is reviewed by the orchestrator.
- [ ] The validator confirms QA evidence exists.
- [ ] The project manifest is refreshed.
- [ ] The next milestone is unlocked only if the current one is complete.
