"""Bump sofifa image resolution from 60 to 360 (max), keeping the game version.

https://cdn.sofifa.net/players/a/b/{version}_{res}.png  ->  {version}_360.png
"""
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")

con = sqlite3.connect("players.db")
n = con.execute(
    "UPDATE players SET image_url = replace(image_url, '_60.png', '_360.png') "
    "WHERE source='sofifa' AND image_url LIKE '%_60.png'"
).rowcount
con.commit()
still = con.execute(
    "SELECT COUNT(*) FROM players WHERE source='sofifa' AND image_url NOT LIKE '%_360.png'"
).fetchone()[0]
con.close()
print(f"updated {n} urls, remaining non-360: {still}")
