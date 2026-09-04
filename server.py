"""Auction Arena online server.

Python mirror of web/src/lib/engine.ts so online games behave identically
to offline ones.  Run with:  python server.py
"""

import json
import math
import os
import random
import re
import sqlite3
import string
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from flask import Flask, Response, jsonify, redirect, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room

import matchforge

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
PLAYERS_JSON = ROOT / "web" / "public" / "players.json"
DB_PATH = ROOT / "games.db"
ROOM_TTL_HOURS = 24

# Every player is classified into EXACTLY ONE group. A player who can play a
# wide/forward position (LW/RW/LF/RF/CF/ST) is ALWAYS a forward, even if they
# also list LM/RM/CAM — so wingers like Douglas Costa (LM|RW|LW) get bid in
# LW/RW slots, never stranded in midfield. Otherwise the FIRST listed position
# wins (a pure CAM is a midfielder; CDM/CM who can also play CB stays MID).
GROUP_OF = {
    "GK": "GK",
    "CB": "DEF",
    "LB": "DEF",
    "RB": "DEF",
    "RWB": "DEF",
    "CDM": "MID",
    "CM": "MID",
    "CAM": "MID",
    "LM": "MID",
    "RM": "MID",
    "CF": "FWD",
    "ST": "FWD",
    "LW": "FWD",
    "RW": "FWD",
    "LF": "FWD",
    "RF": "FWD",
}
FORWARD_POS = {"ST", "CF", "LW", "RW", "LF", "RF"}
SLOT_GROUP = {
    "GK": "GK",
    "CB": "DEF",
    "LB": "DEF",
    "RB": "DEF",
    "CM": "MID",
    "LW": "FWD",
    "RW": "FWD",
    "CF": "FWD",
}
KNOWN_POS = {"GK", "CB", "LB", "RB", "RWB", "LWB", "CDM", "CM", "CAM", "LM", "RM", "CF", "ST", "LW", "RW", "LF", "RF"}
# Each bidding slot prefers players whose MAIN position matches the slot, so a
# left back never gets auctioned in an RB slot. Falls back to the broad group.
SLOT_POSITIONS = {
    "GK": {"GK"},
    "CB": {"CB"},
    "LB": {"LB", "LWB"},
    "RB": {"RB", "RWB"},
    "CM": {"CDM", "CM", "CAM", "LM", "RM"},
    "LW": {"LW", "LF"},
    "RW": {"RW", "RF"},
    "CF": {"ST", "CF"},
}
MODE_CONFIG = {
    5: {"budget": 100.0, "formations": [["GK", "CB", "CM", "CF", "CF"], ["GK", "CB", "CM", "CM", "CF"], ["GK", "CB", "CB", "CM", "CF"]]},
    11: {"budget": 200.0, "formations": [["GK", "CB", "CB", "LB", "RB", "CM", "CM", "CM", "LW", "RW", "CF"]]},
}
BID_STEP = 0.5
MIN_BID = 0.5
VISIBLE_FLOOR = 74  # visible "star" cards can't be total no-names
HIDDEN_FLOOR = 66  # mystery cards can come from anywhere in the pool

# Game Changer power tuning (mirrored EXACTLY in web/src/lib/engine.ts).
# Wildcard luck curve: the roll's bell peak scales with remaining budget.
WILDCARD_PEAK_BASE = 68
WILDCARD_PEAK_RANGE = 26
# No Risk No Fun swing: replacement bell peaks ±6 overall around the sacrificed player.
NO_RISK_SWING = 6


def normalize_powers(raw):
    """Sanitize the host's power toggles into a strict config dict."""
    raw = raw if isinstance(raw, dict) else {}
    return {
        "lastBid": bool(raw.get("lastBid")),
        "wildcard": bool(raw.get("wildcard")),
        "noRisk": bool(raw.get("noRisk")),
    }

POOL = {"GK": [], "DEF": [], "MID": [], "FWD": []}


def classify_group(toks):
    """One group per player. Wingers/forwards trump midfield; else first-listed."""
    if "GK" in toks:
        return "GK"
    for t in toks:
        if t in FORWARD_POS:
            return "FWD"
    return next((GROUP_OF[t] for t in toks if t in GROUP_OF), None)


