import json
import tempfile
import unittest
from pathlib import Path

from scripts import seed_spec as spec
from scripts.orchestrator import choose_agent, module_for_path
from scripts.project_manifest import build_manifest
from scripts.self_update import SelfUpdatePlanner
from scripts.validate_project import validate


def make_tree(root: Path, files) -> None:
    for rel in files:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("# test\n", encoding="utf-8")


class SelfUpdatePlannerTests(unittest.TestCase):
    def test_detects_missing_project_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_tree(root, ["AGENTS.md", ".claude/agents/README.md"])
            plan = SelfUpdatePlanner(root).build_plan()
            self.assertEqual(plan["status"], "repair-needed")
            self.assertIn("LICENSE", plan["missing"])

    def test_builds_manifest_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_tree(root, spec.REQUIRED_FILES)
            summary = SelfUpdatePlanner(root).build_plan()
            self.assertEqual(summary["status"], "pass")
            self.assertEqual(summary["missing"], [])
            self.assertEqual(summary["legacy_present"], [])
            self.assertIn("M0-seed-alignment", summary["milestones"])

    def test_legacy_tree_coming_back_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_tree(root, spec.REQUIRED_FILES + ["src/main.jsx"])
            summary = SelfUpdatePlanner(root).build_plan()
            self.assertEqual(summary["status"], "fail")
            self.assertEqual(summary["legacy_present"], ["src"])

    def test_repair_creates_missing_files_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = SelfUpdatePlanner(root).sync_missing_files()
            self.assertEqual(sorted(result["updated"]), sorted(spec.REQUIRED_FILES))
            self.assertTrue((root / ".project-manifest.json").exists())


class ValidatorTests(unittest.TestCase):
    def test_fails_on_stale_manifest_and_missing_agents(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_tree(root, spec.REQUIRED_FILES)
            (root / ".project-manifest.json").write_text("{}", encoding="utf-8")
            result = validate(root)
            self.assertEqual(result["status"], "fail")
            self.assertTrue(any("stale" in p for p in result["problems"]))
            self.assertTrue(any("agent definition missing" in p for p in result["problems"]))

    def test_fails_when_legacy_path_returns(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_tree(root, spec.REQUIRED_FILES + [f".claude/agents/{a}.md" for a in spec.AGENT_REGISTRY] + ["package.json"])
            (root / ".project-manifest.json").write_text(json.dumps(build_manifest(root)), encoding="utf-8")
            result = validate(root)
            self.assertEqual(result["status"], "fail")
            self.assertTrue(any("package.json" in p for p in result["problems"]))

    def test_passes_on_complete_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_tree(root, spec.REQUIRED_FILES + [f".claude/agents/{a}.md" for a in spec.AGENT_REGISTRY])
            (root / ".project-manifest.json").write_text(json.dumps(build_manifest(root)), encoding="utf-8")
            self.assertEqual(validate(root)["status"], "pass")


class OrchestratorTests(unittest.TestCase):
    def test_routes_paths_to_most_specific_owner(self):
        cases = {
            "internal/modules/ingest/normalize.go": "data-engineer",
            "internal/modules/verdict/decide.go": "execution-engineer",
            "internal/modules/ledger/x.go": "portfolio-reconciler",
            "internal/adapters/ingress/proxy.go": "adapter-specialist",
            "pkg/ecbridge/score.go": "execution-engineer",
            "core/message.go": "core-architect",
            "kernel/router.go": "kernel-engineer",
            "web/src/kernel/router.js": "observatory-engineer",
            "test/smoke/boot_test.go": "qa-regression",
            ".forgejo/workflows/ci.yml": "infra-release",
        }
        for path, agent in cases.items():
            with self.subTest(path=path):
                self.assertEqual(choose_agent(module_for_path(path))["selected_agent"], agent)

    def test_every_agent_in_map_has_a_definition(self):
        root = Path(__file__).resolve().parents[2]
        for agent in set(spec.AGENT_MAP.values()) | set(spec.AGENT_REGISTRY):
            with self.subTest(agent=agent):
                self.assertTrue((root / ".claude" / "agents" / f"{agent}.md").exists())


if __name__ == "__main__":
    unittest.main()
