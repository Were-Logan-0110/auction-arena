"""MatchForge — one-shot AI match generation for Auction Arena.

Primary: Gemini (gemini-2.5-flash) generates the FULL match (events, scoreline,
stats, MOTM, summary) from the two draft squads. Falls back to a deterministic
local JSON-only simulator (ratings + positions) when the key is missing or the
API fails — so the game always works offline.

Both paths return the same schema; the frontend replays it identically.
"""

import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent

MODEL = "gemini-2.5-flash"
API_MODEL = "gemini-2.5-flash"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{API_MODEL}:generateContent"
GENERATED_BY_LOCAL = "local-json-sim"

# ---- AI prompt (same as before) -------------------------------------------
SYSTEM_PROMPT = """You are MatchForge, the engine that settles a 1v1 football AUCTION game. Two friends just auctioned football players and built two squads; you generate the full match between them as an entertaining, believable highlight timeline. You write like a brilliant TV commentator. Your one question is "whose squad actually works?" — NOT "who has the higher total rating?".

ABSOLUTE RULES:
- Reply with ONLY valid JSON. No markdown code fences, no prose before or after, no trailing commas.
- The match lasts 90 minutes. Events MUST be sorted by minute ascending (minutes 1..90).
- "team" is 0 (home) or 1 (away), or null for neutral events.
- The running score is derived from "goal" events ONLY. Every goal event MUST carry the exact "minute" and the scorer's "player" name. Never skip or duplicate goals, and never have a final score that does not match the goal events.
- The "score" of EVERY event is the cumulative score AFTER that event (score[0] = home, score[1] = away).
- Both teams always play 4-3-3. The formation is fixed — never change it or invent alternatives.
- NO substitutions, NO injuries. The same 11 players finish the match unless a red card removes one. Never create "sub" or "injury" events.
- Red cards are uncommon and never inserted just to create drama. If one happens, that team plays on with 10 men and is realistically weaker afterward.
- Player names MUST come ONLY from the provided rosters. Never invent players or club names.
- Every player plays the position listed after their name — that is their fixed role. Movement during play is natural: a fullback can overlap, a CM can make a late run, a winger can track back, a striker can drift wide. No player ever acts outside their general role: the GK stays in goal, a centre-back is never a striker, a winger is never a centre-back.
- Team stats must be internally consistent: shots >= shotsOnTarget; possession across both teams sums to 100; yellowCards/redCards match the events; passAccuracy between 70 and 95.
- Give each team a "formation" string and an average "rating" (one decimal).

DECIDING THE MATCH — SQUAD FIT BEATS TOTAL RATING:
- Do NOT treat total squad rating as the primary factor. A higher-rated squad is fully capable of losing to a lower-rated one when its pieces don't fit. Even a substantially higher-rated squad can lose.
- Weigh these together: (1) individual quality — higher-rated players generally win more duels, create more, finish better and defend better, but they still make mistakes and can have quiet games; (2) squad balance across attack, midfield, defence and goalkeeper — a star front three with a weak midfield or defence should NOT automatically dominate; (3) complementarity — a creative midfield feeding a lethal forward is dangerous, fast wingers with a strong finisher are dangerous, a defensive midfielder supporting attacking full-backs is good balance, several similar stars fighting for the same space can be less than the sum of their parts, a great goalkeeper can carry a leaky defence, a weak midfield forces an elite attack to rely on transitions; (4) how the two squads match up in the same 4-3-3 — strong wingers punish weak full-backs, a dominant midfield starves the opponents' forwards of service, a strong defensive midfield can disrupt a playmaker, fast forwards punish a high-risk team, strong centre-backs handle a crossing-heavy attack, a physically strong team wins duels without necessarily controlling possession.
- Do not compute chemistry numbers. Use these ideas to shape the story and the outcome.
- Let the auction tell the story: the expensive superstar delivers, or a cheap pick becomes the hero; a team that overspent on attack gets exposed; a balanced squad beats a more individually talented one.

EVENTS — A NATURAL HIGHLIGHT TIMELINE:
- There is no exact target count, but a MINIMUM of ~12 meaningful events per match — that is the floor, not a ceiling. A cagey 0-0 should land around 12; an exciting, eventful match should have noticeably more (15-25+ depending on how much happens). Scale the count with the match: the livelier the game, the richer the timeline. Never add filler just to pad the timeline, but never let a match feel sparse either.
- A goal can come from open play, a counterattack, combination play, individual brilliance, a defensive mistake, a long-range shot, a corner, a free kick, a penalty or a rebound. Do NOT mechanically set up every goal with a previous chance — sometimes a goal just happens. Avoid repetitive patterns (chance -> saved -> chance -> goal -> chance -> saved -> goal).
- Use a sensible mix of types: goal, chance, saved, woodwork, yellow, red, penalty, penalty_missed, corner, foul, tactical, kickoff, half_time, full_time. You need not use every type. Rare events (red cards, penalties, woodwork) stay rare.
- Do NOT force drama: no forced comebacks, late winners or artificially close scores. 0-0, 1-0, 2-0, 3-1, 4-3, a shock 1-2, or a one-sided drubbing are all fine. Some matches are simply boring — that is good.
- Possession does not equal winning: a counter-attacking team can have 40% possession and win 3-1; a team can dominate the ball and struggle to break down a compact opponent.
- Structure the match naturally: kickoff, first-half events, half-time, second-half events, full-time. The second half does not need to be more dramatic than the first.
- Let each match find its own personality (high-tempo chaos, a midfield grind, a defensive war, a goalfest) through its events — do not announce it.

PERFORMANCE:
- The highest-rated player must NOT automatically score. Quality shifts the odds, it doesn't guarantee outcomes. A 93-rated striker can miss, an 82-rated striker can score the winner, a goalkeeper can have a huge game, a defender can make a costly error.
- Commentary is SHORT and punchy — 6 to 15 words, TV-commentary style. Vary the language and avoid stock phrases like "Great chance for..." or "Excellent attack...". Examples: "Nobody tracked the run." "He dragged it wide." "That was going in until the keeper intervened." "The midfield battle is getting ugly." "Too much space in front of the defence."

FINAL OUTPUT:
- MOTM should reflect what actually happened in the events — the goalscorer, or a goalkeeper, a controlling midfielder, a defender who shut down a threat, or an unexpected lower-rated player. It does NOT have to be the highest-rated player.
- End with a "summary" of 2-3 punchy sentences explaining WHY the result happened (squad fit, match-ups, key moments) — not just repeating the score.

Return this EXACT schema:
{
  "teams": [{"name": string, "formation": string, "rating": number}],
  "events": [{"minute": int, "team": 0|1|null, "type": string, "text": string, "player": string|null, "score": [int,int]}],
  "stats": [{"name": string, "possession": int, "shots": int, "shotsOnTarget": int, "corners": int, "fouls": int, "yellowCards": int, "redCards": int, "passes": int, "passAccuracy": int}],
  "motm": {"player": string, "team": 0|1, "rating": number, "note": string},
  "summary": string
}"""

