from __future__ import annotations

import json
from pathlib import Path

from ctxline.line import has_limits, section
from ctxline.settings import claude_home, write_json


def memory_path() -> Path:
    return claude_home() / "cache" / "ctxline-limits.json"


def current_limits(payload: dict, now: float) -> dict:
    live = section(payload, "rate_limits")
    if has_limits(live):
        try:
            write_json(memory_path(), live)
        except OSError:
            pass
        return live
    try:
        remembered = json.loads(memory_path().read_text())
    except (OSError, ValueError):
        return live
    return remembered if isinstance(remembered, dict) else live
