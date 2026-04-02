#!/usr/bin/env python3
"""Emit static share/* landing pages with Open Graph tags.

Link-preview crawlers often follow <meta refresh> or fetch <link rel="canonical">
targets; both pointed at /?sport=… which serves index.html (ALL SPORTS og:image).
Use canonical=self, no meta refresh, and JS-only redirect so HTML-only fetches
keep league-specific og:image.
"""
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


def og_image_url(sport: str) -> str:
    return f"{BASE}/og-image-{sport}.png"


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
    og_img = og_image_url(sport)
    og_alt = f"Pick Six — {display} — branded preview card"
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
  <meta property="og:image" content="{esc(og_img)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{esc(og_alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(og_title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{esc(og_img)}">
  <link rel="canonical" href="{esc(url)}">
  <meta name="theme-color" content="#0d1117">
</head>
<body style="margin:0;background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:1.5rem">
  <p style="max-width:28rem;line-height:1.5">Opening <strong>Pick Six</strong> ({esc(display)})…<br><a href="{esc(dest)}" style="color:#58a6ff">Continue to the game</a></p>
  <script>location.replace("{esc(dest)}");</script>
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