def primary_position(p):
    """Main position of a player: wingers/forwards beat midfield tags (so a
    LM|RW|LW player is a winger), otherwise first-listed real position."""
    raw = (p.get("positions") or "").upper()
    toks = [t.strip() for t in re.split(r"[|,/\s]+", raw) if t.strip() in KNOWN_POS]
    if not toks:
        return "?"
    if toks[0] == "GK":
        return "GK"
    for t in toks:
        if t in FORWARD_POS:
            return t
    return toks[0]


POOL = {"GK": [], "DEF": [], "MID": [], "FWD": []}
POOL_BY_POS = {pos: [] for pos in KNOWN_POS}


def load_pool():
    data = json.loads(PLAYERS_JSON.read_text(encoding="utf-8"))
    for g in POOL:
        POOL[g] = []
    for bucket in POOL_BY_POS:
        POOL_BY_POS[bucket] = []
    for p in data:
        if p.get("overall") is None:
            continue
        toks = [t.strip().upper() for t in re.split(r"[|,]", p.get("positions") or "") if t.strip()]
        group = classify_group(toks)
        if group:
            POOL[group].append(p)
        pos = primary_position(p)
        if pos in POOL_BY_POS:
            POOL_BY_POS[pos].append(p)
    for g in POOL:
        POOL[g].sort(key=lambda p: p["overall"], reverse=True)
    for bucket in POOL_BY_POS:
        POOL_BY_POS[bucket].sort(key=lambda p: p["overall"], reverse=True)


def r2(v):
    return round(v * 2) / 2


def weighted_pick(arr, weight):
    ws = [weight(x) for x in arr]
    total = sum(ws)
    r = random.random() * total
    for i, w in enumerate(ws):
        r -= w
        if r <= 0:
            return arr[i]
    return arr[-1]


def _gauss_weight(o, peak, sl, sr):
    """Two-piece Gaussian: a bell peaking at `peak`, but the low side falls off
    steeply (sigma `sl`) so awful players are rare, while the high side falls
    off gently (sigma `sr`) so stars stay common — Pele shows up more often
    than a 70-rated nobody."""
    d = o - peak
    if d < 0:
        return math.exp(-0.5 * (d / sl) ** 2)
    return math.exp(-0.5 * (d / sr) ** 2)


def slot_candidates(pos):
    """Position-matched pool for a slot, falling back to the broad group."""
    cands = []
    for ppos in SLOT_POSITIONS[pos]:
        cands.extend(POOL_BY_POS.get(ppos, []))
    if not cands:
        cands = POOL[SLOT_GROUP[pos]]
    return cands


def pick_visible(pos, used):
    cands = slot_candidates(pos)
    cand = [p for p in cands if p["overall"] >= VISIBLE_FLOOR and p["id"] not in used]
    if not cand:
        cand = [p for p in cands if p["id"] not in used]
    return weighted_pick(cand, lambda p: _gauss_weight(p["overall"], 84, 5, 8))


def pick_hidden(pos, used, visible):
    cands = slot_candidates(pos)
    cand = [p for p in cands if p["overall"] >= HIDDEN_FLOOR and p["id"] != visible["id"] and p["id"] not in used]
    if not cand:
        cand = [p for p in cands if p["id"] != visible["id"] and p["id"] not in used]
    if not cand:
        return visible
    return weighted_pick(cand, lambda p: _gauss_weight(p["overall"], 84, 7, 9))


def create_rounds(formation, used):
    rounds = []
    for pos in formation:
        visible = pick_visible(pos, used)
        hidden = pick_hidden(pos, used, visible)
        used.add(visible["id"])
        used.add(hidden["id"])
        rounds.append(
            {"pos": pos, "visible": visible, "hidden": hidden, "status": "bidding", "bids": [], "winner": None, "wonAmount": 0}
        )
    return rounds


