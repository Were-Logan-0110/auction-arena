# Player Database Spec — new, bigger players.db

Status: framework decided. Bigger DB not built yet.

## Base columns (required for every row)

| column      | type   | meaning                                              |
|-------------|--------|------------------------------------------------------|
| name        | text   | short display name (e.g. "Di María", "Mbappé")       |
| main_pos    | text   | primary position (GK / DEF / MID / FWD, or specific) |
| alt_pos     | text   | secondary positions (comma / pipe separated, may be empty) |
| overall     | int    | overall rating (used for dedupe + power in game)     |
| image_url   | text   | player card image                                    |
| source      | text   | where the players came from (e.g. `FC26`, `sofifa`, `icons`, ...) |

## Rule 1 — duplicates are ALLOWED in storage

We may have the same player more than once in the DB (e.g. two Mbappés, or the
same player from two different sources). Keep both rows. Do NOT delete either.

## Rule 2 — a name must map to the highest overall at pick time

Whenever the game draws/selects a player by name, it must ALWAYS resolve to the
highest-overall row for that name:

- two Mbappés (89 and 91)  ->  the 91 is always the one that shows up
- Di María 87 and 89       ->  the 89 is always the one that shows up
- duplicate rows of the SAME name from different sources -> highest overall wins

This dedupe happens at SELECTION/LOAD time, not by editing the stored rows.

## Rule 3 — name matching is normalized

Names are compared case-insensitively and accent-insensitively:
`DI MARÍA`, `Di María`, `di maria` are the same player.

## Current DB for reference (not the target)

- file: `players.db`, 779 rows, sources: FC26 (444), icons (132), sofifa (203)
- richer schema today: fc_id, name, full_name, positions, overall, value_eur,
  age, club_name, league_name, nationality_name, image_url, is_retired,
  is_legend, source, editions
- game loads via `load_pool()` in server.py from exported JSON, buckets by
  position group (GK/DEF/MID/FWD) sorted by overall desc.

Next step: TBD — user will specify (scrape a bigger pool / new sources, build
script, then update load_pool to enforce Rule 2).
