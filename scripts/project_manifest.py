#!/usr/bin/env python3
"""Generate the EM2 project manifest from the repository structure.

The manifest gives every agent a fresh view of modules, milestones, workflow
names, validation requirements and architecture invariants.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import seed_spec as spec

ROOT = Path(__file__).resolve().parents[1]


def find_modules(root: Path) -> List[str]:
    return [name for name, paths in spec.MODULE_PATHS.items() if any((root / p).is_dir() for p in paths)]


def build_manifest(root: Path = ROOT) -> Dict[str, object]:
    return {
        "project": spec.PROJECT,
        "architecture": {
            "core": "sealed-core",
            "pattern": "registry-driven-modules",
            "product": "emotion-guided-communication-proxy",
            "planes": ["bus", "ingress", "egress"],
            "invariants": spec.INVARIANTS,
        },
        "modules": find_modules(root),
        "milestones": spec.MILESTONES,
        "workflows": spec.WORKFLOWS,
        "skills": spec.REQUIRED_SKILLS,
        "validators": spec.VALIDATORS,
        "required_checks": spec.REQUIRED_CHECKS,
    }


def main() -> None:
    out = ROOT / ".project-manifest.json"
    out.write_text(json.dumps(build_manifest(ROOT), indent=2) + "\n", encoding="utf-8")
    print(f"manifest written to {out}")


if __name__ == "__main__":
    main()