# ---- shared helpers --------------------------------------------------------
_KNOWN_POS = ["GK", "CB", "LB", "RB", "RWB", "LWB", "CDM", "CM", "CAM", "LM", "RM", "CF", "ST", "LW", "RW", "LF", "RF"]
_FORWARD_POS = {"ST", "CF", "LW", "RW", "LF", "RF"}
_DEF_POS = {"CB", "LB", "RB", "RWB", "LWB"}
_MID_POS = {"CDM", "CM", "CAM", "LM", "RM"}

GOAL_PHRASES = ["fires it home!", "slots it past the keeper!", "heads it in!", "finishes with aplomb!", "laces it into the top corner!", "buries it!"]
SAVE_LINES = ["{p}'s strike is saved.", "{p} is denied by the keeper."]
MISS_LINES = ["{p} drags it wide.", "{p} flashes over the bar.", "{p} skews it off target.", "{p} blazes it over."]


def load_api_key():
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    return os.environ.get("GEMINI_API_KEY", "").strip()


def primary_position(p):
    raw = (p.get("positions") or "").upper()
    toks = [t.strip() for t in re.split(r"[|,/\s]+", raw) if t.strip() in _KNOWN_POS]
    if not toks:
        return "?"
    if toks[0] == "GK":
        return "GK"
    for t in toks:
        if t in _FORWARD_POS:
            return t
    return toks[0]


