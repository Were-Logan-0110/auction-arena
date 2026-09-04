"""Rate players on a deterministic, consensus "static overall" scale.

Loads a player list from CSV / JSON / SQLite DB, uses ONLY
name + main_pos + overall, sends batches of N players to the AI in CSV
format, and gets back a static overall for each player. Overalls reflect
how good a player is/was by consensus (most humans would agree), NOT a
random guess — temperature 0 + an anchored rating prompt, so re-running
gives the same overall.

API usage:
  Provider "mistral": OpenAI-compatible endpoint
  POST https://api.mistral.ai/v1/chat/completions
  Authorization: Bearer $MISTRAL_API_KEY

Model (fixed): "mistral-medium-latest" — benchmarked fastest with the best
consensus-accuracy on player ratings.

Models (fixed): "dots-studio/dots-3-note-preview:free" and
"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free". Requests are load-balanced
round-robin across both; on 429/5xx/network errors we rotate to the other.

Examples:
  python scripts/rate_players.py --input players.csv
  python scripts/rate_players.py --input players.db --limit 50
"""

import argparse
import csv
import io
import json
import os
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent

# Mistral AI (OpenAI-compatible endpoint)
MISTRAL_ENDPOINT = os.environ.get("MISTRAL_BASE_URL", "https://api.mistral.ai/v1").rstrip("/") + "/chat/completions"

# Rating model — benchmarked: mistral-medium-latest was the FASTEST responder
# (1.0s vs 8.9s for small-latest on the same 5-player batch) AND gave the most
# consensus-accurate ratings, so speed and knowledge don't trade off here.
MODELS = [
    "mistral-medium-latest",
]

RATING_SCALE = (40, 99)  # bounds of the consensus overall

RATING_SYSTEM_PROMPT = f"""You are a football rating analyst. Assign each player a single
STATIC OVERALL on a {RATING_SCALE[0]}-{RATING_SCALE[1]} integer scale representing their CONSENSUS PEAK —
how good the player was AT HIS PRIME in the eyes of most well-informed football fans and experts,
comparable to classic FIFA/EA overall ratings.

CRITICAL — READ THIS FIRST:
- The "current_overall" in the input is the player's rating from a SPECIFIC FIFA video game edition.
  For many veteran or retired players, this reflects them at age 34-38, WELL PAST their peak.
  It does NOT represent how good they were at their best.
- Your job is to IGNORE the current_overall number and independently assess PEAK/PRIME ability.
  A player listed at 88 who was the best in the world at his position in his prime should be rated 92-94,
  not 88. A player listed at 75 who was a solid mid-table starter at his best should stay around 75-78.

RATING ANCHORS (use these to calibrate):
- 98: Greatest ever at position (Maradona, Pelé-level)
- 95-97: All-time great, top 5-10 in football history
- 92-94: World-class legend, best in world at position during prime (e.g., peak Dani Alves at Barça, peak Van Dijk)
- 89-91: Elite player, top 3-5 in world at position in prime
- 85-88: Very good starter for top club, consistent high performer
- 80-84: Good club player, occasional international level
- 75-79: Solid professional, mid-table level

RULES:
- Base the rating ONLY on well-documented, widely agreed facts: trophies, individual awards,
  peak performance years, influence on the game, longevity at the top. No guessing.
- Be DETERMINISTIC. Same player = same rating every time. Identical players = identical ratings.
- The input "current_overall" is ONLY a name-lookup key. You MUST assign your OWN peak rating.
  It may be MUCH HIGHER than the current_overall for veterans rated in late career.
  It may be LOWER for young players still improving.
- Reply with ONLY a JSON array, one object per input player, in the SAME ORDER as given:
  [{{"name": "<exact original name>", "overall": <int>}}]
  No markdown, no prose, no trailing commas.
"""


def norm(name):
    """Case- and accent-insensitive name key (Rule 3 in PLAYERS_DB_SPEC.md)."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", str(name))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(c for c in s.lower() if c.isalnum())


# ---- loading ---------------------------------------------------------------

_COL_ALIASES = {
    "name": ("name", "player", "player_name", "full_name"),
    "overall": ("overall", "rating", "ovr", "ova"),
    "main_pos": ("main_pos", "mainpos", "main_position", "position", "positions", "pos", "pos_short"),
}


def pick(row, key):
    """Case-insensitive column lookup with alias fallback. row may be dict or sqlite row."""
    if isinstance(row, dict):
        low = {k.lower(): v for k, v in row.items()}
        for alias in _COL_ALIASES[key]:
            if alias.lower() in low:
                return low[alias.lower()]
    else:
        for alias in _COL_ALIASES[key]:
            if alias.lower() in row.keys():
                return row[alias.lower()]
    return None


def main_pos_of(raw):
    if raw is None:
        return ""
    raw = str(raw).strip()
    if not raw:
        return ""
    return raw.split(",")[0].split("|")[0].split("/")[0].strip().upper()


def load_rows(path):
    """Yield dicts with name, main_pos, overall from csv/json/sqlite."""
    p = Path(path)
    ext = p.suffix.lower()
    if ext == ".csv":
        with p.open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                yield _row_from_dict(row)
    elif ext == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("players") or data.get("data") or []
        for row in data:
            yield _row_from_dict(row)
    elif ext in (".db", ".sqlite", ".sqlite3"):
        conn = sqlite3.connect(str(p))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute("select name from sqlite_master where type='table'")]
        table = next((t for t in tables if "player" in t.lower()), tables[0] if tables else None)
        if not table:
            raise SystemExit(f"no table found in {p}")
        for row in cur.execute(f"select * from {table}"):
            yield _row_from_dict(dict(row))
        conn.close()
    else:
        raise SystemExit(f"unsupported input type: {ext} (use .csv, .json or .db)")


def _row_from_dict(d):
    name = pick(d, "name")
    overall = pick(d, "overall")
    if name is None or overall is None:
        return None
    try:
        overall = int(float(overall))
    except (TypeError, ValueError):
        return None
    return {"name": str(name).strip(), "main_pos": main_pos_of(pick(d, "main_pos")), "overall": overall}


# ---- AI calls --------------------------------------------------------------

def _load_env():
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def _chat(key, model, system, user, endpoint, temperature=0.0):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "User-Agent": "Mozilla/5.0 (rating-tool)",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
    choices = raw.get("choices") or []
    first = choices[0] or {}
    text = (first.get("message") or {}).get("content") or ""
    if not text:
        raise RuntimeError(f"empty response from {model}")
    return text


def _extract_ratings(text):
    """Parse the model's JSON array of {name, overall}. Tolerates code fences."""
    text = (text or "").strip()
    import re

    fence = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.S | re.I)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end > start:
        text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("expected a JSON array")
    out = {}
    for item in data:
        if isinstance(item, dict) and "name" in item and "overall" in item:
            out[norm(item["name"])] = int(round(float(item["overall"])))
    return out


