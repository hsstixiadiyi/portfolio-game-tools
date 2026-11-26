"""贴图批处理管线：批量重命名、缩放、格式转换并输出处理报告。

用法示例：
    python src/texture_pipeline.py \
        --input examples/input \
        --output examples/output \
        --prefix tex \
        --format png \
        --max-size 512 \
        --report demo/report.json

仅依赖 Pillow，可在普通 Python 环境独立运行；不依赖 Photoshop / Blender，
但命名与输出规范参照 DCC 资产管线的常见做法。
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageFile, UnidentifiedImageError

# 允许处理被截断的图片，避免单张坏图中断整批任务
ImageFile.LOAD_TRUNCATED_IMAGES = True

SUPPORTED_INPUT = {".png", ".jpg", ".jpeg", ".tga", ".webp", ".bmp"}
SUPPORTED_OUTPUT = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP"}


def floor_power_of_two(value: int) -> int:
    """向下取到最近的 2 的幂，保证贴图尺寸符合常见引擎规范。"""
    if value < 2:
        return 2
    return 2 ** int(math.log2(value))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="批量贴图处理与规范化工具")
    parser.add_argument("--input", required=True, type=Path, help="输入贴图目录")
    parser.add_argument("--output", required=True, type=Path, help="输出目录")
    parser.add_argument("--prefix", default="tex", help="输出文件名前缀，默认 tex")
    parser.add_argument(
        "--format",
        default="png",
        choices=sorted(SUPPORTED_OUTPUT),
        help="输出格式，默认 png",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=1024,
        help="最长边上限（像素），默认 1024",
    )
    parser.add_argument("--report", type=Path, help="可选：输出 JSON 处理报告路径")
    return parser


def process_one(
    source: Path,
    output_dir: Path,
    index: int,
    prefix: str,
    target_format: str,
    max_size: int,
) -> dict:
    """处理单张贴图，返回记录字典；失败时也返回记录，不中断整批。"""
    record = {
        "source": source.name,
        "status": "failed",
        "output": None,
        "original_size": None,
        "output_size": None,
        "error": None,
    }
    try:
        with Image.open(source) as img:
            img.load()
            original_size = list(img.size)
            record["original_size"] = original_size

            scale = min(1.0, max_size / max(img.size))
            new_size = (
                floor_power_of_two(max(2, int(img.width * scale))),
                floor_power_of_two(max(2, int(img.height * scale))),
            )
            # 使用 LANCZOS 重采样，缩小时保留更多细节
            resized = img.resize(new_size, Image.Resampling.LANCZOS)

            filename = f"{prefix}_{index:03d}.{target_format}"
            destination = output_dir / filename
            save_kwargs = {}
            if target_format == "jpg" and resized.mode in ("RGBA", "P"):
                resized = resized.convert("RGB")
            resized.save(destination, format=SUPPORTED_OUTPUT[target_format], **save_kwargs)

            record.update(
                status="success",
                output=filename,
                output_size=list(new_size),
            )
            logging.info("OK   %s -> %s %s", source.name, filename, new_size)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        record["error"] = f"{type(exc).__name__}: {exc}"
        logging.error("FAIL %s : %s", source.name, exc)
    return record


def run(args: argparse.Namespace) -> int:
    if not args.input.is_dir():
        logging.error("输入目录不存在：%s", args.input)
        return 2
    if args.max_size < 16:
        logging.error("--max-size 不能小于 16")
        return 2

    args.output.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        p for p in args.input.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_INPUT
    )
    if not sources:
        logging.warning("未在 %s 找到支持的贴图文件", args.input)

    records = []
    for index, source in enumerate(sources, start=1):
        records.append(
            process_one(
                source,
                args.output,
                index,
                args.prefix,
                args.format,
                args.max_size,
            )
        )

    success = sum(1 for r in records if r["status"] == "success")
    failed = len(records) - success
    logging.info("完成：总计 %d 张，成功 %d 张，失败 %d 张", len(records), success, failed)

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "input_dir": str(args.input),
            "output_dir": str(args.output),
            "options": {
                "prefix": args.prefix,
                "format": args.format,
                "max_size": args.max_size,
            },
            "summary": {"total": len(records), "success": success, "failed": failed},
            "files": records,
        }
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logging.info("报告已写入：%s", args.report)

    # 有失败文件时返回非 0，便于接入上层调度或 CI
    return 1 if failed else 0


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    args = build_parser().parse_args()
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
