# Auction Arena ⚽

A multiplayer **blind-card football auction draft** game. Each round you bid on a
visible star player; the loser of the auction gets a **mystery** card. Build the
stronger squad within a fixed budget.

## Stack

- **Frontend** — React 18 + TypeScript + Vite, Tailwind CSS (shadcn-style tokens),
  Zustand, Framer Motion, socket.io-client
- **Backend (online)** — Flask + Flask-SocketIO (Python mirror of the TS game engine)
- **Match engine** — MatchForge: one-shot AI match generation via Google Gemini
  (`gemini-flash-latest`, needs a `GEMINI_API_KEY` in `.env`)
- **Data** — `players.db` (779 players) exported to `web/public/players.json`;
  running games persisted to `games.db` (sqlite) so they survive restarts

## Layout

```
players.db            player pool source (sqlite)
scripts/export_pool.py    players.db -> web/public/players.json
scripts/engine_mirror_test.py   Python engine parity test
server.py             online game server (Flask-SocketIO + sqlite rooms)
wsgi.py               PythonAnywhere WSGI entrypoint
matchforge.py         Gemini match generation (squads -> full match JSON)
games.db              sqlite mirror of running games (auto-created)
web/                  React app (Vite)
web/src/lib/engine.ts offline game engine + AI (single source of truth)
web/src/lib/types.ts  shared game types
web/src/lib/matchforge.ts  client-side match normalization + replay types
web/src/store/useGame.ts   local + online state (Zustand + socket wiring)
web/tests/            engine simulation + online flow + rejoin tests
```

## Run it

Terminal 1 — player pool (only needed after re-scraping `players.db`):

```
python scripts/export_pool.py
```

Terminal 2 — web app:

```
cd web
npm install
npm run dev          # http://localhost:8138
```

Terminal 3 — online server (required only for the "Online" mode):

```
pip install flask flask-socketio simple-websocket
python server.py     # http://localhost:8137  (long-polling)
```

> Ports: the server listens on 8137 by default (override with `AUCTION_PORT`),
> the Vite dev server on 8138. Both avoid the common 5000/5173.

Match generation needs an API key. Create a `.env` in the repo root:

```
GEMINI_API_KEY=your_key_from_aistudio.google.com
```

Play modes: **vs Computer**, **Local 2P** (pass & play), or **Online** (create a
room code / join). Formats: 5v5 (€100M) or 11v11 (€200M).

## Deploy on PythonAnywhere

1. Upload the repo (or clone it) into `/home/<you>/auctionarena`.
2. Create a virtualenv, install `flask flask-socketio simple-websocket`, and
   `python scripts/export_pool.py` to generate `web/public/players.json`.
3. In the **Web** tab: set the WSGI configuration file to
   `/home/<you>/auctionarena/wsgi.py`. Add an env var `GEMINI_API_KEY` (or keep
   the `.env` file).
4. Build the frontend once and commit `web/dist` (the server serves it itself —
   no separate static hosting needed):

   ```
   cd web && npm install && npm run build
   ```

5. Reload. The server runs with Socket.IO long-polling (no websockets needed),
   and rooms persist in `games.db` so a PythonAnywhere restart doesn't kill
   in-flight games — players just reload and get reconnected automatically.

> Free-tier note: the match-sim calls the Gemini API per match, so keep an eye
> on your Gemini free quota.

## Game rules

- Each round shows one **visible** card; a hidden **mystery** card is drawn at the same time.
- Both players bid; you may open or respond. The player holding the **last bid** wins —
  you may only back down when it's **your turn to respond**, not once you own the bid.
- Winner pays the final price and gets the visible player; the loser gets the mystery card.
- Squad with the higher **total overall** wins. Tie → higher remaining budget.

## Tests

```
python scripts/engine_mirror_test.py         # engine parity (Python vs TS)
npx esbuild tests/engine-sim.ts --bundle --platform=node --format=esm --outfile=_sim.mjs && node _sim.mjs   # 20 full-game sims
node tests/online-flow.mjs                    # socket flow: create/join/start/bid/fold/next
node tests/rejoin-flow.mjs <ROOM_CODE>        # rejoin a room after a server restart
```

## Known limits

- Online server uses long-polling transport (eventlet websockets don't install cleanly
  on this Windows/Python setup). Fine for a turn-based game. Works on PythonAnywhere
  without websocket support.
- `players.db` was built from an earlier data pull (legends + top-rated FIFA 26 players).
- 11v11 drafts group DEF/MID/FWD by player's main position; the match sim lines players
  up in their real position (an RB stays a right-back, never shifted to CB).
