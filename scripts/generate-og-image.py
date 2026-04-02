#!/usr/bin/env python3
"""Generate og-image.png and og-image-<sport>.png (1200x630) for Open Graph previews."""
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1200, 630
BG = "#0d1117"
MUTED = "#8b949e"
WHITE = "#f0f6fc"
SUBTLE = "#6e7681"

# League headline + accent bar / headline color (hex)
CARDS = {
    "nfl": ("NFL", "#C8102E"),
    "nba": ("NBA", "#17408B"),
    "mlb": ("MLB", "#002D72"),
    "nhl": ("NHL", "#F0B942"),
    "football": ("FOOTBALL", "#3d9a4a"),
    "golf": ("GOLF", "#2d8a5e"),
    "all": ("ALL SPORTS", "#58a6ff"),
}


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


def hex_to_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def draw_card(sport_key: str) -> Image.Image:
    display, accent = CARDS[sport_key]
    accent_rgb = hex_to_rgb(accent)

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    pad = 24
    draw.rounded_rectangle(
        [pad, pad, W - pad, H - pad],
        radius=20,
        outline="#30363d",
        width=3,
    )

    brand_font = load_font(52, bold=True)
    league_font = load_font(132, bold=True)
    sub_font = load_font(32)
    tag_font = load_font(24)

    cx = W // 2

    draw.text((cx, 120), "PICK SIX", fill=MUTED, font=brand_font, anchor="mm")
    draw.text((cx, 255), display, fill=accent_rgb, font=league_font, anchor="mm")

    bar_w, bar_h = min(560, W - 120), 10
    y_bar = 345
    draw.rounded_rectangle(
        [cx - bar_w // 2, y_bar, cx + bar_w // 2, y_bar + bar_h],
        radius=5,
        fill=accent_rgb,
    )

    subtitle = "You Think You Know Ball? Prove It."
    draw.text((cx, 410), subtitle, fill=MUTED, font=sub_font, anchor="mm")

    if sport_key == "all":
        tag = "NFL · NBA · MLB · NHL · Football · Golf"
    else:
        tag = "Six clues · six guesses · six rounds"
    draw.text((cx, 475), tag, fill=MUTED, font=tag_font, anchor="mm")

    hint = "picksix.lol"
    draw.text((cx, 540), hint, fill=SUBTLE, font=tag_font, anchor="mm")

    return img


def main():
    for key in CARDS:
        out = ROOT / f"og-image-{key}.png"
        draw_card(key).save(out, "PNG", optimize=True)
        print(f"Wrote {out}")

    # Homepage & default meta still use og-image.png — same as All sports card
    src = ROOT / "og-image-all.png"
    dst = ROOT / "og-image.png"
    shutil.copyfile(src, dst)
    print(f"Wrote {dst} (copy of og-image-all.png)")


if __name__ == "__main__":
    main()