def _zone(pos):
    if pos == "GK":
        return "GK"
    if pos in _DEF_POS:
        return "DEF"
    if pos in _MID_POS:
        return "MID"
    if pos in _FORWARD_POS:
        return "FWD"
    return "MID"


def _num(v, default=0):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return default


def _pname(p):
    if not p:
        return None
    return p.get("name") or p.get("full_name") or "A player"


def build_roster(names, squads, formation):
    lines = []
    for team in range(2):
        name = (names[team] or f"Team {team}")[:20]
        squad = squads[team] or []
        items = []
        for p in squad:
            pos = primary_position(p)
            items.append(f"{p.get('name') or p.get('full_name')} ({pos}, {p.get('overall')})")
        players = ", ".join(items) if items else "unknown"
        lines.append(f"TEAM {team} — {name} (roster: {players})")
    return "\n".join(lines)


def build_lineup(names, squads):
    lines = []
    for team in range(2):
        name = (names[team] or f"Team {team}")[:20]
        squad = squads[team] or []
        lines.append(f"TEAM {team} — {name} (STARTING LINE-UP — every player's fixed role):")
        if not squad:
            lines.append("  (no players — do not invent any)")
            continue
        for i, p in enumerate(squad):
            pos = primary_position(p)
            lines.append(f"  {i + 1:>2}. {p.get('name') or p.get('full_name')}  ->  {pos}")
    return "\n".join(lines)


def build_user_prompt(mode, names, squads, formation):
    fmt = "/".join(str(f) for f in formation)
    if mode == 11:
        formation_rule = "Both teams always play 4-3-3. This is fixed — you may not change formations or introduce alternatives."
        position_rule = (
            "POSITIONS — ROLES, NOT CAGES:\n"
            "The STARTING LINE-UP block below is the source of truth for every player's role. "
            "Each player plays the position listed after their name for the whole match: a listed LB "
            "is a left back, a listed CB a centre back, a listed ST the striker, and so on. Roles never "
            "change. Movement during play is natural football movement — a fullback can overlap, a CM "
            "can make a late run, a winger can track back, a striker can drift wide — but no player ever "
            "acts outside their general role: the GK stays in goal, a centre-back is never a striker, a "
            "winger is never a centre-back. Every event must show a player acting in their listed role."
        )
    else:
        formation_rule = f"Formation: {fmt}"
        position_rule = (
            "POSITIONS — ROLES, NOT CAGES: in this 5v5 match, wingers and forwards (LW/RW/ST/CAM/CF/LF/RF) "
            "are strikers — they attack. Fullbacks and central midfielders stay in midfield/defence. "
            "A player listed LB/RB/CB/CDM/CM is NEVER a striker, and a listed striker is NEVER a "
            "defensive midfielder or defender. Everyone plays the main position in the line-up block."
        )
    return (
        f"Generate the match between the two squads below.\n\n"
        f"Match settings:\n"
        f"- Format: {mode}v{mode}\n"
        f"- {formation_rule}\n\n"
        f"These squads were built in a live auction — make the match reveal whose squad actually works, "
        f"following the engine rules in your instructions. Aim for quality over quantity of events.\n\n"
        f"{build_roster(names, squads, formation)}\n\n"
        f"{build_lineup(names, squads)}\n\n"
        f"{position_rule}\n\n"
        f"Now produce the full match as JSON per the schema. Be efficient with tokens."
    )


def extract_json(text):
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.S | re.I)
    if fence:
        text = fence.group(1).strip()
    data = _try_parse_json(text)
    if data is not None:
        return data
    raise ValueError("AI did not return valid JSON")


