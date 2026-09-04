import type {
  AuctionRound,
  Bid,
  EngineState,
  LogEntry,
  Mode,
  Player,
  Pos,
  PowerConfig,
  TeamPowerUsed,
} from "./types";
import { BID_STEP, MIN_BID, MODE_CONFIG } from "./types";
import { clamp, roundHalf } from "./utils";

/**
 * Position classifier. Every player is assigned to EXACTLY ONE group
 * (GK / DEF / MID / FWD). A player who can play a wide/forward position
 * (LW/RW/LF/RF/CF/ST) is ALWAYS a forward — wingers like Douglas Costa
 * (LM|RW|LW) get bid in LW/RW slots, never stranded in midfield. Otherwise
 * the FIRST listed position wins (a pure CAM is a midfielder, and a player
 * mainly listed CDM/CM who can also play CB stays a midfielder).
 */
export type Group = "GK" | "DEF" | "MID" | "FWD";

const GROUP_OF: Record<string, Group> = {
  GK: "GK",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  RWB: "DEF",
  CDM: "MID",
  CM: "MID",
  CAM: "MID",
  LM: "MID",
  RM: "MID",
  CF: "FWD",
  ST: "FWD",
  LW: "FWD",
  RW: "FWD",
  LF: "FWD",
  RF: "FWD",
};

const FORWARD_POS = new Set(["ST", "CF", "LW", "RW", "LF", "RF"]);

/** Which slot draws from which group (fallback when the position pool is dry). */
const SLOT_GROUP: Record<Pos, Group> = {
  GK: "GK",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  CM: "MID",
  LW: "FWD",
  RW: "FWD",
  CF: "FWD",
};

const KNOWN_POS = [
  "GK",
  "CB",
  "LB",
  "RB",
  "RWB",
  "LWB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "CF",
  "ST",
  "LW",
  "RW",
  "LF",
  "RF",
];

/** Each bidding slot prefers players whose MAIN position matches the slot, so a
 *  left back never gets auctioned in an RB slot. Falls back to the broad group. */
const SLOT_POSITIONS: Record<Pos, Set<string>> = {
  GK: new Set(["GK"]),
  CB: new Set(["CB"]),
  LB: new Set(["LB", "LWB"]),
  RB: new Set(["RB", "RWB"]),
  CM: new Set(["CDM", "CM", "CAM", "LM", "RM"]),
  LW: new Set(["LW", "LF"]),
  RW: new Set(["RW", "RF"]),
  CF: new Set(["ST", "CF"]),
};

