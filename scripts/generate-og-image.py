#!/usr/bin/env python3
"""Generate og-image.png (1200x630) for Open Graph / iMessage link previews."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "og-image.png"
W, H = 1200, 630
BG = "#0d1117"
ACCENT = "#58a6ff"
MUTED = "#8b949e"
WHITE = "#f0f6fc"


def load_font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    if bold:
        candidates.insert(0, "/System/Library/Fonts/Supplemental/Arial Black.ttf")
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Subtle frame
    pad = 24
    draw.rounded_rectangle(
        [pad, pad, W - pad, H - pad],
        radius=20,
        outline="#30363d",
        width=3,
    )

    title_font = load_font(118, bold=True)
    sub_font = load_font(34)
    tag_font = load_font(26)

    title = "PICK SIX"
    subtitle = "You Think You Know Ball? Prove It."
    tag = "NFL · NBA · MLB · NHL · Football · Golf"

    cx = W // 2
    draw.text((cx, 200), title, fill=WHITE, font=title_font, anchor="mm")
    bar_w, bar_h = min(520, W - 160), 8
    draw.rounded_rectangle(
        [cx - bar_w // 2, 268, cx + bar_w // 2, 268 + bar_h],
        radius=4,
        fill=ACCENT,
    )
    draw.text((cx, 330), subtitle, fill=MUTED, font=sub_font, anchor="mm")
    draw.text((cx, 400), tag, fill=MUTED, font=tag_font, anchor="mm")

    hint = "Six clues · six guesses · six rounds"
    draw.text((cx, 480), hint, fill="#6e7681", font=tag_font, anchor="mm")

    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
