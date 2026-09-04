"""Export the player pool from players.db into the frontend's public folder."""
import json
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "players.db"
OUT = ROOT / "web" / "public" / "players.json"

con = sqlite3.connect(DB)
rows = con.execute(
    """SELECT name, full_name, positions, overall, club_name, nationality_name,
              image_url, source, is_legend
       FROM players WHERE overall IS NOT NULL"""
).fetchall()
con.close()

players = [
    {
        "id": i,
        "name": r[0],
        "full_name": r[1],
        "positions": r[2],
        "overall": r[3],
        "club": r[4],
        "nation": r[5],
        "img": r[6],
        "source": r[7],
        "legend": bool(r[8]),
    }
    for i, r in enumerate(rows)
]

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(players, ensure_ascii=False), encoding="utf-8")
print(f"exported {len(players)} players -> {OUT}")