def create_state(mode, names, formation=None, powers=None):
    cfg = MODE_CONFIG[mode]
    if not formation or not isinstance(formation, list) or not all(p in SLOT_GROUP for p in formation):
        formation = random.choice(cfg["formations"])
    rounds = create_rounds(formation, set())
    return {
        "mode": mode,
        "budget": cfg["budget"],
        "formation": formation,
        "roundIdx": 0,
        "rounds": rounds,
        "budgets": [cfg["budget"], cfg["budget"]],
        "lastBid": 0,
        "bidder": None,
        "turn": random.randint(0, 1),
        "status": "open",
        "phase": "round",
        "squads": [[], []],
        "prices": [[], []],
        "logs": [{"text": f"{names[0]} vs {names[1]} — {mode}v{mode} draft", "at": int(time_ms())}],
        "winner": None,
        "names": list(names),
        "powers": normalize_powers(powers),
        "powerUsed": [
            {"wildcard": False, "noRisk": False},
            {"wildcard": False, "noRisk": False},
        ],
    }


def time_ms():
    import time

    return int(time.time() * 1000)


def log(s, text):
    s["logs"].insert(0, {"text": text, "at": time_ms()})


def cur_round(s):
    return s["rounds"][s["roundIdx"]]


def open_bid(s, amount):
    r = cur_round(s)
    if s["phase"] != "round" or s["status"] != "open" or r["status"] != "bidding":
        return False
    amt = float(amount)
    if amt < MIN_BID or amt > s["budgets"][s["turn"]]:
        return False
    amt = r2(max(MIN_BID, min(amt, s["budgets"][s["turn"]])))
    s["lastBid"] = amt
    s["bidder"] = s["turn"]
    r["bids"].append({"by": s["turn"], "amount": amt})
    s["turn"] = 1 - s["turn"]
    s["status"] = "response"
    log(s, f"{s['names'][s['bidder']]} opened for {amt:.1f}M")
    return True


def raise_bid(s, amount):
    r = cur_round(s)
    if s["phase"] != "round" or s["status"] != "response" or r["status"] != "bidding" or s["bidder"] is None:
        return False
    min_raise = r2(s["lastBid"] + BID_STEP)
    amt = float(amount)
    if amt < min_raise or amt > s["budgets"][s["turn"]]:
        return False
    amt = r2(max(min_raise, min(amt, s["budgets"][s["turn"]])))
    s["lastBid"] = amt
    s["bidder"] = s["turn"]
    r["bids"].append({"by": s["turn"], "amount": amt})
    s["turn"] = 1 - s["turn"]
    log(s, f"{s['names'][s['bidder']]} raised to {amt:.1f}M")
    return True


def fold_bid(s):
    r = cur_round(s)
    if s["phase"] != "round" or s["status"] != "response" or r["status"] != "bidding" or s["bidder"] is None:
        return False
    winner = s["bidder"]
    amount = s["lastBid"]
    r["winner"] = winner
    r["wonAmount"] = amount
    r["status"] = "reveal"
    s["status"] = "round_done"
    s["budgets"][winner] = round(s["budgets"][winner] - amount, 1)
    s["squads"][winner].append(r["visible"])
    s["prices"][winner].append(amount)
    s["squads"][1 - winner].append(r["hidden"])
    log(s, f"{s['names'][winner]} won {r['visible']['name']} for {amount:.1f}M")
    # LAST BID power: backing down doesn't leave you empty-handed — you sign
    # the hidden player for the price of your own last bid of this auction.
    folder = 1 - winner
    folder_cost = 0
    if (s.get("powers") or {}).get("lastBid"):
        mine = next((b for b in reversed(r["bids"]) if b["by"] == folder), None)
        if mine and mine["amount"] > 0:
            folder_cost = mine["amount"]
            s["budgets"][folder] = round(s["budgets"][folder] - mine["amount"], 1)
            log(s, f"💰 LAST BID — {s['names'][folder]} backs down and signs {r['hidden']['name']} for {mine['amount']:.1f}M")
    s["prices"][folder].append(folder_cost)
    return True


