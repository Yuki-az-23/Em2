#!/usr/bin/env python3
"""Route EM2 work to the correct subsystem owner.

Usage:
  scripts/orchestrator.py                      routing table for every module
  scripts/orchestrator.py --path kernel/x.go   owner for the given paths
  scripts/orchestrator.py --repair             self-heal missing seed metadata
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import seed_spec as spec
from scripts.self_update import SelfUpdatePlanner

ROOT = Path(__file__).resolve().parents[1]

# Longest prefix wins, so internal/modules/ingest beats internal/.
_PATH_OWNERS = sorted(
    ((p, m) for m, paths in spec.MODULE_PATHS.items() for p in paths),
    key=lambda pm: len(pm[0]),
    reverse=True,
)


def module_for_path(path: str) -> str:
    while path.startswith("./"):
        path = path[2:]
    if path.startswith("test/"):
        return "qa"
    for prefix, module in _PATH_OWNERS:
        if path == prefix or path.startswith(prefix + "/"):
            return module
    return "core"


def choose_agent(module_name: str) -> dict:
    key = module_name.lower().strip()
    return {
        "requested_module": module_name,
        "selected_agent": spec.AGENT_MAP.get(key, "core-architect"),
        "validation": spec.REQUIRED_CHECKS["task"],
        "milestone_gate": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Route work to the correct subsystem and optionally self-heal repo drift.")
    parser.add_argument("--repair", action="store_true", help="Refresh the project manifest and repair missing metadata.")
    parser.add_argument("--path", action="append", default=[], help="A path the task touches; may repeat.")
    args = parser.parse_args()

    if args.repair:
        print(json.dumps({"repair": SelfUpdatePlanner(ROOT).sync_missing_files()}, indent=2))
        return
    if args.path:
        print(json.dumps({"routes": [{"path": p, **choose_agent(module_for_path(p))} for p in args.path]}, indent=2))
        return
    print(json.dumps({"agents": [choose_agent(m) for m in spec.AGENT_MAP]}, indent=2))


if __name__ == "__main__":
    main()
