"""生成演示用的模拟贴图输入（渐变图 + 一张故意损坏的文件）。"""

from pathlib import Path

from PIL import Image, ImageDraw

INPUT_DIR = Path(__file__).resolve().parent / "input"
INPUT_DIR.mkdir(parents=True, exist_ok=True)


def gradient(name: str, size: tuple[int, int], start: tuple[int, int, int], end: tuple[int, int, int]) -> None:
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(size[1]):
        ratio = y / max(1, size[1] - 1)
        color = tuple(int(a + (b - a) * ratio) for a, b in zip(start, end))
        draw.line((0, y, size[0], y), fill=color)
    img.save(INPUT_DIR / name)
    print("generated", name, size)


gradient("sky_gradient.png", (1000, 640), (40, 70, 130), (200, 180, 150))
gradient("ground_gradient.jpg", (768, 768), (90, 70, 50), (180, 160, 120))
gradient("ui_panel.webp", (512, 256), (30, 40, 60), (80, 100, 140))

# 故意放入一个损坏文件，用于演示单文件失败不影响整批处理
(INPUT_DIR / "broken_texture.png").write_bytes(b"not a real png")
print("generated broken_texture.png (corrupted on purpose)")
