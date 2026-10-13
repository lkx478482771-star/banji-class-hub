#!/usr/bin/env python3
"""生成「添加到主屏幕」用的应用图标（PWA manifest + iOS 主屏图标）。

用法（在 banji-class-hub 目录下）：
    python scripts/make-app-icons.py

产物在 assets/icons/ 下：
    app-192.png            安卓/桌面 PWA 常规图标
    app-512.png            同上，高清
    app-maskable-512.png   安卓自适应图标（内容缩到中心 80%，四周留安全区）
    apple-touch-icon.png   iOS 主屏图标（180，不透明，iOS 自己加圆角）
    favicon-32.png         浏览器标签页图标

设计沿用站内的品牌规范：绿色渐变底 + 白色「班」字。
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("缺少 Pillow，请用带 Pillow 的 Python 跑这个脚本。")

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "icons"

# 品牌色，与 styles.css 的 --grad 保持一致
GRAD_FROM = (22, 203, 147)
GRAD_TO = (10, 158, 122)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
]
GLYPH = "班"


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("找不到可用的中文字体，请手动指定。")


def gradient_canvas(size: int) -> Image.Image:
    """左上到右下的线性渐变，再叠一层左上高光，避免纯渐变显得平。"""
    canvas = Image.new("RGB", (size, size), GRAD_FROM)
    pixels = canvas.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            pixels[x, y] = (
                round(GRAD_FROM[0] + (GRAD_TO[0] - GRAD_FROM[0]) * t),
                round(GRAD_FROM[1] + (GRAD_TO[1] - GRAD_FROM[1]) * t),
                round(GRAD_FROM[2] + (GRAD_TO[2] - GRAD_FROM[2]) * t),
            )
    return canvas


def draw_glyph(image: Image.Image, ratio: float) -> None:
    """把「班」画在正中，ratio 是字高占整图的比例。"""
    size = image.width
    draw = ImageDraw.Draw(image, "RGBA")
    font = load_font(int(size * ratio))
    box = draw.textbbox((0, 0), GLYPH, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    draw.text(
        ((size - w) / 2 - box[0], (size - h) / 2 - box[1]),
        GLYPH,
        font=font,
        fill=(255, 255, 255, 255),
    )


def rounded(image: Image.Image, radius_ratio: float) -> Image.Image:
    """按圆角裁切，转成带透明通道的 PNG。"""
    size = image.width
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255
    )
    out = image.convert("RGBA")
    out.putalpha(mask)
    return out


def build(size: int, *, glyph_ratio: float, radius_ratio: float | None, opaque: bool) -> Image.Image:
    image = gradient_canvas(size)
    draw_glyph(image, glyph_ratio)
    if opaque:
        return image.convert("RGBA")
    assert radius_ratio is not None
    return rounded(image, radius_ratio)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = [
        # 文件名, 尺寸, 字高比例, 圆角比例(None=直角), 是否不透明
        ("app-192.png", 192, 0.56, 0.22, False),
        ("app-512.png", 512, 0.56, 0.22, False),
        # maskable 要求内容落在中心 80% 的安全区内
        ("app-maskable-512.png", 512, 0.44, None, True),
        # iOS 会自己加圆角，所以这里给不透明直角图
        ("apple-touch-icon.png", 180, 0.54, None, True),
        ("favicon-32.png", 32, 0.60, 0.20, False),
    ]
    for name, size, glyph_ratio, radius_ratio, opaque in targets:
        image = build(size, glyph_ratio=glyph_ratio, radius_ratio=radius_ratio, opaque=opaque)
        path = OUT_DIR / name
        image.save(path, "PNG", optimize=True)
        print(f"{path.relative_to(ROOT)}  {size}x{size}  {path.stat().st_size} B")


if __name__ == "__main__":
    main()
