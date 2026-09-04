export type MatchEventType =
  | "goal"
  | "chance"
  | "saved"
  | "woodwork"
  | "yellow"
  | "red"
  | "var"
  | "disallowed"
  | "penalty"
  | "penalty_missed"
  | "corner"
  | "foul"
  | "tactical"
  | "kickoff"
  | "half_time"
  | "full_time";

export interface MatchEvent {
  minute: number;
  team: 0 | 1 | null;
  type: MatchEventType;
  text: string;
  player: string | null;
  score: [number, number];
}

export interface TeamStats {
  name: string;
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  passes: number;
  passAccuracy: number;
}

export interface MatchTeam {
  name: string;
  formation: string;
  rating: number;
}

export interface MatchData {
  teams: MatchTeam[];
  events: MatchEvent[];
  stats: TeamStats[];
  motm: { player: string; team: 0 | 1; rating: number; note: string };
  summary: string;
  finalScore: [number, number];
  winner: 0 | 1 | null;
}

const ALLOWED = new Set<MatchEventType>([
  "goal", "chance", "saved", "woodwork", "yellow", "red",
  "var", "disallowed", "penalty", "penalty_missed", "corner", "foul",
  "tactical", "kickoff", "half_time", "full_time",
]);

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function normalizeMatch(raw: unknown): MatchData {
  const r = (raw ?? {}) as Record<string, any>;
  const teams = Array.isArray(r.teams) ? r.teams.slice(0, 2) : [];
  while (teams.length < 2) teams.push({ name: "Team", formation: "?", rating: 0 });

  const eventsRaw = Array.isArray(r.events) ? r.events : [];
  const events: MatchEvent[] = eventsRaw.map((e: any, i: number) => {
    let team = e?.team;
    if (team !== 0 && team !== 1) team = null;
    let type = String(e?.type ?? "chance").toLowerCase() as MatchEventType;
    if (!ALLOWED.has(type)) type = "chance";
    return {
      minute: Math.min(90, Math.max(1, Math.round(num(e?.minute, i + 1)))),
      team,
      type,
      text: String(e?.text ?? "").trim(),
      player: e?.player ? String(e.player) : null,
      score: [0, 0],
    };
  });
  events.sort((a, b) => a.minute - b.minute);

  const goals: [number, number] = [0, 0];
  for (const e of events) {
    if (e.type === "goal" && e.team !== null) {
      goals[e.team] += 1;
    }
    e.score = [goals[0], goals[1]];
  }

  if (!events.some((e) => e.type === "half_time")) {
    events.push({ minute: 45, team: null, type: "half_time", text: "Half-time.", player: null, score: [goals[0], goals[1]] });
  }
  if (!events.some((e) => e.type === "full_time")) {
    events.push({ minute: 90, team: null, type: "full_time", text: "Full-time!", player: null, score: [goals[0], goals[1]] });
  }
  events.sort((a, b) => a.minute - b.minute);

  const statsRaw = Array.isArray(r.stats) ? r.stats : [];
  const stats: TeamStats[] = statsRaw.slice(0, 2).map((s: any, i: number) => ({
    name: String(s?.name ?? teams[i]?.name ?? "Team"),
    possession: Math.max(0, Math.min(100, Math.round(num(s?.possession)))),
    shots: Math.max(0, Math.round(num(s?.shots))),
    shotsOnTarget: Math.max(0, Math.round(num(s?.shotsOnTarget))),
    corners: Math.max(0, Math.round(num(s?.corners))),
    fouls: Math.max(0, Math.round(num(s?.fouls))),
    yellowCards: Math.max(0, Math.round(num(s?.yellowCards))),
    redCards: Math.max(0, Math.round(num(s?.redCards))),
    passes: Math.max(0, Math.round(num(s?.passes))),
    passAccuracy: Math.min(95, Math.max(70, Math.round(num(s?.passAccuracy, 85)))),
  }));
  while (stats.length < 2) {
    stats.push({ name: teams[stats.length].name, possession: 50, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0, passes: 0, passAccuracy: 85 });
  }
  if (stats[0].possession + stats[1].possession !== 100) {
    stats[0].possession = 100 - stats[1].possession;
    if (stats[0].possession < 0) {
      stats[1].possession = 100;
      stats[0].possession = 0;
    }
  }
  for (const s of stats) s.shotsOnTarget = Math.min(s.shots, s.shotsOnTarget);

  const motmRaw = (r.motm ?? {}) as Record<string, any>;
  const motmTeam: 0 | 1 = motmRaw.team === 1 ? 1 : 0;
  const motm = {
    player: String(motmRaw.player ?? teams[motmTeam].name ?? "Star Player"),
    team: motmTeam,
    rating: Math.round(num(motmRaw.rating, 7) * 10) / 10,
    note: String(motmRaw.note ?? ""),
  };

  const finalScore: [number, number] = [goals[0], goals[1]];
  const winner = finalScore[0] === finalScore[1] ? null : finalScore[0] > finalScore[1] ? 0 : 1;

  return {
    teams: teams.map((t: any) => ({ name: String(t.name ?? "Team"), formation: String(t.formation ?? "?"), rating: Math.round(num(t.rating) * 10) / 10 })),
    events,
    stats,
    motm,
    summary: String(r.summary ?? ""),
    finalScore,
    winner,
  };
}

export const EVENT_META: Record<MatchEventType, { icon: string; label: string; tone: string }> = {
  goal: { icon: "⚽", label: "GOAL", tone: "gold" },
  chance: { icon: "🎯", label: "CHANCE", tone: "white" },
  saved: { icon: "🧤", label: "SAVE", tone: "cyan" },
  woodwork: { icon: "🪵", label: "WOODWORK", tone: "white" },
  yellow: { icon: "🟨", label: "YELLOW", tone: "yellow" },
  red: { icon: "🟥", label: "RED CARD", tone: "red" },
  var: { icon: "🖥️", label: "VAR", tone: "cyan" },
  disallowed: { icon: "🚫", label: "DISALLOWED", tone: "red" },
  penalty: { icon: "🔴", label: "PENALTY", tone: "gold" },
  penalty_missed: { icon: "😬", label: "PEN MISSED", tone: "red" },
  corner: { icon: "🚩", label: "CORNER", tone: "white" },
  foul: { icon: "🟡", label: "FOUL", tone: "yellow" },
  tactical: { icon: "📋", label: "TACTICS", tone: "cyan" },
  kickoff: { icon: "🏟️", label: "KICK OFF", tone: "white" },
  half_time: { icon: "⏸️", label: "HALF-TIME", tone: "cyan" },
  full_time: { icon: "🏁", label: "FULL-TIME", tone: "gold" },
};