function playerTokens(p: Player): string[] {
  return p.positions
    .split(/[|,]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function primaryGroup(p: Player): Group | null {
  const toks = playerTokens(p);
  if (toks.includes("GK")) return "GK";
  for (const t of toks) {
    if (FORWARD_POS.has(t)) return "FWD";
  }
  for (const t of toks) {
    const g = GROUP_OF[t];
    if (g) return g;
  }
  return null;
}

/** Main position of a player: wingers/forwards beat midfield tags (so a
 *  LM|RW|LW player is a winger), otherwise first-listed real position. */
export function primaryPosition(p: Player): string | null {
  const toks = playerTokens(p);
  if (toks.length === 0) return null;
  if (toks[0] === "GK") return "GK";
  for (const t of toks) {
    if (FORWARD_POS.has(t)) return t;
  }
  return toks[0];
}

export interface Pool {
  byGroup: Record<Group, Player[]>;
  byPos: Record<string, Player[]>;
}

export function buildPool(players: Player[]): Pool {
  const byGroup = { GK: [], DEF: [], MID: [], FWD: [] } as Record<Group, Player[]>;
  const byPos: Record<string, Player[]> = {};
  for (const pos of KNOWN_POS) byPos[pos] = [];
  for (const p of players) {
    if (p.overall == null) continue;
    const g = primaryGroup(p);
    if (g) byGroup[g].push(p);
    const pos = primaryPosition(p);
    if (pos && pos in byPos) byPos[pos].push(p);
  }
  for (const g of ["GK", "DEF", "MID", "FWD"] as Group[]) {
    byGroup[g].sort((a, b) => b.overall - a.overall);
  }
  for (const pos of KNOWN_POS) {
    byPos[pos].sort((a, b) => b.overall - a.overall);
  }
  return { byGroup, byPos };
}

/** Visible "star" cards are always 84+ overall — the face of the auction. */
const VISIBLE_FLOOR = 84;
/** Mystery cards can come from anywhere in the pool. */
const HIDDEN_FLOOR = 66;

function weightedPick<T>(arr: T[], weight: (t: T) => number, rng: () => number): T {
  const ws = arr.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= ws[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function gaussWeight(o: number, peak: number, sl: number, sr: number): number {
  // Two-piece Gaussian: a bell peaking at `peak`, but the low side falls off
  // steeply (sigma `sl`) so awful players are rare, while the high side falls
  // off gently (sigma `sr`) so stars stay common — Pele shows up more often
  // than a 70-rated nobody.
  const d = o - peak;
  if (d < 0) return Math.exp(-0.5 * (d / sl) ** 2);
  return Math.exp(-0.5 * (d / sr) ** 2);
}

function slotCandidates(pool: Pool, pos: Pos): Player[] {
  let cands: Player[] = [];
  for (const ppos of SLOT_POSITIONS[pos]) {
    cands = cands.concat(pool.byPos[ppos] ?? []);
  }
  if (cands.length === 0) cands = pool.byGroup[SLOT_GROUP[pos]];
  return cands;
}

function pickVisible(pool: Pool, pos: Pos, used: Set<number>): Player {
  const cands = slotCandidates(pool, pos);
  let cand = cands.filter((p) => p.overall >= VISIBLE_FLOOR && !used.has(p.id));
  if (cand.length === 0) cand = cands.filter((p) => !used.has(p.id));
  return weightedPick(cand, (p) => gaussWeight(p.overall, 84, 5, 8), Math.random);
}

function pickHidden(pool: Pool, pos: Pos, used: Set<number>, visible: Player): Player {
  const cands = slotCandidates(pool, pos);
  let cand = cands.filter(
    (p) => p.overall >= HIDDEN_FLOOR && p.id !== visible.id && !used.has(p.id)
  );
  if (cand.length === 0) cand = cands.filter((p) => p.id !== visible.id && !used.has(p.id));
  if (cand.length === 0) return visible;
  return weightedPick(cand, (p) => gaussWeight(p.overall, 84, 7, 9), Math.random);
}

export function createRounds(
  pool: Pool,
  formation: Pos[],
  used: Set<number>
): AuctionRound[] {
  return formation.map((pos) => {
    const visible = pickVisible(pool, pos, used);
    const hidden = pickHidden(pool, pos, used, visible);
    used.add(visible.id);
    used.add(hidden.id);
    return {
      pos,
      visible,
      hidden,
      status: "bidding",
      bids: [],
      winner: null,
      wonAmount: 0,
    };
  });
}

export function createGame(
  mode: Mode,
  pool: Pool,
  names: [string, string],
  formation?: Pos[],
  powers?: PowerConfig
): EngineState {
  const cfg = MODE_CONFIG[mode];
  const chosen =
    formation ??
    cfg.formations[Math.floor(Math.random() * cfg.formations.length)];
  const used = new Set<number>();
  const rounds = createRounds(pool, chosen, used);
  return {
    mode,
    budget: cfg.budget,
    formation: chosen,
    roundIdx: 0,
    rounds,
    budgets: [cfg.budget, cfg.budget],
    lastBid: 0,
    bidder: null,
    turn: Math.floor(Math.random() * 2),
    status: "open",
    phase: "round",
    squads: [[], []],
    prices: [[], []],
    logs: [{ text: `${names[0]} vs ${names[1]} — ${mode}v${mode} draft`, at: Date.now() }],
    winner: null,
    names,
    powers: powers ?? { lastBid: false, wildcard: false, noRisk: false },
    powerUsed: [
      { wildcard: false, noRisk: false },
      { wildcard: false, noRisk: false },
    ],
  };
}

/** A team's budget never drops below MIN_BID (0.5M) — only what's above the
 *  floor is spendable. So a nearly-broke team is "stuck" at 0.5M, never 0. */
function spendable(budget: number): number {
  return Math.max(0, roundHalf(budget - MIN_BID));
}

export function currentRound(s: EngineState): AuctionRound {
  return s.rounds[s.roundIdx];
}

function log(state: EngineState, text: string): void {
  state.logs.unshift({ text, at: Date.now() });
}

export function openBid(s: EngineState, amount: number): EngineState {
  const round = currentRound(s);
  if (s.status !== "open" || s.phase !== "round" || round.status !== "bidding") return s;
  if (amount < MIN_BID || amount > spendable(s.budgets[s.turn])) return s;
  const amt = roundHalf(clamp(amount, MIN_BID, spendable(s.budgets[s.turn])));
  s.lastBid = amt;
  s.bidder = s.turn;
  round.bids.push({ by: s.turn, amount: amt });
  s.turn = s.turn === 0 ? 1 : 0;
  s.status = "response";
  log(s, `${s.names[s.bidder]} opened for ${amt.toFixed(1)}M`);
  return s;
}

export function raiseBid(s: EngineState, amount: number): EngineState {
  const round = currentRound(s);
  if (s.status !== "response" || s.phase !== "round" || round.status !== "bidding") return s;
  if (s.bidder == null) return s;
  const minRaise = roundHalf(s.lastBid + BID_STEP);
  if (amount < minRaise || amount > spendable(s.budgets[s.turn])) return s;
  const amt = roundHalf(clamp(amount, minRaise, spendable(s.budgets[s.turn])));
  s.lastBid = amt;
  s.bidder = s.turn;
  round.bids.push({ by: s.turn, amount: amt });
  s.turn = s.turn === 0 ? 1 : 0;
  log(s, `${s.names[s.bidder]} raised to ${amt.toFixed(1)}M`);
  return s;
}

export function foldBid(s: EngineState): EngineState {
  const round = currentRound(s);
  if (s.status !== "response" || s.phase !== "round" || round.status !== "bidding") return s;
  if (s.bidder == null) return s;
  const winner = s.bidder;
  const amount = s.lastBid;
  round.winner = winner;
  round.wonAmount = amount;
  round.status = "reveal";
  s.status = "round_done";
  s.budgets[winner] = Math.round((s.budgets[winner] - amount) * 10) / 10;
  s.squads[winner].push(round.visible);
  s.prices[winner].push(amount);
  s.squads[winner === 0 ? 1 : 0].push(round.hidden);
  log(s, `${s.names[winner]} won ${round.visible.name} for ${amount.toFixed(1)}M`);
  // LAST BID power: backing down doesn't leave you empty-handed — you sign
  // the hidden player for the price of your own last bid of this auction.
  const folder = winner === 0 ? 1 : 0;
  let folderCost = 0;
  if (s.powers?.lastBid) {
    const mine = [...round.bids].reverse().find((b) => b.by === folder);
    if (mine && mine.amount > 0) {
      folderCost = mine.amount;
      s.budgets[folder] = Math.round((s.budgets[folder] - mine.amount) * 10) / 10;
      log(s, `💰 LAST BID — ${s.names[folder]} backs down and signs ${round.hidden.name} for ${mine.amount.toFixed(1)}M`);
    }
  }
  s.prices[folder].push(folderCost);
  return s;
}

// ---- Game Changer powers ----

/** Wildcard luck curve: the roll's bell peak scales with remaining budget —
 *  a fat wallet tilts fate toward stars, but it stays a gamble. */
const WILDCARD_PEAK_BASE = 68;
const WILDCARD_PEAK_RANGE = 26;

/** No Risk No Fun swing: replacement bell peaks ±6 overall around the sacrificed player. */
const NO_RISK_SWING = 6;

function ownedIds(s: EngineState): Set<number> {
  const ids = new Set<number>();
  for (const squad of s.squads) for (const p of squad) ids.add(p.id);
  return ids;
}

/** Silent winner refresh after endgame powers shuffle squad totals. */
function recomputeWinner(s: EngineState): void {
  const sum = (arr: Player[]) => arr.reduce((a, p) => a + p.overall, 0);
  const ta = sum(s.squads[0]);
  const tb = sum(s.squads[1]);
  if (ta > tb) s.winner = 0;
  else if (tb > ta) s.winner = 1;
  else s.winner = s.budgets[0] >= s.budgets[1] ? 0 : 1;
}

function poolCandidates(pool: Pool): Player[] {
  return (["GK", "DEF", "MID", "FWD"] as Group[]).flatMap((g) => pool.byGroup[g]);
}
void poolCandidates;

/**
 * WILDCARD (once per team, ENDGAME only): YOU pick which squad player to
 * risk. Their replacement is rolled from the same position group, with the
 * bell curve's peak scaled by leftover budget — a fat wallet tilts fate
 * toward stars, but it always stays a probability play.
 */
export function useWildcard(s: EngineState, pool: Pool, idx: number, playerId: number): boolean {
  if (!s.powers?.wildcard || !s.powerUsed || s.powerUsed[idx]?.wildcard) return false;
  if (s.phase !== "end") return false;
  const squad = s.squads[idx];
  const slot = squad.findIndex((p) => p.id === playerId);
  if (slot < 0) return false;
  const out = squad[slot];

  s.powerUsed[idx].wildcard = true;
  const frac = clamp(s.budgets[idx] / s.budget, 0, 1.2);
  const peak = clamp(WILDCARD_PEAK_BASE + WILDCARD_PEAK_RANGE * frac, 70, 94);

  const group = primaryGroup(out) ?? "MID";
  const owned = ownedIds(s);
  owned.add(out.id);
  let cands = (pool.byGroup[group] ?? []).filter((p) => !owned.has(p.id));
  if (cands.length === 0) cands = (pool.byGroup[group] ?? []).filter((p) => p.id !== out.id);
  let picked = out;
  if (cands.length > 0) {
    picked = weightedPick(cands, (p) => gaussWeight(p.overall, peak, 6, 8), Math.random);
  }
  squad[slot] = picked;
  recomputeWinner(s);
  log(
    s,
    `🎰 WILDCARD — ${s.names[idx]} risked ${out.name} (${out.overall}) on ${s.budgets[idx].toFixed(1)}M luck… rolled ${picked.name} (${picked.overall})!`
  );
  return true;
}

/** Detect which Game Changer fired between two states (for the FX overlay).
 *  Both powers are in-place swaps, so we key off the powerUsed flags and then
 *  locate the changed squad slot by player id. */
export function diffPowerFx(
  prev: EngineState,
  next: EngineState
): { type: "wildcard" | "noRisk"; idx: number; out?: Player; picked?: Player } | null {
  for (const idx of [0, 1] as const) {
    const a = prev.squads[idx];
    const b = next.squads[idx];
    const usedNext = next.powerUsed?.[idx];
    const usedPrev = prev.powerUsed?.[idx];
    if (!a || !b || !usedNext || !usedPrev) continue;
    let kind: "wildcard" | "noRisk" | null = null;
    if (usedNext.wildcard && !usedPrev.wildcard) kind = "wildcard";
    else if (usedNext.noRisk && !usedPrev.noRisk) kind = "noRisk";
    if (!kind) continue;
    const idsA = new Map(a.map((p) => [p.id, p]));
    let out: Player | undefined;
    let picked: Player | undefined;
    for (const p of a) {
      if (!b.some((q) => q.id === p.id)) out = p;
    }
    for (const p of b) {
      if (!idsA.has(p.id)) picked = p;
    }
    if (out && picked) return { type: kind, idx, out, picked };
  }
  return null;
}

/**
 * NO RISK NO FUN (once per team, ENDGAME only): feed a random signing into
 * the machine — it spits back a replacement from the same position group
 * that is randomly better… or worse.
 */
export function useNoRisk(s: EngineState, pool: Pool, idx: number): boolean {
  if (!s.powers?.noRisk || !s.powerUsed || s.powerUsed[idx]?.noRisk) return false;
  if (s.phase !== "end") return false;
  const squad = s.squads[idx];
  if (!squad || squad.length === 0) return false;

  s.powerUsed[idx].noRisk = true;
  const slot = Math.floor(Math.random() * squad.length);
  const out = squad[slot];
  const group = primaryGroup(out) ?? "MID";
  const up = Math.random() < 0.5;
  const peak = up ? out.overall + NO_RISK_SWING : out.overall - NO_RISK_SWING;

  const owned = ownedIds(s);
  owned.add(out.id);
  let cands = (pool.byGroup[group] ?? []).filter((p) => !owned.has(p.id));
  if (cands.length === 0) cands = (pool.byGroup[group] ?? []).filter((p) => p.id !== out.id);
  let picked = out;
  if (cands.length > 0) {
    picked = weightedPick(cands, (p) => gaussWeight(p.overall, peak, 4, 5), Math.random);
  }
  squad[slot] = picked;
  recomputeWinner(s);

  const verdict =
    picked.overall > out.overall ? "UPGRADE" : picked.overall < out.overall ? "DOWNGRADE" : "SWAP";
  log(
    s,
    `🃏 NO RISK NO FUN — ${s.names[idx]} fed ${out.name} (${out.overall}) into the machine… ${verdict}: ${picked.name} (${picked.overall})!`
  );
  return true;
}

/** Choose who opens the round — prefer a team that can afford the minimum
 *  opening bid, so a team stuck at the 0.5M floor never deadlocks the game. */
function pickOpener(s: EngineState): number {
  const first = Math.floor(Math.random() * 2);
  if (spendable(s.budgets[first]) >= MIN_BID) return first;
  const other = first === 0 ? 1 : 0;
  if (spendable(s.budgets[other]) >= MIN_BID) return other;
  return first;
}

export function nextRound(s: EngineState): EngineState {
  if (s.phase === "end") return s;
  // Only advance from a finished round — a double-tap on "Continue"/"Next"
  // must never skip a round that is still being bid on.
  const done = s.rounds[s.roundIdx];
  if (!done || done.status !== "reveal" || s.status !== "round_done") return s;
  s.roundIdx += 1;
  if (s.roundIdx >= s.rounds.length) {
    s.phase = "end";
    s.status = "round_done";
    computeWinner(s);
    return s;
  }
  const round = currentRound(s);
  round.status = "bidding";
  s.lastBid = 0;
  s.bidder = null;
  s.status = "open";
  s.turn = pickOpener(s);
  return s;
}

function computeWinner(s: EngineState): void {
  const [a, b] = s.squads;
  const sum = (arr: Player[]) => arr.reduce((acc, p) => acc + p.overall, 0);
  const ta = sum(a);
  const tb = sum(b);
  let winner: number | null = null;
  if (ta > tb) winner = 0;
  else if (tb > ta) winner = 1;
  else {
    winner = s.budgets[0] >= s.budgets[1] ? 0 : 1;
  }
  s.winner = winner;
  log(s, `Final: ${s.names[0]} ${ta} — ${tb} ${s.names[1]}`);
}

// ---- AI ----

export function aiValue(p: Player, mode: Mode): number {
  const scale = mode === 11 ? 0.75 : 1;
  return (p.overall - 78) * 2.6 * scale + 4;
}

function aiJitter(): number {
  return (Math.random() - 0.5) * 4;
}

export function aiAct(s: EngineState, pool: Pool, idx: number): string | null {
  const round = currentRound(s);
  const cap = spendable(s.budgets[idx]);
  const value = aiValue(round.visible, s.mode);
  const maxBid = roundHalf(Math.max(MIN_BID, Math.min(value * 0.92 + aiJitter(), cap)));

  if (s.status === "open" && s.turn === idx) {
    if (cap < MIN_BID) return null;
    const target = roundHalf(clamp(maxBid * 0.62 + aiJitter(), MIN_BID, cap));
    const amt = roundHalf(clamp(target, MIN_BID, cap));
    if (amt < MIN_BID) return null;
    openBid(s, amt);
    return "bid";
  }

  if (s.status === "response" && s.turn === idx) {
    const minRaise = roundHalf(s.lastBid + BID_STEP);
    if (minRaise > cap) {
      foldBid(s);
      return "fold";
    }
    if (minRaise > maxBid) {
      foldBid(s);
      return "fold";
    }
    const step = roundHalf((0.5 + Math.random() * 2.5));
    const amt = roundHalf(Math.min(maxBid, s.lastBid + step));
    if (amt < minRaise || amt > cap) {
      foldBid(s);
      return "fold";
    }
    raiseBid(s, amt);
    return "bid";
  }
  return null;
}

export function canRespond(s: EngineState, idx: number): boolean {
  if (s.phase !== "round" || s.status !== "response") return false;
  if (s.turn !== idx) return false;
  const round = currentRound(s);
  if (round.status !== "bidding") return false;
  const minRaise = roundHalf(s.lastBid + BID_STEP);
  return spendable(s.budgets[idx]) >= minRaise;
}