def _clamp(v):
    lo, hi = RATING_SCALE
    return max(lo, min(hi, v))


# ---- main ------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="AI static-overall rater")
    ap.add_argument("--input", required=True, help="players.csv / players.json / players.db")
    ap.add_argument("--batch", type=int, default=100, help="players sent per AI request (CSV format)")
    ap.add_argument("--out", help="output CSV path (default: <input>.rated.csv)")
    ap.add_argument("--limit", type=int, help="only rate the first N players")
    ap.add_argument("--delay", type=float, default=2.0, help="seconds between batches (rate-limit safety)")
    ap.add_argument("--retries", type=int, default=8, help="max attempts before giving up on a batch (each rotation try counts)")
    args = ap.parse_args()

    _load_env()
    key = os.environ.get("MISTRAL_API_KEY", "").strip()
    if not key:
        raise SystemExit("no MISTRAL_API_KEY set in .env")
    endpoint = MISTRAL_ENDPOINT
    provider = "mistral"

    rows = [r for r in load_rows(args.input) if r]
    if args.limit:
        rows = rows[: args.limit]
    if not rows:
        raise SystemExit("no players loaded — check columns (need name + overall)")

    out = args.out or str(Path(args.input).with_suffix(Path(args.input).suffix + ".rated.csv"))
    print(f"loaded {len(rows)} players from {args.input}  (batch={args.batch}, rotation=[{', '.join(provider + '/' + m for m in MODELS)}], load-balanced)")

    updated = 0
    written = []
    cursor = 0  # index of the model the next batch starts with (load-balanced across batches)

    for start in range(0, len(rows), args.batch):
        batch = rows[start : start + args.batch]
        buf = io.StringIO()
        w = csv.writer(buf)
        for r in batch:
            w.writerow([r["name"], r["main_pos"], r["overall"]])
        user = (
            "Rate each player's ALL-TIME PEAK/PRIME ability (NOT current ability).\n"
            "The current_overall column is from a FIFA game edition and may be a late-career rating.\n"
            "You MUST independently assess how good they were at their best.\n"
            "Return ONLY the JSON array [{{name, overall}}] in the same order.\n\n"
            f"{buf.getvalue().strip()}"
        )

        ratings = {}
        last_err = None
        ok = False
        for attempt in range(args.retries):
            model = MODELS[(cursor + attempt) % len(MODELS)]
            try:
                text = _chat(key, model, RATING_SYSTEM_PROMPT, user, endpoint)
                ratings = _extract_ratings(text)
                ok = True
                break
            except urllib.error.HTTPError as e:
                if e.code in (401, 403, 404):
                    raise  # auth/config problems won't be fixed by rotating
                last_err = e
                wait = min(2 ** (attempt % 4), 8)
                print(f"  [{provider}/{model}] HTTP {e.code} -> rotating (wait {wait}s)")
                time.sleep(wait)
            except Exception as e:
                last_err = e
                print(f"  [{provider}/{model}] error: {e} -> rotating")
                time.sleep(1.0)
        cursor = (cursor + 1) % len(MODELS)  # next batch starts with the other model

        if not ok:
            print(f"  !! batch {start // args.batch + 1} failed after {args.retries} attempts ({last_err}) — keeping original overalls")
            for r in batch:
                written.append({"name": r["name"], "main_pos": r["main_pos"], "overall": r["overall"]})
            continue

        missing = 0
        for r in batch:
            new_ovr = ratings.get(norm(r["name"]))
            if new_ovr is None:
                # fall back to positional matching if the model kept order
                idx = batch.index(r)
                if idx < len(ratings_values := list(ratings.values())):
                    new_ovr = ratings_values[idx]
            if new_ovr is not None and 0 < new_ovr <= 100:
                new_ovr = _clamp(int(round(new_ovr)))
                if new_ovr != r["overall"]:
                    updated += 1
            else:
                new_ovr = r["overall"]
                missing += 1
            written.append({"name": r["name"], "main_pos": r["main_pos"], "overall": new_ovr})
        print(
            f"  batch {start // args.batch + 1}: {len(batch)} players, "
            f"{updated} changed so far, {missing} kept-as-is"
        )
        if start + args.batch < len(rows):
            time.sleep(args.delay)

    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["name", "main_pos", "overall"])
        w.writeheader()
        w.writerows(written)

    print(f"done: {len(written)} players -> {out} ({updated} overalls changed)")


if __name__ == "__main__":
    main()
