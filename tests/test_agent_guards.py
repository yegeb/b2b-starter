import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
HOOKS = ROOT / ".codex" / "hooks"


def run_hook(script, payload):
    return subprocess.run(
        [sys.executable, str(HOOKS / script)], input=json.dumps(payload),
        text=True, capture_output=True,
    )


class CommandGuardTests(unittest.TestCase):
    def test_blocks_destructive_commands(self):
        commands = [
            "git reset --hard HEAD", "git -C /tmp reset --hard",
            "git clean -fd", "git clean --force -d", "git checkout -- .",
            "git restore .", "git restore --staged --worktree file",
            "redis-cli FLUSHALL", "terraform destroy",
        ]
        for command in commands:
            with self.subTest(command=command):
                result = run_hook("destructive_commands.py", {"tool_input": {"command": command}})
                self.assertEqual(result.returncode, 0)
                self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_allows_non_destructive_commands(self):
        for command in ["git status", "git clean -nd", "git restore --staged .", "pnpm medusa db:migrate"]:
            with self.subTest(command=command):
                result = run_hook("destructive_commands.py", {"tool_input": {"command": command}})
                self.assertEqual((result.returncode, result.stdout), (0, ""))


class PatchGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        subprocess.run(["git", "-C", str(self.root), "config", "user.email", "test@example.invalid"], check=True)
        subprocess.run(["git", "-C", str(self.root), "config", "user.name", "Test"], check=True)
        self.migration = "apps/backend/src/modules/company/migrations/Migration1.ts"
        (self.root / self.migration).parent.mkdir(parents=True)
        (self.root / self.migration).write_text("existing\n")
        subprocess.run(["git", "-C", str(self.root), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.root), "commit", "-qm", "initial"], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def check_patch(self, operation, path, denied):
        result = run_hook("protect_files.py", {
            "cwd": str(self.root), "tool_input": {"command": f"*** Begin Patch\n*** {operation}: {path}\n*** End Patch"},
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        if denied:
            self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")
        else:
            self.assertEqual(result.stdout, "")

    def test_protects_sensitive_paths_and_existing_migrations(self):
        for operation, path in [("Update File", ".env"), ("Add File", "apps/backend/.env.production"),
                                ("Delete File", self.migration), ("Update File", self.migration),
                                ("Move to", ".env.local")]:
            with self.subTest(path=path, operation=operation):
                self.check_patch(operation, path, True)

    def test_allows_templates_and_new_migrations(self):
        for path in [".env.template", "apps/backend/.env.example", "apps/backend/src/modules/company/migrations/Migration2.ts", "src/index.ts"]:
            with self.subTest(path=path):
                self.check_patch("Add File", path, False)


class ScannerIntegrationTests(unittest.TestCase):
    def test_scanner_exit_code_controls_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q", "-b", "test-branch", str(root)], check=True)
            (root / "example.txt").write_text("safe\n")
            subprocess.run(["git", "-C", str(root), "add", "example.txt"], check=True)
            scanner = root / "gitleaks"
            args = root / "args"
            env = dict(os.environ, PATH=str(root) + os.pathsep + os.environ["PATH"])
            for exit_code in (0, 1):
                scanner.write_text(f"#!/bin/sh\nprintf '%s\\n' \"$@\" > '{args}'\nexit {exit_code}\n")
                scanner.chmod(0o755)
                result = subprocess.run([sys.executable, str(ROOT / "scripts/git_guard.py"), "pre-commit"], cwd=root, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, exit_code == 0)
                self.assertEqual(args.read_text().splitlines(), ["git", "--staged", "--redact", "--no-banner"])

    def test_missing_scanner_blocks_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q", "-b", "test-branch", str(root)], check=True)
            (root / "example.txt").write_text("safe\n")
            subprocess.run(["git", "-C", str(root), "add", "example.txt"], check=True)
            binary_dir = root / "bin"
            binary_dir.mkdir()
            (binary_dir / "git").symlink_to(shutil.which("git"))
            env = dict(os.environ, PATH=str(binary_dir))
            result = subprocess.run([sys.executable, str(ROOT / "scripts/git_guard.py"), "pre-commit"], cwd=root, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Gitleaks is unavailable", result.stderr)


class CompactHookTests(unittest.TestCase):
    def test_compact_hook_reports_branch_and_changed_files(self):
        config = json.loads((ROOT / ".codex/hooks.json").read_text())
        hook = next(item for item in config["hooks"]["SessionStart"] if item["matcher"] == "^compact$")
        command = hook["hooks"][0]["command"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q", "-b", "test-branch", str(root)], check=True)
            (root / "pending.txt").write_text("example\n")
            result = subprocess.run(command, cwd=root, shell=True, capture_output=True, text=True, check=True)
            self.assertIn("test-branch", result.stdout)
            self.assertIn("?? pending.txt", result.stdout)
            self.assertNotIn("example", result.stdout)


if __name__ == "__main__":
    unittest.main()
