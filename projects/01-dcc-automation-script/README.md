# 01 · DCC 工具自动化脚本 / 插件

> 方向：管线自动化 · 美术工具提效　|　技术栈：Python、Pillow（贴图批处理）

## 背景与目标

- 解决什么问题：贴图入库前需要批量重命名、按规范缩放尺寸、统一输出格式，手工逐个处理重复且易出错。本工具用独立 Python 脚本完成贴图批处理，命名与尺寸规范参照 DCC 资产管线的常见做法。
- 对应岗位工作：DCC 工具插件 / 脚本开发、资产生产管线自动化

## 需求拆解

把原始模糊需求拆成可执行步骤：

1. 明确处理对象与输入格式：支持 png / jpg / jpeg / tga / webp / bmp，输入为一个目录。
2. 确定批量规则与输出命名规范：按文件名排序，统一前缀 + 三位序号；最长边限制，尺寸向下取 2 的幂。
3. 调用 Pillow API 完成核心操作：LANCZOS 重采样缩放、格式转换、按序输出到目标目录。
4. 加入错误处理、日志输出与结果校验：单文件失败不中断整批，输出 JSON 报告与成功 / 失败统计。

## 技术栈

- 语言：Python 3（仅标准库 + Pillow）
- 目标工具：独立可运行脚本（贴图批处理；当前版本不依赖 Photoshop / Blender API）
- 依赖：Pillow >= 10.0，见 [requirements.txt](requirements.txt)

## 实现要点

- 核心模块与关键逻辑：
  - `src/texture_pipeline.py`：CLI 入口与批量调度。用 argparse 接收 `--input / --output / --prefix / --format / --max-size / --report`，扫描目录后逐文件处理。
  - 尺寸与命名模块：`floor_power_of_two()` 将宽高向下取到 2 的幂；按 `前缀_序号.格式` 输出，如 `tex_002.png`。
  - 容错与报告模块：捕获 `UnidentifiedImageError / OSError / ValueError`，坏图记录 error 后继续处理其余文件；JSON 报告包含逐文件记录、原始尺寸、输出尺寸与汇总统计。
  - `examples/make_samples.py`：生成演示用输入贴图，并故意放入一张损坏文件以验证容错逻辑。

## 演示

- 运行环境：Python 3.13、Pillow 13.0（Windows）；安装依赖 `pip install -r requirements.txt`

```bash
python examples/make_samples.py
python src/texture_pipeline.py \
  --input examples/input \
  --output examples/output \
  --prefix tex --format png --max-size 512 \
  --report demo/report.json
```

- 输入示例 → 输出结果：[examples/input/](examples/input/) 共 4 张（含 1 张故意损坏的文件）→ [examples/output/](examples/output/) 生成 3 张 `tex_*.png`。
- 真实运行日志：[demo/run_log.txt](demo/run_log.txt)（4 张中 3 张成功、1 张失败并继续处理）。
- 运行截图：[demo/run-screenshot.png](demo/run-screenshot.png)（由上述真实日志渲染）。
- 处理报告：[demo/report.json](demo/report.json)。

## 遇到的问题与解决

- 问题 1：损坏文件导致整批处理中断 → 排查思路：定位到 `Image.open()` 抛出 `UnidentifiedImageError` → 解决方式：在单文件层级捕获异常，写入报告后继续下一张，演示中坏图失败但其余 3 张正常输出。
- 问题 2：缩放后尺寸不符合常见引擎规范 → 排查思路：按比例缩放会产生非 2 的幂尺寸 → 解决方式：新增 `floor_power_of_two()`，在缩放后把宽高向下取到 2 的幂。

## 收获与可改进

- 收获：理解了批处理脚本的容错边界，以及资产管线中命名、尺寸、格式统一规范的意义；掌握了用报告文件替代人工核对的做法。
- 可改进：接入真实 DCC API（Blender `bpy` / Photoshop）实现脚本内直接调用；把规则抽成配置文件以支持不同项目规范；增加失败重试与并行处理。
