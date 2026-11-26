"""最小 Agent 工作流：自然语言 -> 任务拆解 -> 工具调用 -> 状态跟踪 -> 结果汇总。

示例：
    python src/agent.py \
        --task "读取 examples/input.txt，统计词频，写入 demo/word_count.txt" \
        --log demo/run_log.txt

这是一套规则驱动的轻量拆解器，不依赖外部大模型 API；工具函数本身是真实可用的。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from tools import call_tool

Step = dict[str, Any]
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "tools.json"


def enabled_tools() -> set[str]:
    """从 config/tools.json 读取当前启用的工具，禁用工具不参与拆解结果。"""
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {item["name"] for item in config["tools"] if item.get("enabled", False)}


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def plan(task: str) -> list[Step]:
    """把一句自然语言需求拆成有序步骤（基于关键词规则）。"""
    clauses = [part.strip() for part in re.split(r"[，,。；;]+", task) if part.strip()]
    steps: list[Step] = []

    for clause in clauses:
        read_match = re.search(r"(?:读取|打开|读入)\s*([^\s]+)", clause)
        write_match = re.search(r"(?:写入|保存到|输出到|保存至)\s*([^\s]+)", clause)

        if read_match:
            steps.append({
                "tool": "read_file",
                "args": {"path": read_match.group(1)},
                "intent": f"读取文件：{read_match.group(1)}",
            })
        elif "统计词频" in clause or "词频" in clause:
            steps.append({
                "tool": "count_words",
                "args": {},
                "intent": "统计上一步文本的词频",
            })
        elif "大写" in clause:
            steps.append({
                "tool": "to_upper",
                "args": {},
                "intent": "把上一步文本转为大写",
            })
        elif write_match:
            steps.append({
                "tool": "write_file",
                "args": {"path": write_match.group(1)},
                "intent": f"写入文件：{write_match.group(1)}",
            })

    return steps


def execute(steps: list[Step]) -> tuple[list[Step], str | None]:
    """顺序执行步骤，逐步记录状态；任何一步失败都会中止后续步骤。"""
    context: str | None = None
    for index, step in enumerate(steps, start=1):
        step["status"] = "running"
        step["started_at"] = now()
        step["result"] = None
        step["error"] = None

        arguments = dict(step["args"])
        if step["tool"] in {"count_words", "to_upper", "write_file"}:
            if context is None:
                step["status"] = "failed"
                step["error"] = "没有可用的上游数据"
                step["finished_at"] = now()
                break
            if step["tool"] == "write_file":
                arguments["content"] = context
            else:
                arguments["text"] = context

        response = call_tool(step["tool"], arguments)
        step["finished_at"] = now()
        if response["ok"]:
            step["status"] = "success"
            step["result"] = response["data"]
            context = str(response["data"])
        else:
            step["status"] = "failed"
            step["error"] = response["error"]
            break

    final = context if steps and steps[-1]["status"] == "success" else None
    return steps, final


def format_log(task: str, steps: list[Step], final: str | None) -> str:
    lines = [
        f"[{now()}] 收到需求：{task}",
        f"[{now()}] 拆解结果：{len(steps)} 步 -> " + " -> ".join(s["tool"] for s in steps),
    ]
    for index, step in enumerate(steps, start=1):
        status_cn = {
            "running": "运行中",
            "success": "成功",
            "failed": "失败",
        }.get(str(step.get("status")), str(step.get("status")))
        lines.append(
            f"[{now()}] 步骤 {index} {step['tool']} [{status_cn}] {step['intent']}"
        )
        if step.get("error"):
            lines.append(f"[{now()}]   错误：{step['error']}")
    if final is not None:
        lines.append(f"[{now()}] 工作流完成，最终输出：\n{final}")
    else:
        lines.append(f"[{now()}] 工作流未成功完成")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="最小 Agent 工作流 Demo")
    parser.add_argument("--task", required=True, help="自然语言需求")
    parser.add_argument("--log", type=Path, help="可选：把运行日志写入文件")
    parser.add_argument("--json", action="store_true", help="输出步骤状态 JSON")
    args = parser.parse_args()

    steps = [step for step in plan(args.task) if step["tool"] in enabled_tools()]
    if not steps:
        print("未能识别任何可执行步骤。支持的语句：读取 <路径>、统计词频、转大写、写入 <路径>")
        return 2

    executed, final = execute(steps)
    log_text = format_log(args.task, executed, final)
    print(log_text)

    if args.log:
        args.log.parent.mkdir(parents=True, exist_ok=True)
        args.log.write_text(log_text, encoding="utf-8")
    if args.json:
        print(json.dumps(executed, ensure_ascii=False, indent=2))

    return 0 if final is not None else 1


if __name__ == "__main__":
    sys.exit(main())