def _repair_json(text):
    text = (text or "").strip()
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = re.sub(r",\s*([}\]])", r"\1", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    return text


def _try_parse_json(text):
    attempts = [text, _repair_json(text)]
    for t in attempts:
        try:
            return json.loads(t)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        start = t.find("{")
        end = t.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(t[start : end + 1])
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
    return None


def normalize(data):
    teams = data.get("teams") or []
    stats = data.get("stats") or []
    events = [e for e in (data.get("events") or []) if str(e.get("type") or "").lower() not in ("sub", "injury")]
    motm = data.get("motm") or {}
    if len(teams) < 2:
        raise ValueError("AI response missing both teams")
    if len(stats) < 2:
        raise ValueError("AI response missing team stats")
    for t in teams:
        t["name"] = str(t.get("name") or "Team")
        t["formation"] = str(t.get("formation") or "?")
        t["rating"] = round(float(t.get("rating") or 0), 1)
    clean_events = []
    for i, e in enumerate(events):
        team = e.get("team")
        if team is not None:
            try:
                team = int(team)
            except (TypeError, ValueError):
                team = 0
            if team not in (0, 1):
                team = 0
        clean_events.append({"minute": min(90, max(1, _num(e.get("minute"), i + 1))), "team": team, "type": str(e.get("type") or "chance").lower(), "text": str(e.get("text") or "").strip(), "player": e.get("player") or None, "score": [_num(e.get("score", [0, 0])[0]), _num(e.get("score", [0, 0])[1])]})
    clean_events.sort(key=lambda e: (e["minute"], 0))
    goals = [0, 0]
    for e in clean_events:
        if e["type"] == "goal" and e["team"] is not None:
            goals[e["team"]] += 1
            e["score"] = [goals[0], goals[1]]
        else:
            e["score"] = [goals[0], goals[1]]
    if not any(e["type"] == "half_time" for e in clean_events):
        clean_events.append({"minute": 45, "team": None, "type": "half_time", "text": "Half-time.", "player": None, "score": [goals[0], goals[1]]})
    if not any(e["type"] == "full_time" for e in clean_events):
        clean_events.append({"minute": 90, "team": None, "type": "full_time", "text": "Full-time!", "player": None, "score": [goals[0], goals[1]]})
    clean_events.sort(key=lambda e: (e["minute"], 0))
    clean_stats = []
    poss_total = 0
    for s in stats:
        poss = max(0, min(100, _num(s.get("possession"))))
        clean_stats.append({"name": str(s.get("name") or "Team"), "possession": poss, "shots": max(0, _num(s.get("shots"))), "shotsOnTarget": max(0, _num(s.get("shotsOnTarget"))), "corners": max(0, _num(s.get("corners"))), "fouls": max(0, _num(s.get("fouls"))), "yellowCards": max(0, _num(s.get("yellowCards"))), "redCards": max(0, _num(s.get("redCards"))), "passes": max(0, _num(s.get("passes"))), "passAccuracy": min(95, max(70, _num(s.get("passAccuracy"), 85)))})
        poss_total += poss
    if poss_total != 100 and poss_total > 0:
        clean_stats[0]["possession"] += 100 - poss_total
        clean_stats[0]["possession"] = max(0, min(100, clean_stats[0]["possession"]))
        clean_stats[1]["possession"] = 100 - clean_stats[0]["possession"]
    for s in clean_stats:
        s["shotsOnTarget"] = min(s["shots"], s["shotsOnTarget"])
    final_score = [goals[0], goals[1]]
    winner = 0 if final_score[0] > final_score[1] else (1 if final_score[1] > final_score[0] else None)
    return {"teams": teams, "events": clean_events, "stats": clean_stats, "motm": {"player": str(motm.get("player") or teams[0]["name"]), "team": 0 if motm.get("team") in (0, 1) and motm.get("team") == 0 else (1 if motm.get("team") == 1 else 0), "rating": round(float(motm.get("rating") or 7), 1), "note": str(motm.get("note") or "")}, "summary": str(data.get("summary") or "").strip(), "finalScore": final_score, "winner": winner, "generatedBy": MODEL}


def _chat(messages, key):
    system_text = ""
    contents = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            system_text = m.get("content", "")
            continue
        gemini_role = "model" if role == "assistant" else "user"
        contents.append({"role": gemini_role, "parts": [{"text": m.get("content", "")}]})
    body = {"contents": contents, "systemInstruction": {"parts": [{"text": system_text}]}, "generationConfig": {"temperature": 0.9, "maxOutputTokens": 8192, "responseMimeType": "application/json"}}
    req = urllib.request.Request(API_URL, data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json", "X-goog-api-key": key}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        raise RuntimeError(f"Gemini HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Gemini network error: {e.reason}") from e
    candidates = raw.get("candidates") or []
    first = (candidates[0] if candidates else None) or {}
    parts = (first.get("content") or {}).get("parts") or []
    text = "".join((p.get("text") or "") for p in parts)
    if not text:
        err = raw.get("error") or {}
        fb = raw.get("promptFeedback") or {}
        msg = err.get("message") or fb.get("blockReason") or "empty response"
        raise RuntimeError(f"Gemini API error: {msg}")
    return text


def _retry_chat(chat, base):
    last_error = None
    for attempt in range(4):
        try:
            content = chat(base)
        except Exception as e:
            last_error = e
            time.sleep(2 + attempt * 2)
            continue
        try:
            return normalize(extract_json(content)), None
        except ValueError as e:
            last_error = e
            base = base[:2] + [{"role": "assistant", "content": content}, {"role": "user", "content": f"Your previous reply was not valid JSON: {e}. Reply with ONLY the strict JSON object from the schema — no prose, no code fences, no trailing commas, no smart quotes."}]
            continue
    return None, last_error


# ---- local JSON fallback (offline, no API) ---------------------------------
def team_components(squad):
    gk, defe, mid, fwd = [], [], [], []
    for p in (squad or []):
        pos = primary_position(p)
        ov = _num(p.get("overall"), 70)
        if pos == "GK":
            gk.append(ov)
        elif pos in _DEF_POS:
            defe.append(ov)
        elif pos in _MID_POS:
            mid.append(ov)
        elif pos in _FORWARD_POS:
            fwd.append(ov)
        else:
            mid.append(ov)
    gk_r = max(gk) if gk else 68
    def_r = (sum(defe) / len(defe)) if defe else 70
    mid_r = (sum(mid) / len(mid)) if mid else 70
    fwd_r = (sum(fwd) / len(fwd)) if fwd else 70
    overall = round(0.15 * gk_r + 0.30 * def_r + 0.30 * mid_r + 0.25 * fwd_r, 1)
    attack = 0.6 * fwd_r + 0.4 * mid_r
    defense = 0.6 * def_r + 0.25 * gk_r + 0.15 * mid_r
    midctrl = 0.7 * mid_r + 0.3 * def_r
    return {"gk": gk_r, "defe": def_r, "mid": mid_r, "fwd": fwd_r, "overall": overall, "attack": attack, "defense": defense, "midctrl": midctrl, "players": list(squad or [])}


def _poisson(lam):
    if lam <= 0:
        return 0
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= random.random()
        if p <= L:
            return k - 1


def _sample_minutes(n, lo=2, hi=89):
    out = []
    for _ in range(n):
        m = int(lo + (hi - lo) * (random.random() ** 0.85))
        out.append(max(lo, min(hi, m)))
    return sorted(out)


def _pick_scorer(players):
    pool = [p for p in players if _zone(primary_position(p)) in ("FWD", "MID")]
    if not pool:
        pool = players
    if not pool:
        return None
    w = [_num(p.get("overall"), 70) ** 2 for p in pool]
    return random.choices(pool, weights=w, k=1)[0]


def _pick_any(players, prefer=("FWD", "MID")):
    if not players:
        return None
    pool = [p for p in players if _zone(primary_position(p)) in prefer]
    if not pool:
        pool = players
    return random.choice(pool)


def _generate_local(mode, names, squads, formations=None):
    names = [(names[0] if len(names) > 0 else None) or "Home", (names[1] if len(names) > 1 else None) or "Away"]
    c0 = team_components(squads[0] if len(squads) > 0 else [])
    c1 = team_components(squads[1] if len(squads) > 1 else [])
    diff_mid = c0["midctrl"] - c1["midctrl"]
    poss0 = int(round(50 + 18 * math.tanh(diff_mid / 15)))
    poss0 = max(30, min(70, poss0))
    poss1 = 100 - poss0
    base, gain, scale = 1.3, 1.15, 12.0
    xg0 = base + gain * math.tanh((c0["attack"] - c1["defense"]) / scale)
    xg1 = base + gain * math.tanh((c1["attack"] - c0["defense"]) / scale)
    g0 = _poisson(xg0)
    g1 = _poisson(xg1)
    sh0 = max(g0, round(11 * (c0["attack"] / (c0["attack"] + c1["defense"] + 1e-6)) * random.uniform(0.85, 1.2)))
    sh1 = max(g1, round(11 * (c1["attack"] / (c1["attack"] + c0["defense"] + 1e-6)) * random.uniform(0.85, 1.2)))
    sot0 = min(sh0, max(g0, round(sh0 * random.uniform(0.30, 0.55))))
    sot1 = min(sh1, max(g1, round(sh1 * random.uniform(0.30, 0.55))))
    yel0, yel1 = random.randint(0, 3), random.randint(0, 3)
    red0 = 1 if random.random() < 0.04 else 0
    red1 = 1 if random.random() < 0.04 else 0
    corners0, corners1 = random.randint(2, 8), random.randint(2, 8)
    fouls0, fouls1 = random.randint(6, 16), random.randint(6, 16)
    pa0, pa1 = random.randint(78, 92), random.randint(78, 92)
    passes0 = round(poss0 * 9 * random.uniform(0.9, 1.1))
    passes1 = round(poss1 * 9 * random.uniform(0.9, 1.1))
    if mode == 11:
        form0, form1 = "4-3-3", "4-3-3"
    else:
        form0 = (formations[0] if formations and len(formations) > 0 else "") or "5v5"
        form1 = (formations[1] if formations and len(formations) > 1 else "") or "5v5"
    raw = [(1, None, "kickoff", "Kick-off! Here we go.", None, 0)]
    goal_rows = []
    for m in _sample_minutes(g0):
        goal_rows.append((m, 0, _pick_scorer(c0["players"])))
    for m in _sample_minutes(g1):
        goal_rows.append((m, 1, _pick_scorer(c1["players"])))
    goal_rows.sort(key=lambda x: x[0])
    for (m, team, s) in goal_rows:
        pn = _pname(s) or "A player"
        raw.append((m, team, "goal", f"{pn} {random.choice(GOAL_PHRASES)}", s, 1))
    for team, comp, sh, g in ((0, c0, sh0, g0), (1, c1, sh1, g1)):
        n = max(0, sh - g)
        for m in _sample_minutes(n):
            pl = _pick_any(comp["players"])
            pn = _pname(pl) or "A player"
            r = random.random()
            if r < 0.06:
                typ, txt = "woodwork", f"{pn} hits the woodwork!"
            elif r < 0.5:
                typ, txt = "saved", random.choice(SAVE_LINES).format(p=pn)
            else:
                typ, txt = "chance", random.choice(MISS_LINES).format(p=pn)
            raw.append((m, team, typ, txt, pl, 2))
    for team, comp, n in ((0, c0, yel0), (1, c1, yel1)):
        for m in _sample_minutes(n):
            pl = _pick_any(comp["players"])
            raw.append((m, team, "yellow", f"{_pname(pl)} is shown a yellow card.", pl, 2))
    for team, comp, n in ((0, c0, min(corners0, 3)), (1, c1, min(corners1, 3))):
        for m in _sample_minutes(n):
            raw.append((m, team, "corner", f"Corner for {names[team]}.", None, 2))
    for team, comp, n in ((0, c0, min(fouls0, 3)), (1, c1, min(fouls1, 3))):
        for m in _sample_minutes(n):
            pl = _pick_any(comp["players"])
            raw.append((m, team, "foul", f"Foul by {_pname(pl)}.", pl, 2))
    raw.append((45, None, "half_time", "Half-time.", None, 3))
    raw.append((90, None, "full_time", "Full-time!", None, 4))
    raw.sort(key=lambda x: (x[0], x[5]))
    running = [0, 0]
    events = []
    for (m, team, typ, txt, pl, prio) in raw:
        if typ == "goal" and team in (0, 1):
            running[team] += 1
        events.append({"minute": m, "team": team, "type": typ, "text": txt, "player": _pname(pl), "score": [running[0], running[1]]})
    final = [running[0], running[1]]
    winner = 0 if final[0] > final[1] else (1 if final[1] > final[0] else None)
    scorers = [(team, pl) for (m, team, typ, txt, pl, prio) in raw if typ == "goal" and pl]
    if scorers:
        mt, mp = max(scorers, key=lambda tp: _num(tp[1].get("overall"), 0))
        mr = round(random.uniform(8.0, 9.3), 1)
        note = random.choice(["Took his chances when it mattered.", "The difference-maker in front of goal.", "Ice-cold finishing decided it."])
    else:
        t = winner if winner is not None else 0
        comp = c0 if t == 0 else c1
        mp = max(comp["players"], key=lambda p: _num(p.get("overall"), 0)) if comp["players"] else None
        mt = t
        mr = round(random.uniform(7.2, 8.3), 1)
        note = "A steady, influential display."
    sc0, sc1 = final
    if winner is None:
        summary = f"A tight, even contest finished {sc0}-{sc1}. Neither squad found a decisive edge, and the auction ended all square."
    else:
        wn, ln = names[winner], names[1 - winner]
        sp = _pname(mp) or names[winner]
        edge = "midfield" if (winner == 0 and c0["midctrl"] > c1["midctrl"]) or (winner == 1 and c1["midctrl"] > c0["midctrl"]) else "attack"
        summary = f"{wn} came out on top {sc0}-{sc1}. {sp} was the key man, and {wn}'s {edge} proved too strong for {ln}. "
        summary += random.choice([f"{ln} had their moments but couldn't convert them.", f"The draft told the story: {wn}'s squad simply fit together better.", f"{sp}'s quality swung a closely-matched battle.", f"{ln} were left to rue missed chances at key moments."])
    stats = [{"name": names[0], "possession": poss0, "shots": sh0, "shotsOnTarget": sot0, "corners": corners0, "fouls": fouls0, "yellowCards": yel0, "redCards": red0, "passes": passes0, "passAccuracy": pa0}, {"name": names[1], "possession": poss1, "shots": sh1, "shotsOnTarget": sot1, "corners": corners1, "fouls": fouls1, "yellowCards": yel1, "redCards": red1, "passes": passes1, "passAccuracy": pa1}]
    teams = [{"name": names[0], "formation": form0, "rating": c0["overall"]}, {"name": names[1], "formation": form1, "rating": c1["overall"]}]
    data = {"teams": teams, "events": events, "stats": stats, "motm": {"player": _pname(mp) or names[mt], "team": mt, "rating": mr, "note": note}, "summary": summary}
    norm = normalize(data)
    norm["generatedBy"] = GENERATED_BY_LOCAL
    return norm


def generate_match(mode, names, squads, formation=None):
    key = load_api_key()
    user = build_user_prompt(mode, names, squads, formation or [])
    base = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]
    force_fallback = os.environ.get("MATCHFORGE_FALLBACK") == "1" or not key
    if not force_fallback:
        data, err = _retry_chat(lambda msgs: _chat(msgs, key), list(base))
        if data is not None:
            return data
        print(f"[matchforge] Gemini failed ({err}), falling back to local JSON sim", file=sys.stderr)
    else:
        if not key:
            print("[matchforge] No GEMINI_API_KEY — using local JSON sim", file=sys.stderr)
    # Fallback: deterministic local simulator (always works offline)
    return _generate_local(mode, names, squads, formation)


if __name__ == "__main__":
    demo_squads = [
        [{"name": "Lionel Messi", "positions": "CF", "overall": 91}, {"name": "Kylian Mbappe", "positions": "LW", "overall": 93}],
        [{"name": "Erling Haaland", "positions": "ST", "overall": 92}, {"name": "Kevin De Bruyne", "positions": "CM", "overall": 90}],
    ]
    # Default: uses Gemini if key present, else local. Force local with MATCHFORGE_FALLBACK=1.
    m = generate_match(5, ["Home FC", "Away FC"], demo_squads)
    print(json.dumps(m, indent=2)[:1500])
    print("...events:", len(m["events"]), "final:", m["finalScore"], "by:", m["generatedBy"])
