from __future__ import annotations

import json
import os
from pathlib import Path

REFRESH_SECONDS = 60


def claude_home() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def settings_path() -> Path:
    return claude_home() / "settings.json"


def previous_path() -> Path:
    return claude_home() / "ctxline-previous.json"


def read_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    return json.loads(path.read_text() or "{}")


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    staging.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    staging.replace(path)


def is_ours(status_line: object) -> bool:
    return isinstance(status_line, dict) and "ctxline" in str(status_line.get("command", ""))


def install(command: str) -> str:
    settings = read_json(settings_path())
    current = settings.get("statusLine")
    if current and not is_ours(current):
        write_json(previous_path(), {"statusLine": current})
    settings["statusLine"] = {
        "type": "command",
        "command": command,
        "padding": 0,
        "refreshInterval": REFRESH_SECONDS,
    }
    write_json(settings_path(), settings)
    if current and not is_ours(current):
        return f"Saved your old status line to {previous_path()}. `ctxline uninstall` puts it back."
    return ""


def uninstall() -> str:
    settings = read_json(settings_path())
    if not is_ours(settings.get("statusLine")):
        return "ctxline isn't your status line, so nothing changed."
    previous = read_json(previous_path()).get("statusLine")
    if previous:
        settings["statusLine"] = previous
        message = "Put your previous status line back."
    else:
        settings.pop("statusLine")
        message = "Removed the ctxline status line."
    write_json(settings_path(), settings)
    previous_path().unlink(missing_ok=True)
    return message
