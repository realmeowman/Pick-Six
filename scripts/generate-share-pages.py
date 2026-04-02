#!/usr/bin/env python3
"""Emit static share/* landing pages with Open Graph tags (crawlers do not run JS)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARE_DIR = ROOT / "share"

# (display name, og description line)
SPORTS = {
    "nfl": ("NFL", "Guess the mystery NFL player — six clues, six guesses."),
    "nba": ("NBA", "Guess the mystery NBA player — six clues, six guesses."),
    "mlb": ("MLB", "Guess the mystery MLB player — six clues, six guesses."),
    "nhl": ("NHL", "Guess the mystery NHL player — six clues, six guesses."),
    "football": (
        "Football",
        "Guess the mystery football player — six clues, six guesses.",
    ),
    "golf": ("Golf", "Guess the mystery PGA golfer — six clues, six guesses."),
    "all": (
        "All sports",
        "Play Pick Six across NFL, NBA, MLB, NHL, Football, and Golf — six clues, six guesses.",
    ),
}

BASE = "https://picksix.lol"
OG_IMAGE = f"{BASE}/og-image.png"


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def page_html(sport: str, display: str, desc: str) -> str:
    title = f"Pick Six — {display}"
    og_title = f"Pick Six — {display} | You Think You Know Ball?"
    url = f"{BASE}/share/{sport}/"
    dest = f"{BASE}/?sport={sport}"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <meta property="og:title" content="{esc(og_title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{esc(url)}">
  <meta property="og:site_name" content="Pick Six">
  <meta property="og:image" content="{esc(OG_IMAGE)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Pick Six — sports guessing game">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(og_title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{esc(OG_IMAGE)}">
  <link rel="canonical" href="{esc(dest)}">
  <meta http-equiv="refresh" content="0;url={esc(dest)}">
  <meta name="theme-color" content="#0d1117">
</head>
<body style="margin:0;background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:1.5rem">
  <p style="max-width:28rem;line-height:1.5">Opening <strong>Pick Six</strong> ({esc(display)})…<br><a href="{esc(dest)}" style="color:#58a6ff">Tap here if you are not redirected</a></p>
</body>
</html>
"""


def main():
    for sport, (display, desc) in SPORTS.items():
        d = SHARE_DIR / sport
        d.mkdir(parents=True, exist_ok=True)
        out = d / "index.html"
        out.write_text(page_html(sport, display, desc), encoding="utf-8")
        print(f"Wrote {out}")


if __name__ == "__main__":
    main()