def _owned_ids(s):
    ids = set()
    for squad in s["squads"]:
        for p in squad:
            ids.add(p["id"])
    return ids


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _recompute_winner(s):
    """Silent winner refresh after endgame powers shuffle squad totals."""
    ta = sum(p["overall"] for p in s["squads"][0])
    tb = sum(p["overall"] for p in s["squads"][1])
    if ta > tb:
        s["winner"] = 0
    elif tb > ta:
        s["winner"] = 1
    else:
        s["winner"] = 0 if s["budgets"][0] >= s["budgets"][1] else 1


def use_wildcard(s, idx, player_id):
    """WILDCARD (once per team, ENDGAME only): the player picks which of their
    own squad players to risk. The replacement is rolled from the same
    position group with the bell peak scaled by leftover budget — a fat bank
    tilts fate toward stars, but it always stays a probability play."""
    powers = s.get("powers") or {}
    used_list = s.get("powerUsed") or []
    used = used_list[idx] if idx < len(used_list) else None
    if not powers.get("wildcard") or not used or used.get("wildcard"):
        return False
    if s["phase"] != "end":
        return False
    squad = s["squads"][idx]
    slot = next((i for i, p in enumerate(squad) if p["id"] == player_id), -1)
    if slot < 0:
        return False
    out = squad[slot]

    used["wildcard"] = True
    frac = _clamp(s["budgets"][idx] / s["budget"], 0, 1.2)
    peak = _clamp(WILDCARD_PEAK_BASE + WILDCARD_PEAK_RANGE * frac, 70, 94)

    group = classify_group([t.strip().upper() for t in re.split(r"[|,]", out.get("positions") or "") if t.strip()]) or "MID"
    owned = _owned_ids(s)
    owned.add(out["id"])
    cands = [p for p in POOL[group] if p["id"] not in owned]
    if not cands:
        cands = [p for p in POOL[group] if p["id"] != out["id"]]
    picked = weighted_pick(cands, lambda p: _gauss_weight(p["overall"], peak, 6, 8)) if cands else None
    if not picked:
        return False

    squad[slot] = picked
    _recompute_winner(s)
    log(s, f"🎰 WILDCARD — {s['names'][idx]} risked {out['name']} ({out['overall']}) on {s['budgets'][idx]:.1f}M luck… rolled {picked['name']} ({picked['overall']})!")
    return True


def use_no_risk(s, idx):
    """NO RISK NO FUN (once per team, ENDGAME only): feed a random signing
    into the machine — it spits back a replacement from the same position
    group that is randomly better… or worse."""
    powers = s.get("powers") or {}
    used_list = s.get("powerUsed") or []
    used = used_list[idx] if idx < len(used_list) else None
    if not powers.get("noRisk") or not used or used.get("noRisk"):
        return False
    if s["phase"] != "end":
        return False
    squad = s["squads"][idx]
    if not squad:
        return False

    slot = random.randrange(len(squad))
    out = squad[slot]
    toks = [t.strip().upper() for t in re.split(r"[|,]", out.get("positions") or "") if t.strip()]
    group = classify_group(toks) or "MID"
    up = random.random() < 0.5
    peak = out["overall"] + NO_RISK_SWING if up else out["overall"] - NO_RISK_SWING

    owned = _owned_ids(s)
    owned.add(out["id"])
    cands = [p for p in POOL[group] if p["id"] not in owned]
    if not cands:
        cands = [p for p in POOL[group] if p["id"] != out["id"]]
    picked = weighted_pick(cands, lambda p: _gauss_weight(p["overall"], peak, 4, 5)) if cands else out

    used["noRisk"] = True
    squad[slot] = picked
    _recompute_winner(s)

    if picked["overall"] > out["overall"]:
        verdict = "UPGRADE"
    elif picked["overall"] < out["overall"]:
        verdict = "DOWNGRADE"
    else:
        verdict = "SWAP"
    log(s, f"🃏 NO RISK NO FUN — {s['names'][idx]} fed {out['name']} ({out['overall']}) into the machine… {verdict}: {picked['name']} ({picked['overall']})!")
    return True


