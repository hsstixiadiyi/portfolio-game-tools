"""可被 Agent 调用的真实工具函数。

每个工具统一返回 {"ok": bool, "data": ..., "error": str | None}，
便于编排层用同一套逻辑处理成功与失败。
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any


def read_file(path: str) -> dict[str, Any]:
    target = Path(path)
    if not target.is_file():
        return {"ok": False, "data": None, "error": f"文件不存在：{path}"}
    return {"ok": True, "data": target.read_text(encoding="utf-8"), "error": None}


def write_file(path: str, content: str) -> dict[str, Any]:
    target = Path(path)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    except OSError as exc:
        return {"ok": False, "data": None, "error": str(exc)}
    return {"ok": True, "data": str(target), "error": None}


def count_words(text: str, top_n: int = 8) -> dict[str, Any]:
    tokens = re.findall(r"[\u4e00-\u9fff]|[A-Za-z]+|\d+", text)
    if not tokens:
        return {"ok": True, "data": "（空文本，无词频统计结果）", "error": None}
    counter = Counter(tokens)
    lines = [f"{word}\t{count}" for word, count in counter.most_common(top_n)]
    return {"ok": True, "data": "\n".join(lines), "error": None}


def to_upper(text: str) -> dict[str, Any]:
    return {"ok": True, "data": text.upper(), "error": None}


TOOLS = {
    "read_file": read_file,
    "write_file": write_file,
    "count_words": count_words,
    "to_upper": to_upper,
}


def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    tool = TOOLS.get(name)
    if tool is None:
        return {"ok": False, "data": None, "error": f"未知工具：{name}"}
    try:
        return tool(**arguments)
    except TypeError as exc:
        return {"ok": False, "data": None, "error": f"参数不匹配：{exc}"}
    except Exception as exc:  # 保证单个工具异常不会中断整条工作流
        return {"ok": False, "data": None, "error": f"{type(exc).__name__}: {exc}"}
