"""班集首图压缩：把 assets/campus-collaboration.jpg 缩到合适尺寸并重压。

用法:
    python scripts/optimize-hero-image.py <repo_root>
    python scripts/optimize-hero-image.py <repo_root> <原始大图路径>   # 从原图重新压

说明：这张图在 styles.css 里始终被一层 90% 以上不透明度的深色渐变盖住，
所以尺寸和质量都可以压得比较狠，画面上几乎看不出来。
脚本对"已经是压缩过的版本"会直接跳过，避免反复有损重压把画质越压越差。
"""
import sys
from pathlib import Path

from PIL import Image

TARGET_WIDTH = 1152
JPEG_QUALITY = 78
ALREADY_OPTIMIZED_BYTES = 200_000


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    repo = Path(sys.argv[1]).resolve()
    src = repo / "assets" / "campus-collaboration.jpg"
    if not src.exists():
        print(f"找不到 {src}")
        return 1

    source = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else src
    before = source.stat().st_size

    with Image.open(source) as original:
        original.load()
        width, height = original.size
        if source is src and before <= ALREADY_OPTIMIZED_BYTES and width <= TARGET_WIDTH:
            print(f"{src.name} 看起来已经是压缩过的版本（{before:,} 字节，{width}x{height}），跳过。")
            print("要重新压请显式传入原始大图路径。")
            return 0

        scale = min(1.0, TARGET_WIDTH / width)
        size = (round(width * scale), round(height * scale))
        resized = original.convert("RGB").resize(size, Image.LANCZOS)
        resized.save(
            src,
            "JPEG",
            quality=JPEG_QUALITY,
            optimize=True,
            progressive=True,
            subsampling=1,
        )

    after = src.stat().st_size
    print(f"原图: {width}x{height} / {before:,} 字节")
    print(f"输出: {size[0]}x{size[1]} / {after:,} 字节（减少 {(1 - after / before) * 100:.1f}%）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