def next_round(s):
    if s["phase"] == "end":
        return False
    # Only advance from a finished round — double-taps on "Continue"/"Next"
    # from either client must never skip a round that is still being bid on.
    r = cur_round(s)
    if s["status"] != "round_done" or r["status"] != "reveal":
        return False
    s["roundIdx"] += 1
    if s["roundIdx"] >= len(s["rounds"]):
        s["phase"] = "end"
        s["status"] = "round_done"
        compute_winner(s)
        return True
    r = cur_round(s)
    r["status"] = "bidding"
    s["lastBid"] = 0
    s["bidder"] = None
    s["status"] = "open"
    s["turn"] = random.randint(0, 1)
    return True


def compute_winner(s):
    a, b = s["squads"]
    ta = sum(p["overall"] for p in a)
    tb = sum(p["overall"] for p in b)
    if ta > tb:
        w = 0
    elif tb > ta:
        w = 1
    else:
        w = 0 if s["budgets"][0] >= s["budgets"][1] else 1
    s["winner"] = w
    log(s, f"Final: {s['names'][0]} {ta} — {tb} {s['names'][1]}")


# ---------------- sqlite persistence ----------------
# Rooms (running games) are mirrored to games.db so a server restart on
# PythonAnywhere doesn't wipe in-flight matches. Clients rejoin via "rejoin".
# All writes go through a single lock: socket events run in separate threads
# and sqlite lock acquisition is NOT FIFO, so without serialization an older
# state could commit last and clobber the newest one.

import threading as _threading

_db_lock = _threading.Lock()


