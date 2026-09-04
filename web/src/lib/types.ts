export type Pos = "GK" | "CB" | "LB" | "RB" | "CM" | "LW" | "RW" | "CF";

export type Mode = 5 | 11;

export interface Player {
  id: number;
  name: string;
  full_name: string;
  positions: string;
  overall: number;
  club: string | null;
  nation: string | null;
  img: string | null;
  source: "FC26" | "icons" | "sofifa";
  legend: boolean;
}

export interface Bid {
  by: number;
  amount: number;
}

export interface AuctionRound {
  pos: Pos;
  visible: Player;
  hidden: Player;
  status: "bidding" | "reveal";
  bids: Bid[];
  winner: number | null;
  wonAmount: number;
  /** How the round was decided — "wildcard" skips the bidding fight entirely. */
  via?: "bid" | "wildcard";
}

export type RoundStatus = "open" | "response" | "round_done";

/** The three optional Game Changer powers a host can switch on before a draft. */
export type PowerId = "lastBid" | "wildcard" | "noRisk";

export interface PowerConfig {
  lastBid: boolean;
  wildcard: boolean;
  noRisk: boolean;
}

/** Per-team one-shot usage flags (lastBid is passive, never consumed). */
export interface TeamPowerUsed {
  wildcard: boolean;
  noRisk: boolean;
}

export const DEFAULT_POWERS: PowerConfig = {
  lastBid: false,
  wildcard: false,
  noRisk: false,
};

export const POWER_META: Record<
  PowerId,
  { icon: string; title: string; desc: string; ring: string; glow: string }
> = {
  lastBid: {
    icon: "💰",
    title: "Last Bid",
    desc: "Back down & sign the mystery card for your last bid",
    ring: "border-neon-gold/70",
    glow: "shadow-glow-gold",
  },
  wildcard: {
    icon: "🎰",
    title: "Wildcard",
    desc: "Endgame: pick one of your players to risk — leftover budget luck rolls their replacement",
    ring: "border-neon-pink/70",
    glow: "shadow-glow-pink",
  },
  noRisk: {
    icon: "🃏",
    title: "No Risk No Fun",
    desc: "Endgame: sacrifice a random signing for a better… or worse one",
    ring: "border-red-400/70",
    glow: "shadow-glow-red",
  },
};

export interface LogEntry {
  text: string;
  at: number;
}

export interface EngineState {
  mode: Mode;
  budget: number;
  formation: Pos[];
  roundIdx: number;
  rounds: AuctionRound[];
  budgets: [number, number];
  lastBid: number;
  bidder: number | null;
  turn: number;
  status: RoundStatus;
  phase: "round" | "end";
  squads: [Player[], Player[]];
  /** Price paid per squad player, parallel to squads (0 = free signing). */
  prices: [number[], number[]];
  logs: LogEntry[];
  winner: number | null;
  names: [string, string];
  powers?: PowerConfig;
  powerUsed?: [TeamPowerUsed, TeamPowerUsed];
}

export const BID_STEP = 0.5;
export const MIN_BID = 0.5;

export const MODE_CONFIG: Record<Mode, { budget: number; formations: Pos[][] }> = {
  5: {
    budget: 100,
    formations: [
      ["GK", "CB", "CM", "CF", "CF"],
      ["GK", "CB", "CM", "CM", "CF"],
      ["GK", "CB", "CB", "CM", "CF"],
    ],
  },
  11: {
    budget: 200,
    formations: [
      ["GK", "CB", "CB", "LB", "RB", "CM", "CM", "CM", "LW", "RW", "CF"],
    ],
  },
};

export const POS_LABEL: Record<Pos, string> = {
  GK: "Goalkeeper",
  CB: "Centre Back",
  LB: "Left Back",
  RB: "Right Back",
  CM: "Central Mid",
  LW: "Left Wing",
  RW: "Right Wing",
  CF: "Centre Forward",
};

const FULL_POS_LABEL: Record<string, string> = {
  ...POS_LABEL,
  RWB: "Right Wing Back",
  LWB: "Left Wing Back",
  CDM: "Defensive Mid",
  CAM: "Attacking Mid",
  LM: "Left Mid",
  RM: "Right Mid",
  ST: "Striker",
  LF: "Left Forward",
  RF: "Right Forward",
};

/** Real preferred position of a card, as a human label. Matches the draft
 *  engine's rule: wingers/forwards (LW/RW/LF/RF/CF/ST) win over midfield tags
 *  like LM/RM/CAM; otherwise the first-listed position wins. */
const FORWARD_TOKENS = new Set(["ST", "CF", "LW", "RW", "LF", "RF"]);
export function primaryPosLabel(p: Player): string {
  const toks = p.positions
    .split(/[|,/\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (toks.length === 0) return "Any";
  if (toks[0] === "GK") return FULL_POS_LABEL["GK"] ?? "GK";
  const fwd = toks.find((t) => FORWARD_TOKENS.has(t));
  const code = fwd ?? toks[0];
  return FULL_POS_LABEL[code] ?? code;
}
