import fs from "node:fs";
import { buildPool, createGame, openBid, raiseBid, foldBid, nextRound } from "../src/lib/engine";
import type { EngineState } from "../src/lib/types";

const players = JSON.parse(fs.readFileSync("public/players.json", "utf-8"));
const pool = buildPool(players);

let games = 0;
for (let g = 0; g < 20; g++) {
  const mode = g % 2 === 0 ? 5 : 11;
  const s = createGame(mode, pool, ["A", "B"]);
  let guard = 0;
  while (s.phase === "round" && guard++ < 1000) {
    const r = s.rounds[s.roundIdx];
    if (s.status === "open") {
      const amt = Math.round((1 + Math.random() * 20) * 2) / 2;
      openBid(s, amt);
    } else if (s.status === "response") {
      if (Math.random() < 0.4 || s.budgets[s.turn] < s.lastBid + 0.5) {
        foldBid(s);
      } else {
        raiseBid(s, s.lastBid + 0.5 + Math.floor(Math.random() * 5) * 0.5);
      }
    }
    if (s.status === "round_done") {
      const win = r.winner!;
      const amt = r.wonAmount;
      if (s.budgets[win] < 0) throw new Error("negative budget");
      nextRound(s);
    }
  }
  if (guard >= 1000) throw new Error("infinite loop");
  if (s.phase !== "end") throw new Error("game did not end");
  if (s.squads[0].length !== s.formation.length || s.squads[1].length !== s.formation.length)
    throw new Error("squads not full");
  for (const b of s.budgets) if (b < 0) throw new Error("negative budget at end");
  if (s.winner == null) throw new Error("no winner");
  games++;
}

console.log(`simulated ${games} complete games OK`);
