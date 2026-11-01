from __future__ import annotations

import math
from pathlib import Path

SEPARATOR = " · "
RESET = "\033[0m"
DIM = "\033[2m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"

LIMIT_LABELS = (("five_hour", "5h"), ("seven_day", "wk"))


def round_half_up(value: float) -> int:
    return math.floor(value + 0.5)


def paint(code: str, text: str, color: bool) -> str:
    return f"{code}{text}{RESET}" if color else text


def tone_for(remaining_pct: float) -> str:
    if remaining_pct <= 10:
        return RED
    if remaining_pct <= 25:
        return YELLOW
    return GREEN


def time_until(seconds: float) -> str:
    if seconds <= 60:
        return "now"
    minutes = int(seconds // 60)
    if minutes >= 24 * 60:
        return f"{minutes // (24 * 60)}d"
    if minutes >= 60:
        return f"{minutes // 60}h"
    return f"{minutes}m"


def token_amount(tokens: int) -> str:
    if tokens < 1_000_000:
        return f"{round_half_up(tokens / 1000)}k"
    return f"{round_half_up(tokens / 10_000) / 100:.2f}M"


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def section(payload: dict, key: str) -> dict:
    value = payload.get(key)
    return value if isinstance(value, dict) else {}


def git_branch(directory: str | None) -> str | None:
    if not directory:
        return None
    for folder in (Path(directory), *Path(directory).parents):
        dot_git = folder / ".git"
        try:
            if dot_git.is_file():
                pointer = dot_git.read_text().strip()
                if not pointer.startswith("gitdir:"):
                    return None
                dot_git = (folder / pointer.removeprefix("gitdir:").strip()).resolve()
            if not dot_git.is_dir():
                continue
            head = (dot_git / "HEAD").read_text().strip()
        except OSError:
            return None
        if head.startswith("ref: refs/heads/"):
            return head.removeprefix("ref: refs/heads/")
        return head[:7] or None
    return None


def session_fields(payload: dict, branch: str | None, color: bool) -> list[str]:
    fields = []
    model = section(payload, "model").get("display_name")
    if model:
        fields.append(paint(CYAN, model, color))
    directory = section(payload, "workspace").get("current_dir") or payload.get("cwd")
    if directory:
        place = Path(directory).name or directory
        fields.append(paint(DIM, f"{place} ⑂ {branch}" if branch else place, color))
    return fields


def context_field(payload: dict, color: bool) -> str | None:
    window = section(payload, "context_window")
    tokens = sum(
        window.get(key) for key in ("total_input_tokens", "total_output_tokens") if is_number(window.get(key))
    )
    used = window.get("used_percentage")
    size = window.get("context_window_size")
    if not is_number(used):
        if not tokens or not is_number(size) or size <= 0:
            return None
        used = tokens / size * 100
    text = f"ctx {token_amount(tokens)} ({round_half_up(used)}%)" if tokens else f"ctx {round_half_up(used)}%"
    return paint(tone_for(100 - used), text, color)


def is_live(window: dict, now: float) -> bool:
    resets_at = window.get("resets_at")
    return is_number(window.get("used_percentage")) and (not is_number(resets_at) or resets_at > now)


def has_limits(limits: dict) -> bool:
    return any(is_number(section(limits, key).get("used_percentage")) for key, _ in LIMIT_LABELS)


def limit_fields(limits: dict, now: float, color: bool) -> list[str]:
    if not has_limits(limits):
        return []
    fields = []
    for key, label in LIMIT_LABELS:
        window = section(limits, key)
        if not is_live(window, now):
            fields.append(paint(GREEN, f"{label} 0%", color))
            continue
        used = window["used_percentage"]
        text = paint(tone_for(100 - used), f"{label} {round_half_up(used)}%", color)
        resets_at = window.get("resets_at")
        if is_number(resets_at):
            text += paint(DIM, f"({time_until(resets_at - now)})", color)
        fields.append(text)
    return fields


def cost_field(payload: dict, color: bool) -> str | None:
    cost = section(payload, "cost").get("total_cost_usd")
    if not is_number(cost):
        return None
    return paint(DIM, f"${round_half_up(cost * 100) / 100:,.2f}", color)


def render(
    payload: dict,
    now: float,
    branch: str | None = None,
    color: bool = True,
    limits: dict | None = None,
) -> str:
    fields = session_fields(payload, branch, color)
    fields.append(context_field(payload, color))
    fields.extend(limit_fields(section(payload, "rate_limits") if limits is None else limits, now, color))
    fields.append(cost_field(payload, color))
    return SEPARATOR.join(field for field in fields if field)
