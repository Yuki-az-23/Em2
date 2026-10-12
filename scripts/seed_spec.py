"""Single source of truth for the EM2 seed contract.

The four seed scripts (project_manifest, validate_project, orchestrator,
self_update) all read their lists from here so they cannot drift apart.
"""

from __future__ import annotations

PROJECT = "em2"

# Files every EM2 checkout must have. The first block is the seed template's
# own list; the second block is what EM2 adds on top of it.
SEED_FILES = [
    "AGENTS.md",
    "README.md",
    ".claude/agents/README.md",
    ".claude/skills/README.md",
    ".claude/skills/argocd/SKILL.md",
    ".claude/skills/argo-workflows/SKILL.md",
    ".claude/skills/forgejo-api/SKILL.md",
    ".claude/skills/forgejo-actions/SKILL.md",
    ".claude/skills/forgejo-workflow/SKILL.md",
    ".codex/README.md",
    ".gitignore",
    "scripts/project_manifest.py",
    "scripts/validate_project.py",
    "scripts/orchestrator.py",
    "docs/task-taxonomy.md",
    "docs/issue-template.md",
    "docs/milestone-checklist.md",
    "docs/project-checklist.md",
]

EM2_FILES = [
    "LICENSE",
    "CLAUDE.md",
    "go.mod",
    "docs/BLUEPRINT.md",
    "docs/legacy/README.md",
    "docs/contracts/message.md",
    "docs/contracts/verdict.md",
    "docs/contracts/bridge.md",
    "docs/contracts/dossier.md",
    "docs/contracts/journal.md",
    "docs/adr/ADR-011-trust-boundary-and-disclosure.md",
    "docs/RUNBOOK.md",
    "docs/TESTING.md",
    "docs/milestones/M0.md",
    "docs/milestones/M1.md",
    "docs/milestones/M2.md",
    "docs/milestones/M3.md",
    "docs/milestones/M4.md",
    "docs/adr/ADR-012-services-and-shared-transactions.md",
    "docs/adr/ADR-013-verdicts-after-assessment-and-asynchronous-ingress.md",
    "docs/adr/ADR-014-quotas-reputation-and-probes.md",
    ".forgejo/workflows/ci.yml",
    ".github/workflows/ci.yml",
]

REQUIRED_FILES = SEED_FILES + EM2_FILES

REQUIRED_SKILLS = [
    "argocd",
    "argo-workflows",
    "forgejo-api",
    "forgejo-actions",
    "forgejo-workflow",
]

MILESTONES = [
    "M0-seed-alignment",
    "M1-kernel-runtime-shell",
    "M2-data-engine",
    "M3-execution-engine",
    "M4-portfolio-reconciliation",
    "M5-runtime-parity",
    "M6-journal-audit",
    "M7-qa-contract-hardening",
]

WORKFLOWS = ["task", "subsystem", "milestone", "release"]

VALIDATORS = [
    "unit-tests",
    "contract-tests",
    "smoke-tests",
    "regression-tests",
    "milestone-gate",
]

REQUIRED_CHECKS = {
    "task": ["unit-tests", "contract-tests"],
    "subsystem": ["unit-tests", "smoke-tests", "regression-tests"],
    "milestone": ["milestone-gate", "integration-tests"],
    "release": ["smoke-tests", "health-checks"],
}

INVARIANTS = [
    "core-remains-stable",
    "adapters-are-isolated",
    "plugins-are-registered",
    "data-and-execution-are-separated",
    "portfolio-and-journal-are-explicit",
    "qa-is-required-for-every-milestone",
    "sender-claims-are-untrusted",
    "senders-learn-only-accepted-or-denied",
    "no-endpoint-sets-message-emotion",
    "ui-has-no-third-party-code",
]

# Seed subsystem -> EM2 directories it owns. A module "exists" when any of its
# paths exists in the working tree.
MODULE_PATHS = {
    "core": ["core"],
    "kernel": ["kernel", "cmd"],
    "registry": ["kernel"],
    "data": ["internal/modules/ingest", "pkg/markdown"],
    "execution": ["internal/modules/verdict", "pkg/ecbridge"],
    "portfolio": ["internal/modules/ledger"],
    "journal": ["internal/modules/journal"],
    "adapters": ["internal/adapters", "internal/storage"],
    "plugins": ["internal/plugins"],
    "infra": ["deploy", ".forgejo", ".github"],
    "frontend": ["web"],
    "docs": ["docs", "agent"],
    "identity": ["internal/modules/identity"],
}

AGENT_MAP = {
    "core": "core-architect",
    "kernel": "kernel-engineer",
    "registry": "kernel-engineer",
    "identity": "kernel-engineer",
    "data": "data-engineer",
    "execution": "execution-engineer",
    "portfolio": "portfolio-reconciler",
    "journal": "journal-auditor",
    "adapters": "adapter-specialist",
    "plugins": "plugin-specialist",
    "infra": "infra-release",
    "frontend": "observatory-engineer",
    "docs": "docs-maintainer",
    "qa": "qa-regression",
}

AGENT_REGISTRY = [
    "orchestrator",
    "validator",
    "core-architect",
    "kernel-engineer",
    "data-engineer",
    "execution-engineer",
    "portfolio-reconciler",
    "journal-auditor",
    "adapter-specialist",
    "plugin-specialist",
    "qa-regression",
    "infra-release",
    "docs-maintainer",
    "observatory-engineer",
]

# The pre-proxy tree (Supabase/React app and old docs), removed in M0. Any of
# these paths reappearing fails validation, so the old tree cannot creep back.
LEGACY_PATHS = [
    "src",
    "supabase",
    "em2-agent-skill",
    "Docs",
    ".agent",
    "package.json",
    "vite.config.js",
    "capacitor.config.json",
    "eslint.config.js",
    "index.html",
    "SETUP.md",
    "TESTING.md",
    "public",
]
