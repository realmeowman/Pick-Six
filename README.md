# Pick Six — MLB Edition

A wordle-style game where you guess an MLB player from ESPN's Top 100 list (2026 season). You get 6 tries to narrow it down. Six clue slots (Team, League, Division, Position, Age, Number) start hidden behind baseball icons—each correct guess reveals matching criteria, and revealed clues stay on screen for the whole game.

## How to play

1. **Guess a player** — Type a player name (autocomplete shows who's in the pool).
2. **First try correct** — You'll see a special message.
3. **Wrong guess** — The game shows what the answer has in common with your guess (League, Division, Position, Age, Number).

## Run locally

`fetch` won't work with `file://`. Use a local server:

```bash
# Python 3
python3 -m http.server 8000

# Node.js (if you have npx)
npx serve .
```

Then open `http://localhost:8000` in your browser.
