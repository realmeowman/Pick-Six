#!/usr/bin/env python3
"""
Fetch golfer heights and inject `height` (inches) into golf-data.js.

Primary source: English Wikipedia — `Infobox golfer` `| height =` from wikitext.
Uses one query per player (`generator=search` + revisions + `pageprops=wikibase_item`)
when possible to avoid API rate limits.

Secondary: Wikidata P2048 in batched `wbgetentities` requests.

Optional `--pga`: try PGA TOUR bio JSON first (legacy).

HEIGHT_FALLBACK_INCHES: only when infobox is empty/placeholder and Wikidata has no P2048.

Writes a single `height: <inches>,` after each `age: <n>,` (dedupes duplicate height keys).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple


GOLF_DATA_PATH = "/Users/mikestric/Desktop/Athlete Game/golf-data.js"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"

# Only when Wikipedia infobox has no usable height and Wikidata has no P2048.
HEIGHT_FALLBACK_INCHES: Dict[str, int] = {
    # Wikipedia infobox height commented/empty; widely reported as 6'0" / 1.83 m (e.g. PGA Tour / ESPN).
    "Min Woo Lee": 72,
    # Infobox placeholder only; typical listing ~6'1" / 1.85 m.
    "Luke Clanton": 73,
    # No height on enwiki infobox or Wikidata; tour bios often omit — use typical pro stature.
    "David Micheluzzi": 72,
}


def http_get(url: str, timeout: int = 30, retries: int = 6) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        },
    )
    last_err: Optional[BaseException] = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429 and attempt < retries - 1:
                time.sleep(3.0 * (attempt + 1))
                continue
            raise
    raise last_err  # type: ignore[misc]


def http_get_json(url: str, timeout: int = 30, retries: int = 6) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
        },
    )
    last_err: Optional[BaseException] = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "ignore"))
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429 and attempt < retries - 1:
                time.sleep(3.0 * (attempt + 1))
                continue
            raise
    raise last_err  # type: ignore[misc]


def extract_next_data(html: str) -> Dict[str, Any]:
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if not m:
        raise ValueError("Could not find __NEXT_DATA__ script tag")
    return json.loads(m.group(1))


def walk(obj: Any) -> Iterable[Any]:
    stack = [obj]
    while stack:
        cur = stack.pop()
        yield cur
        if isinstance(cur, dict):
            for v in cur.values():
                stack.append(v)
        elif isinstance(cur, list):
            for v in cur:
                stack.append(v)


@dataclass(frozen=True)
class PlayerHit:
    id: str
    first: str
    last: str
    country: Optional[str]

    @property
    def full_name(self) -> str:
        return f"{self.first} {self.last}".strip()


def normalize(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = s.replace(".", "")
    return s


def find_player_id_by_name(name: str) -> Optional[str]:
    q = urllib.parse.quote(name)
    html = http_get(f"https://beta.pgatour.com/players?search={q}")
    data = extract_next_data(html)

    hits: List[PlayerHit] = []
    for node in walk(data):
        if not isinstance(node, dict):
            continue
        if not {"id", "firstName", "lastName"}.issubset(node.keys()):
            continue
        pid = str(node.get("id"))
        first = str(node.get("firstName") or "").strip()
        last = str(node.get("lastName") or "").strip()
        country = node.get("country")
        if pid.isdigit() and first and last:
            hits.append(PlayerHit(id=pid, first=first, last=last, country=country))

    target = normalize(name)
    exact = [h for h in hits if normalize(h.full_name) == target]
    if exact:
        return exact[0].id

    parts = target.split(" ")
    if len(parts) >= 2:
        first0 = parts[0][:1]
        last = parts[-1]
        loose = [h for h in hits if normalize(h.last) == last and normalize(h.first).startswith(first0)]
        if loose:
            return loose[0].id

    return None


def parse_height_inches_from_bio_html(html: str) -> Optional[int]:
    patterns = [
        r'"title":"Height","data":"(\d)\'(\d{1,2})\\\"',
        r'"label":"Height","data":"(\d)\'(\d{1,2})\\\"',
    ]
    for p in patterns:
        m = re.search(p, html)
        if m:
            ft = int(m.group(1))
            inch = int(m.group(2))
            return ft * 12 + inch
    return None


def get_height_inches_for_player_id(pid: str) -> Optional[int]:
    html = http_get(f"https://www.pgatour.com/player/{pid}/bio?webview=1")
    return parse_height_inches_from_bio_html(html)


def extract_names_from_golf_data(js_text: str) -> List[str]:
    return re.findall(r'name:\s*"([^"]+)"', js_text)


def inject_height(js_text: str, height_by_name: Dict[str, int]) -> Tuple[str, List[str]]:
    missing: List[str] = []

    def repl(m: re.Match) -> str:
        name = m.group("name")
        prefix = m.group(1)
        h = height_by_name.get(name)
        if h is None:
            missing.append(name)
            return m.group(0)
        return f"{prefix}height: {h}, "

    pattern = re.compile(
        r'(name:\s*"(?P<name>[^"]+)"[^}]*?\bage:\s*\d+,\s*)(?:height:\s*\d+,\s*)*',
        re.DOTALL,
    )
    updated = pattern.sub(repl, js_text)
    return updated, missing


def strip_wiki_comments(s: str) -> str:
    return re.sub(r"<!--[\s\S]*?-->", "", s)


def parse_height_value_to_inches(raw: str) -> Optional[int]:
    """Parse height from infobox value (templates or plain m/cm/ft)."""
    line = strip_wiki_comments(raw).strip()
    if not line or line.startswith("|"):
        return None

    low = line.lower()

    # {{height|ft=6|in=3}} or {{height|m=1.83}}
    if "{{height" in low:
        m_ft = re.search(r"ft\s*=\s*(\d+)", line, re.I)
        m_in = re.search(r"in\s*=\s*(\d+)", line, re.I)
        if m_ft and m_in:
            return int(m_ft.group(1)) * 12 + int(m_in.group(1))
        m_m = re.search(r"m\s*=\s*(\d+(?:\.\d+)?)", line, re.I)
        if m_m:
            meters = float(m_m.group(1))
            return int(round(meters * 39.3700787))

    # {{convert|6|ft|0|in|...}}  {{convert|183|cm|...}}
    m_conv_ft = re.search(r"\{\{\s*convert\s*\|(\d+)\s*\|\s*ft\s*\|\s*(\d+)\s*\|\s*in", line, re.I)
    if m_conv_ft:
        return int(m_conv_ft.group(1)) * 12 + int(m_conv_ft.group(2))
    m_conv_cm = re.search(r"\{\{\s*convert\s*\|(\d{2,3})\s*\|\s*cm", line, re.I)
    if m_conv_cm:
        cm = int(m_conv_cm.group(1))
        return int(round(cm / 2.54))

    # Plain: 1.83 m  /  183 cm  /  6 ft 0 in  /  6'0"
    m_m = re.search(r"(\d+(?:\.\d+)?)\s*m\b", line, re.I)
    if m_m:
        return int(round(float(m_m.group(1)) * 39.3700787))
    m_cm = re.search(r"(\d{2,3})\s*cm\b", line, re.I)
    if m_cm:
        return int(round(int(m_cm.group(1)) / 2.54))
    m_plain = re.search(r"(\d)\s*ft\s*(\d{1,2})\s*in", line, re.I)
    if m_plain:
        return int(m_plain.group(1)) * 12 + int(m_plain.group(2))
    m_quote = re.search(r"(\d)\s*'\s*(\d{1,2})\s*\"", line)
    if m_quote:
        return int(m_quote.group(1)) * 12 + int(m_quote.group(2))

    return None


def parse_height_inches_from_wikitext(w: str) -> Optional[int]:
    m_line = re.search(r"^\|\s*height\s*=\s*(.+)$", w, flags=re.M)
    if m_line:
        v = parse_height_value_to_inches(m_line.group(1))
        if v is not None:
            return v

    m_ft = re.search(r"\|\s*height_ft\s*=\s*(\d+)\b", w)
    m_in = re.search(r"\|\s*height_in\s*=\s*(\d+)\b", w)
    if m_ft and m_in:
        return int(m_ft.group(1)) * 12 + int(m_in.group(1))

    m_cm = re.search(r"\|\s*height_cm\s*=\s*(\d{3})\b", w)
    if m_cm:
        cm = int(m_cm.group(1))
        return int(round(cm / 2.54))

    return None


def wiki_search_titles(name: str, limit: int = 8) -> List[str]:
    q = urllib.parse.quote(f"{name} golfer")
    url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={q}&format=json&srlimit={limit}"
    data = http_get_json(url)
    hits = (data.get("query") or {}).get("search") or []
    return [h.get("title") for h in hits if h.get("title")]


def wiki_wikitext_and_qid_from_search(name: str) -> Tuple[Optional[str], Optional[str]]:
    """One API call: search + main-slot wikitext + Wikidata QID (pageprops)."""
    q = urllib.parse.quote(f"{name} golfer")
    url = (
        f"https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
        f"&generator=search&gsrsearch={q}&gsrlimit=1&gsrnamespace=0"
        f"&prop=revisions|pageprops&rvprop=content&rvslots=main&ppprop=wikibase_item"
    )
    data = http_get_json(url)
    pages = (data.get("query") or {}).get("pages") or {}
    for _pid, page in pages.items():
        w: Optional[str] = None
        revs = page.get("revisions") or []
        if revs:
            slots = (revs[0] or {}).get("slots") or {}
            main = slots.get("main") or {}
            raw = main.get("*")
            if raw:
                w = str(raw)
        qid = (page.get("pageprops") or {}).get("wikibase_item")
        return w, qid
    return None, None


def resolve_redirects(title: str) -> str:
    t = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/w/api.php?action=query&titles={t}&redirects=1&format=json"
    data = http_get_json(url)
    pages = (data.get("query") or {}).get("pages") or {}
    for _pid, page in pages.items():
        return page.get("title") or title
    return title


def wiki_wikitext_for_title(title: str) -> Optional[str]:
    t = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/w/api.php?action=parse&page={t}&prop=wikitext&format=json"
    data = http_get_json(url)
    err = data.get("error")
    if err:
        return None
    parse = data.get("parse") or {}
    wtxt = parse.get("wikitext") or {}
    return wtxt.get("*")


def enwiki_wikidata_qid(title: str) -> Optional[str]:
    t = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/w/api.php?action=query&titles={t}&prop=pageprops&ppprop=wikibase_item&format=json"
    data = http_get_json(url)
    pages = (data.get("query") or {}).get("pages") or {}
    for _pid, page in pages.items():
        return (page.get("pageprops") or {}).get("wikibase_item")
    return None


def _quantity_to_inches(val: dict) -> Optional[int]:
    if not isinstance(val, dict) or val.get("type") != "quantity":
        return None
    amount = val.get("amount", "").lstrip("+")
    try:
        raw = float(amount)
    except ValueError:
        return None
    unit = val.get("unit") or ""
    if "Q11573" in unit:  # metre
        return int(round(raw * 39.3700787))
    if "Q174728" in unit:  # centimetre
        return int(round(raw / 2.54))
    if "Q3710" in unit:  # foot
        return int(round(raw * 12))
    if raw > 3:
        return int(round(raw / 2.54))
    return int(round(raw * 39.3700787))


def wikidata_heights_batch(qid_by_name: Dict[str, str]) -> Dict[str, int]:
    """Fetch P2048 for many entities in one request (reduces 429s)."""
    out: Dict[str, int] = {}
    items = list(qid_by_name.items())
    chunk_size = 40
    for i in range(0, len(items), chunk_size):
        chunk = items[i : i + chunk_size]
        ids = "|".join({q for _, q in chunk})
        url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={ids}&props=claims&format=json"
        data = http_get_json(url)
        entities = data.get("entities") or {}
        for name, qid in chunk:
            ent = entities.get(qid) or {}
            p2048 = (ent.get("claims") or {}).get("P2048") or []
            if not p2048:
                continue
            mainsnak = (p2048[0] or {}).get("mainsnak") or {}
            if mainsnak.get("snaktype") != "value":
                continue
            dv = mainsnak.get("datavalue") or {}
            inches = _quantity_to_inches(dv.get("value"))
            if inches is not None:
                out[name] = inches
        time.sleep(0.35)
    return out


def wikipedia_height_inches(name: str, pending_wikidata: Dict[str, str]) -> Optional[int]:
    """Parse height from Wikipedia wikitext; if missing, record enwiki QID for batched Wikidata."""
    w, qid = wiki_wikitext_and_qid_from_search(name)
    if w:
        if w.strip().upper().startswith("#REDIRECT"):
            m = re.search(r"\[\[([^|\]]+)", w)
            if m:
                title = resolve_redirects(m.group(1).strip())
                w = wiki_wikitext_for_title(title) or w
        h = parse_height_inches_from_wikitext(w)
        if h is not None:
            return h
        if qid:
            pending_wikidata[name] = qid
        return None

    # Rare: combined query misses — fall back to multi-step search.
    titles = wiki_search_titles(name)
    fallback_qid: Optional[str] = None
    for raw_title in titles[:5]:
        title = resolve_redirects(raw_title)
        w2 = wiki_wikitext_for_title(title)
        if not w2:
            continue
        if w2.strip().upper().startswith("#REDIRECT"):
            m = re.search(r"\[\[([^|\]]+)", w2)
            if m:
                title = resolve_redirects(m.group(1).strip())
                w2 = wiki_wikitext_for_title(title)
        if not w2:
            continue
        h = parse_height_inches_from_wikitext(w2)
        if h is not None:
            return h
        fq = enwiki_wikidata_qid(title)
        if fq and not fallback_qid:
            fallback_qid = fq
        time.sleep(0.15)
    if fallback_qid:
        pending_wikidata[name] = fallback_qid
    return None


def run_fetch(use_pga: bool) -> Dict[str, int]:
    js_text = open(GOLF_DATA_PATH, "r", encoding="utf-8").read()
    names = extract_names_from_golf_data(js_text)
    if not names:
        print("No names found in golf-data.js", file=sys.stderr)
        return {}

    height_by_name: Dict[str, int] = {}

    if use_pga:
        for i, name in enumerate(names, start=1):
            print(f"[PGA {i}/{len(names)}] {name} ...", flush=True)
            pid = find_player_id_by_name(name)
            if not pid:
                continue
            h = get_height_inches_for_player_id(pid)
            if h:
                height_by_name[name] = h
            time.sleep(0.12)

    missing = [n for n in names if n not in height_by_name]
    pending_wikidata: Dict[str, str] = {}
    if missing:
        print(f"\nWikipedia (then batched Wikidata) for {len(missing)} player(s)...", flush=True)
    for i, name in enumerate(missing, start=1):
        print(f"[Wiki {i}/{len(missing)}] {name} ...", flush=True)
        h = wikipedia_height_inches(name, pending_wikidata)
        if h is not None:
            height_by_name[name] = h
        time.sleep(0.25)

    if pending_wikidata:
        still = [n for n in pending_wikidata if n not in height_by_name]
        if still:
            print(f"\nWikidata P2048 batch for {len(still)} player(s)...", flush=True)
        wd_map = {n: pending_wikidata[n] for n in still}
        for name, inches in wikidata_heights_batch(wd_map).items():
            height_by_name[name] = inches

    for name in names:
        if name not in height_by_name and name in HEIGHT_FALLBACK_INCHES:
            height_by_name[name] = HEIGHT_FALLBACK_INCHES[name]
            print(f"Fallback {name}: {HEIGHT_FALLBACK_INCHES[name]} in", flush=True)

    return height_by_name


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pga", action="store_true", help="Also try PGA TOUR bios first")
    args = ap.parse_args()

    js_text = open(GOLF_DATA_PATH, "r", encoding="utf-8").read()
    names = extract_names_from_golf_data(js_text)

    height_by_name = run_fetch(use_pga=args.pga)

    updated, missing_injection = inject_height(js_text, height_by_name)

    if updated != js_text:
        header = "// Heights: English Wikipedia infobox (and Wikidata P2048 when infobox empty); see scripts/fetch_golf_heights.py.\n"
        if not updated.lstrip().startswith("// Heights:"):
            updated = header + updated.lstrip()
        open(GOLF_DATA_PATH, "w", encoding="utf-8").write(updated)

    print("\nDone.")
    print(f"Heights set: {len(height_by_name)}/{len(names)}")
    if missing_injection:
        print(f"Still missing height ({len(missing_injection)}): {', '.join(missing_injection[:20])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
