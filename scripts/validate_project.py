#!/usr/bin/env python3
"""Validate the repo against the EM2 seed contract.

Run by agents before work starts. Checks the required architecture files and
that the committed manifest matches the working tree. Prints a structured
pass/fail result and exits non-zero on failure so CI can gate on it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import seed_spec as spec
from scripts.project_manifest import build_manifest

ROOT = Path(__file__).resolve().parents[1]


def validate(root: Path = ROOT) -> dict:
    missing = [rel for rel in spec.REQUIRED_FILES if not (root / rel).exists()]
    problems = []
    manifest_path = root / ".project-manifest.json"
    if not manifest_path.exists():
        problems.append(".project-manifest.json missing; run scripts/project_manifest.py")
    elif json.loads(manifest_path.read_text(encoding="utf-8")) != build_manifest(root):
        problems.append(".project-manifest.json is stale; run scripts/project_manifest.py and commit it")
    agents_dir = root / ".claude" / "agents"
    for name in spec.AGENT_REGISTRY:
        if not (agents_dir / f"{name}.md").exists():
            problems.append(f"agent definition missing: .claude/agents/{name}.md")
    legacy = [rel for rel in spec.LEGACY_PATHS if (root / rel).exists()]
    return {
        "project": spec.PROJECT,
        "status": "pass" if not (missing or problems) else "fail",
        "missing": missing,
        "problems": problems,
        "warnings": ["legacy tree present; removal pending owner approval (M0)"] if legacy else [],
        "legacy_present": legacy,
        "required_files": spec.REQUIRED_FILES,
    }


def main() -> None:
    result = validate()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["status"] == "pass" else 1)


if __name__ == "__main__":
    main()
