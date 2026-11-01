import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from ctxline import settings
from ctxline.limits import current_limits
from ctxline.line import git_branch, render

CASES = json.loads((ROOT / "tests" / "fixtures" / "cases.json").read_text())


class RenderTest(unittest.TestCase):
    def test_shared_cases(self):
        for case in CASES:
            with self.subTest(case["name"]):
                self.assertEqual(render(case["payload"], case["now"], case["branch"], color=False), case["expected"])

    def test_tone_follows_what_is_left(self):
        line = render({"rate_limits": {"five_hour": {"used_percentage": 80}, "seven_day": {"used_percentage": 95}}}, 0)
        self.assertIn("\033[33m5h 80%", line)
        self.assertIn("\033[31mwk 95%", line)


class GitBranchTest(unittest.TestCase):
    def test_reads_head_from_a_parent_folder(self):
        with tempfile.TemporaryDirectory() as repo:
            (Path(repo) / ".git").mkdir()
            (Path(repo) / ".git" / "HEAD").write_text("ref: refs/heads/workshop/level-3\n")
            nested = Path(repo) / "app" / "src"
            nested.mkdir(parents=True)
            self.assertEqual(git_branch(str(nested)), "workshop/level-3")

    def test_follows_a_worktree_pointer(self):
        with tempfile.TemporaryDirectory() as root:
            gitdir = Path(root) / "main" / ".git" / "worktrees" / "feature"
            gitdir.mkdir(parents=True)
            (gitdir / "HEAD").write_text("ref: refs/heads/feature\n")
            worktree = Path(root) / "feature"
            worktree.mkdir()
            (worktree / ".git").write_text(f"gitdir: {gitdir}\n")
            self.assertEqual(git_branch(str(worktree)), "feature")

    def test_detached_head_shows_a_short_hash(self):
        with tempfile.TemporaryDirectory() as repo:
            (Path(repo) / ".git").mkdir()
            (Path(repo) / ".git" / "HEAD").write_text("1c9ddeb0a1b2c3d4\n")
            self.assertEqual(git_branch(repo), "1c9ddeb")


class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.TemporaryDirectory()
        os.environ["CLAUDE_CONFIG_DIR"] = self.home.name

    def tearDown(self):
        del os.environ["CLAUDE_CONFIG_DIR"]
        self.home.cleanup()

    def write_settings(self, data):
        (Path(self.home.name) / "settings.json").write_text(json.dumps(data))

    def read_settings(self):
        return json.loads((Path(self.home.name) / "settings.json").read_text())

    def test_install_keeps_other_settings_and_the_old_line(self):
        old = {"type": "command", "command": "~/.claude/scripts/claude-statusline"}
        self.write_settings({"model": "opus", "statusLine": old})
        settings.install("/bin/ctxline")
        saved = self.read_settings()
        self.assertEqual(saved["model"], "opus")
        self.assertEqual(saved["statusLine"]["command"], "/bin/ctxline")
        self.assertEqual(saved["statusLine"]["refreshInterval"], 60)
        settings.uninstall()
        self.assertEqual(self.read_settings()["statusLine"], old)
        self.assertFalse((Path(self.home.name) / "ctxline-previous.json").exists())

    def test_reinstall_does_not_save_itself_as_the_old_line(self):
        settings.install("/bin/ctxline")
        settings.install("/usr/local/bin/ctxline")
        settings.uninstall()
        self.assertNotIn("statusLine", self.read_settings())

    def test_uninstall_leaves_someone_elses_line_alone(self):
        self.write_settings({"statusLine": {"type": "command", "command": "other"}})
        settings.uninstall()
        self.assertEqual(self.read_settings()["statusLine"]["command"], "other")


class LimitsMemoryTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.TemporaryDirectory()
        os.environ["CLAUDE_CONFIG_DIR"] = self.home.name

    def tearDown(self):
        del os.environ["CLAUDE_CONFIG_DIR"]
        self.home.cleanup()

    def test_a_new_session_shows_the_last_limits_seen(self):
        seen = {"five_hour": {"used_percentage": 8, "resets_at": 2000}, "seven_day": {"used_percentage": 28, "resets_at": 9000}}
        current_limits({"rate_limits": seen}, 1000)
        limits = current_limits({}, 1500)
        self.assertEqual(render({}, 1500, color=False, limits=limits), "5h 8%(8m) · wk 28%(2h)")

    def test_nothing_is_shown_before_any_limits_are_seen(self):
        self.assertEqual(render({}, 0, color=False, limits=current_limits({}, 0)), "")


class CliTest(unittest.TestCase):
    def test_bad_input_prints_an_empty_line(self):
        home = tempfile.TemporaryDirectory()
        self.addCleanup(home.cleanup)
        result = subprocess.run(
            [sys.executable, "-m", "ctxline"],
            input="not json",
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONPATH": str(ROOT / "src"), "CLAUDE_CONFIG_DIR": home.name},
        )
        self.assertEqual((result.returncode, result.stdout), (0, "\n"))


if __name__ == "__main__":
    unittest.main()
