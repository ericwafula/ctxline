from __future__ import annotations

import json
import os
import shlex
import shutil
import sys
import time
from pathlib import Path

from ctxline import __version__, settings
from ctxline.limits import current_limits
from ctxline.line import git_branch, render, section

USAGE = """usage: ctxline [install | uninstall | --version]

  (piped JSON)  print the status line for a Claude Code session
  install       make ctxline your Claude Code status line
  uninstall     remove it and restore the status line you had before
"""

EPHEMERAL_MARKERS = ("/cache/uv/", "/.cache/uv/", "/archive-v")


def own_command() -> str:
    on_path = shutil.which("ctxline")
    executable = Path(on_path) if on_path else Path(sys.argv[0]).absolute()
    return shlex.quote(str(executable))


def print_line() -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    directory = section(payload, "workspace").get("current_dir") or payload.get("cwd")
    color = not os.environ.get("NO_COLOR")
    now = time.time()
    print(render(payload, now, git_branch(directory), color, current_limits(payload, now)))
    return 0


def run_install() -> int:
    command = own_command()
    if any(marker in command for marker in EPHEMERAL_MARKERS):
        print("Install it for good first: uv tool install ctxline, then run ctxline install.", file=sys.stderr)
        return 1
    note = settings.install(command)
    print(f"ctxline is now your status line ({settings.settings_path()}).")
    if note:
        print(note)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args:
        if sys.stdin.isatty():
            print(USAGE, end="")
            return 0
        try:
            return print_line()
        except Exception:
            print("")
            return 0
    if args[0] == "install":
        return run_install()
    if args[0] == "uninstall":
        print(settings.uninstall())
        return 0
    if args[0] in ("--version", "-V"):
        print(__version__)
        return 0
    print(USAGE, end="", file=sys.stderr)
    return 2