def db_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _db_lock, db_conn() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS rooms (
                code TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )"""
        )


def save_room(code, room):
    payload = {k: v for k, v in room.items() if k not in ("host_sid", "guest_sid")}
    try:
        with _db_lock, db_conn() as conn:
            conn.execute(
                "INSERT INTO rooms (code, data, created_at, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(code) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                (code, json.dumps(payload, ensure_ascii=False), time.time(), time.time()),
            )
    except sqlite3.Error:
        pass  # DB hiccups must never break gameplay


def delete_room(code):
    try:
        with _db_lock, db_conn() as conn:
            conn.execute("DELETE FROM rooms WHERE code=?", (code,))
    except sqlite3.Error:
        pass


def load_rooms():
    rooms = {}
    try:
        with db_conn() as conn:
            rows = conn.execute("SELECT code, data FROM rooms").fetchall()
    except sqlite3.Error:
        return rooms
    for row in rows:
        try:
            data = json.loads(row["data"])
        except ValueError:
            continue
        data["host_sid"] = None
        data["guest_sid"] = None
        rooms[row["code"]] = data
    return rooms


def prune_rooms():
    cutoff = time.time() - ROOM_TTL_HOURS * 3600
    try:
        with _db_lock, db_conn() as conn:
            conn.execute("DELETE FROM rooms WHERE updated_at < ?", (cutoff,))
    except sqlite3.Error:
        pass


app = Flask(__name__)

sio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", logger=False, engineio_logger=False)
init_db()
prune_rooms()
ROOMS = load_rooms()


def room_state(code):
    return ROOMS.get(code)


def push(code):
    room = room_state(code)
    if room and room.get("state"):
        sio.emit("state", room["state"], room=code)
        save_room(code, room)


def sid_idx(room, sid):
    if room.get("host_sid") == sid:
        return 0
    if room.get("guest_sid") == sid:
        return 1
    return None


@sio.event
def disconnect():
    sid = request.sid
    for code, room in list(ROOMS.items()):
        if room.get("host_sid") != sid and room.get("guest_sid") != sid:
            continue
        is_host = room.get("host_sid") == sid
        other = room.get("guest_sid") if is_host else room.get("host_sid")
        if other:
            sio.emit("opponent_left", room=other)
        if room.get("state"):
            leave_room(code, sid)
        else:
            leave_room(code, sid)
            ROOMS.pop(code, None)
            delete_room(code)
        return


@sio.on("create")
def on_create(data):
    sid = request.sid
    mode = int(data.get("mode", 5))
    name = (data.get("name") or "Host")[:14]
    formation = data.get("formation")
    powers = normalize_powers(data.get("powers"))
    code = "".join(random.choices(string.ascii_uppercase, k=5))
    while code in ROOMS:
        code = "".join(random.choices(string.ascii_uppercase, k=5))
    ROOMS[code] = {
        "host_sid": sid,
        "guest_sid": None,
        "names": [name, "Waiting…"],
        "state": None,
        "mode": mode,
        "formation": formation,
        "powers": powers,
    }
    save_room(code, ROOMS[code])
    join_room(code, sid)
    emit("created", {"code": code, "idx": 0, "powers": powers})


@sio.on("join")
def on_join(data):
    sid = request.sid
    code = (data.get("code") or "").upper()
    name = (data.get("name") or "Guest")[:14]
    room = ROOMS.get(code)
    if not room or room.get("guest_sid") is not None:
        emit("joined", {"ok": False, "error": "Room not found or already full"})
        return
    room["guest_sid"] = sid
    room["names"][1] = name
    save_room(code, room)
    join_room(code, sid)
    emit("joined", {"ok": True, "code": code, "idx": 1, "powers": room.get("powers")})
    sio.emit("opponent_joined", {"name": name}, room=room["host_sid"])


@sio.on("rejoin")
def on_rejoin(data):
    """Re-attach a client to a persisted room after a reconnect / restart."""
    sid = request.sid
    code = (data.get("code") or "").upper()
    try:
        idx = int(data.get("idx", 0))
    except (TypeError, ValueError):
        idx = 0
    room = ROOMS.get(code)
    if not room:
        emit("rejoined", {"ok": False, "error": "Room no longer exists"})
        return
    room["host_sid" if idx == 0 else "guest_sid"] = sid
    join_room(code, sid)
    emit("rejoined", {"ok": True, "code": code, "idx": idx})
    if room.get("state"):
        sio.emit("state", room["state"], room=sid)


@sio.on("start")
def on_start():
    sid = request.sid
    for code, room in ROOMS.items():
        if room.get("host_sid") == sid and room.get("guest_sid") is not None:
            room["state"] = create_state(room["mode"], room["names"], room.get("formation"), room.get("powers"))
            push(code)
            return


@sio.on("bid")
def on_bid(data):
    sid = request.sid
    code = find_room_for(sid)
    if not code:
        return
    room = ROOMS[code]
    s = room.get("state")
    idx = sid_idx(room, sid)
    if not s or idx is None or s["turn"] != idx:
        return
    amount = data.get("amount")
    if s["status"] == "open":
        ok = open_bid(s, amount)
    elif s["status"] == "response":
        ok = raise_bid(s, amount)
    else:
        ok = False
    if ok:
        push(code)


@sio.on("fold")
def on_fold():
    sid = request.sid
    code = find_room_for(sid)
    if not code:
        return
    room = ROOMS[code]
    s = room.get("state")
    idx = sid_idx(room, sid)
    if not s or idx is None or s["turn"] != idx:
        return
    if fold_bid(s):
        push(code)


@sio.on("wildcard")
def on_wildcard(data=None):
    sid = request.sid
    code = find_room_for(sid)
    if not code:
        return
    room = ROOMS[code]
    s = room.get("state")
    idx = sid_idx(room, sid)
    if not s or idx is None:
        return
    player_id = None
    if isinstance(data, dict):
        try:
            player_id = int(data.get("playerId"))
        except (TypeError, ValueError):
            return
    if use_wildcard(s, idx, player_id):
        push(code)


@sio.on("no_risk")
def on_no_risk():
    sid = request.sid
    code = find_room_for(sid)
    if not code:
        return
    room = ROOMS[code]
    s = room.get("state")
    idx = sid_idx(room, sid)
    if not s or idx is None:
        return
    if use_no_risk(s, idx):
        push(code)


@sio.on("next")
def on_next():
    sid = request.sid
    code = find_room_for(sid)
    if not code:
        return
    room = ROOMS[code]
    s = room.get("state")
    if not s or s["phase"] != "round":
        return
    if s["status"] == "round_done" and cur_round(s)["status"] == "reveal":
        if next_round(s):
            push(code)


@sio.on("rematch")
def on_rematch():
    sid = request.sid
    code = find_room_for(sid)
    if not code:
        return
    room = ROOMS[code]
    if room.get("state"):
        room["state"] = create_state(room["state"]["mode"], room["names"], room.get("formation"), room.get("powers"))
        push(code)


def find_room_for(sid):
    for code, room in ROOMS.items():
        if room.get("host_sid") == sid or room.get("guest_sid") == sid:
            return code
    return None


@app.route("/api/match-sim", methods=["POST"])
def match_sim():
    payload = request.get_json(force=True, silent=True) or {}
    names = payload.get("names") or ["Home", "Away"]
    squads = payload.get("squads") or [[], []]
    mode = int(payload.get("mode", 11))
    formations = payload.get("formations") or []
    try:
        match = matchforge.generate_match(mode, names, squads, formations)
        return jsonify({"ok": True, "match": match})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "rooms": len(ROOMS)})


# ---- sofifa image proxy ----
# Sofifa hotlink-blocks direct embedding, so we fetch player headshots server
# side with spoofed browser headers (like the old PHP proxy) and serve them
# from our own origin. An in-process cache + long browser cache headers keep
# it fast: each image is fetched at most once per server lifetime.
IMG_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
ALLOWED_IMG_HOSTS = {"cdn.sofifa.net", "sofifa.net"}
IMG_TTL_SECONDS = 24 * 3600
IMG_CACHE_MAX = 512
_img_cache = {}  # url -> (bytes, fetched_at)


def _img_fetch(u):
    req = urllib.request.Request(
        u,
        headers={
            "User-Agent": IMG_UA,
            "Referer": "https://sofifa.com/",
            # Ask for PNG explicitly — with a generic image/* Accept sofifa
            # content-negotiates WebP.
            "Accept": "image/png,image/*;q=0.8,*/*;q=0.5",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read(), (resp.headers.get("Content-Type") or "").split(";")[0].strip()


@app.route("/api/img-proxy")
def img_proxy():
    u = request.args.get("u", "")
    host = (urllib.parse.urlsplit(u).hostname or "").lower()
    if host not in ALLOWED_IMG_HOSTS or not u.lower().startswith("https://"):
        return jsonify({"ok": False, "error": "only sofifa images are allowed"}), 400

    now = time.time()
    hit = _img_cache.get(u)
    if hit and now - hit[1] < IMG_TTL_SECONDS:
        data, ctype = hit[0], hit[2]
    else:
        try:
            data, ctype = _img_fetch(u)
        except Exception:
            # Graceful fallback: let the browser try the original URL itself.
            return redirect(u, code=302)
        _img_cache[u] = (data, now, ctype)
        if len(_img_cache) > IMG_CACHE_MAX:
            for k in sorted(_img_cache, key=lambda k: _img_cache[k][1])[: IMG_CACHE_MAX // 2]:
                _img_cache.pop(k, None)

    resp = Response(data, mimetype=ctype if ctype.startswith("image/") else "image/png")
    resp.headers["Cache-Control"] = "public, max-age=604800"
    return resp


# ---- serve the built React app (web/dist) if present — makes the backend a
# single deployable unit on PythonAnywhere: same origin for /api + socket.io.
DIST = ROOT / "web" / "dist"
if DIST.exists():
    @app.route("/")
    def spa_index():
        return send_from_directory(DIST, "index.html")

    @app.route("/<path:path>")
    def spa_files(path):
        if path.startswith("socket.io/"):
            return "", 404
        target = DIST / path
        if target.is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")


load_pool()

# Port: cloud platforms (Koyeb etc.) inject PORT; local dev uses AUCTION_PORT.
PORT = int(os.environ.get("PORT") or os.environ.get("AUCTION_PORT", "8137"))

if __name__ == "__main__":
    print(f"Auction Arena server on http://localhost:{PORT}")
    sio.run(app, host="0.0.0.0", port=PORT, debug=False, use_reloader=False,allow_unsafe_werkzeug=True)
