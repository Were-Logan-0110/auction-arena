import { create } from "zustand";
import type { EngineState, Mode, Player, Pos, PowerConfig, PowerId } from "../lib/types";
import {
  aiAct,
  buildPool,
  createGame,
  diffPowerFx,
  foldBid,
  nextRound,
  openBid,
  raiseBid,
  useNoRisk,
  useWildcard,
  type Pool,
} from "../lib/engine";
import type { PowerFXData } from "../components/PowerFX";
import { socket, type JoinedResult, type RoomCreated } from "../lib/socket";

export type PlayType = "ai" | "hotseat" | "online";

type Screen = "home" | "lobby" | "game" | "match";

interface GameStore {
  screen: Screen;
  mode: Mode;
  playType: PlayType;
  pool: Pool | null;
  players: Player[];
  state: EngineState | null;
  myIdx: number | null;
  roomCode: string | null;
  aiIdx: number | null;
  error: string | null;
  powers: PowerConfig;
  powerFx: PowerFXData | null;

  setMode: (m: Mode) => void;
  setPlayType: (p: PlayType) => void;
  togglePower: (id: PowerId) => void;
  clearError: () => void;
  clearPowerFx: () => void;

  startLocal: (mode: Mode, playType: PlayType, names: [string, string], formation?: Pos[]) => void;
  localBid: (amount: number) => void;
  localFold: () => void;
  localNext: () => void;
  localWildcard: (idx: number, playerId: number) => void;
  localNoRisk: (idx: number) => void;

  onlineCreate: (mode: Mode, name: string, formation?: Pos[]) => void;
  onlineJoin: (code: string, name: string) => void;
  onlineStart: () => void;
  onlineBid: (amount: number) => void;
  onlineFold: () => void;
  onlineNext: () => void;
  onlineWildcard: (playerId: number) => void;
  onlineNoRisk: () => void;
  onlineRematch: () => void;
  leaveRoom: () => void;

  applyState: (s: EngineState) => void;
  loadPool: () => Promise<void>;
  startMatch: () => void;
}

let aiTimer: ReturnType<typeof setTimeout> | null = null;

const ROOM_KEY = "aa_room";

function loadSavedRoom(): { code: string; idx: number } | null {
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    return raw ? (JSON.parse(raw) as { code: string; idx: number }) : null;
  } catch {
    return null;
  }
}

function saveRoom(code: string, idx: number) {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify({ code, idx }));
  } catch {
    /* ignore */
  }
}

function clearRoom() {
  try {
    localStorage.removeItem(ROOM_KEY);
  } catch {
    /* ignore */
  }
}

function openOrRaise(s: EngineState, amount: number) {
  if (s.status === "open") openBid(s, amount);
  else if (s.status === "response") raiseBid(s, amount);
}

/** Deep-ish clone of the mutable engine arrays so power mutations don't alias
 *  the previous state (breaks diffPowerFx detection and React rendering). */
function cloneForPower(s: EngineState): EngineState {
  return {
    ...s,
    squads: [s.squads[0].slice(), s.squads[1].slice()],
    prices: s.prices ? [s.prices[0].slice(), s.prices[1].slice()] : [[], []],
    budgets: [...s.budgets] as [number, number],
    powerUsed: s.powerUsed?.map((u) => ({ ...u })) as EngineState["powerUsed"],
  };
}

function scheduleAI(get: () => GameStore, set: (p: Partial<GameStore>) => void) {
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    const { pool, state, aiIdx, playType } = get();
    if (!pool || !state || aiIdx == null || playType !== "ai" || state.phase !== "round") return;
    const action = aiAct(state, pool, aiIdx);
    if (action) {
      set({ state: { ...state } });
      scheduleAI(get, set);
    }
  }, 1100);
}

export const useGame = create<GameStore>((set, get) => ({
  screen: "home",
  mode: 5,
  playType: "ai",
  pool: null,
  players: [],
  state: null,
  myIdx: loadSavedRoom()?.idx ?? null,
  roomCode: loadSavedRoom()?.code ?? null,
  aiIdx: null,
  error: null,
  powers: { lastBid: false, wildcard: false, noRisk: false },
  powerFx: null,

  setMode: (m) => set({ mode: m }),
  setPlayType: (p) => set({ playType: p }),
  togglePower: (id) => set((st) => ({ powers: { ...st.powers, [id]: !st.powers[id] } })),
  clearError: () => set({ error: null }),
  clearPowerFx: () => set({ powerFx: null }),

  startLocal: (mode, playType, names, formation) => {
    const pool = get().pool;
    if (!pool) return;
    const state = { ...createGame(mode, pool, names, formation, get().powers) };
    const aiIdx = playType === "ai" ? 1 : null;
    set({ state, myIdx: null, aiIdx, screen: "game", playType, error: null, powerFx: null });
    if (aiIdx != null && state.turn === aiIdx) scheduleAI(get, set);
  },

  localBid: (amount) => {
    const st = get().state;
    if (!st) return;
    const next = { ...st };
    openOrRaise(next, amount);
    set({ state: next });
    scheduleAI(get, set);
  },

  localFold: () => {
    const st = get().state;
    if (!st) return;
    const next = { ...st };
    foldBid(next);
    set({ state: next });
  },

  localNext: () => {
    const st = get().state;
    if (!st) return;
    const next = { ...st };
    nextRound(next);
    set({ state: next });
    scheduleAI(get, set);
  },

  // Powers must mutate a properly cloned state — a shallow copy shares the
  // squads/powerUsed references with the previous state, which both corrupts
  // undo-free diffing (diffPowerFx sees "no change") and aliases React state.
  localWildcard: (idx, playerId) => {
    const { state, pool } = get();
    if (!state || !pool) return;
    const next = cloneForPower(state);
    if (useWildcard(next, pool, idx, playerId)) {
      set({ state: next, powerFx: diffPowerFx(state, next) ?? null });
      scheduleAI(get, set);
    }
  },

  localNoRisk: (idx) => {
    const { state, pool } = get();
    if (!state || !pool) return;
    const next = cloneForPower(state);
    if (useNoRisk(next, pool, idx)) {
      set({ state: next, powerFx: diffPowerFx(state, next) ?? null });
      scheduleAI(get, set);
    }
  },

  onlineCreate: (mode, name, formation) => {
    clearRoom();
    useGame.setState({ roomCode: null, myIdx: null });
    socket.connect();
    socket.emit("create", { mode, name, formation, powers: get().powers });
  },

  onlineJoin: (code, name) => {
    clearRoom();
    useGame.setState({ roomCode: null, myIdx: null });
    socket.connect();
    socket.emit("join", { code: code.toUpperCase(), name });
  },

  onlineStart: () => socket.emit("start"),
  onlineBid: (amount) => socket.emit("bid", { amount }),
  onlineFold: () => socket.emit("fold"),
  onlineNext: () => socket.emit("next"),
  onlineWildcard: (playerId) => socket.emit("wildcard", { playerId }),
  onlineNoRisk: () => socket.emit("no_risk"),
  onlineRematch: () => socket.emit("rematch"),

  leaveRoom: () => {
    socket.disconnect();
    clearRoom();
    set({ screen: "home", state: null, roomCode: null, myIdx: null, error: null, powerFx: null });
  },

  applyState: (s) => {
    const prev = get().state;
    // Powers only exist in the endgame phase — any non-end state means a fresh
    // game, so drop any stale overlay.
    if (s.phase !== "end") {
      set({ state: s, powerFx: null });
      return;
    }
    const fx = prev ? diffPowerFx(prev, s) : null;
    set(fx ? { state: s, powerFx: fx } : { state: s });
  },

  loadPool: async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}players.json`);
      const data = (await res.json()) as Player[];
      const pool = buildPool(data);
      set({ players: data, pool });
    } catch (e) {
      set({ error: "Failed to load player pool: " + String(e) });
    }
  },

  startMatch: () => set({ screen: "match" }),
}));

// ---- socket wiring ----
socket.on("created", (msg: RoomCreated) => {
  saveRoom(msg.code, msg.idx);
  useGame.setState({
    screen: "lobby",
    roomCode: msg.code,
    myIdx: msg.idx,
    powers: msg.powers ?? useGame.getState().powers,
  });
});
socket.on("joined", (msg: JoinedResult) => {
  if (!msg.ok) {
    useGame.setState({ error: msg.error ?? "Could not join room" });
    return;
  }
  saveRoom(msg.code!, msg.idx!);
  useGame.setState({
    screen: "lobby",
    roomCode: msg.code,
    myIdx: msg.idx,
    error: null,
    powers: msg.powers ?? { lastBid: false, wildcard: false, noRisk: false },
  });
});
socket.on("state", (s: EngineState) => {
  useGame.setState({ screen: "game", error: null });
  // Route through applyState so power FX diffs are detected on server pushes.
  useGame.getState().applyState(s);
});
socket.on("opponent_left", () => {
  useGame.setState({ error: "Opponent left the game" });
});

// Reconnect / page-reload rejoin: the room is persisted server-side (sqlite),
// so after a dropped connection or server restart we re-attach and get the
// latest state pushed back.
socket.on("connect", () => {
  const { roomCode, myIdx } = useGame.getState();
  if (roomCode != null && myIdx != null) {
    socket.emit("rejoin", { code: roomCode, idx: myIdx });
  }
});
socket.on("rejoined", (msg: JoinedResult) => {
  if (!msg.ok) {
    clearRoom();
    useGame.setState({ error: msg.error ?? "Room no longer exists", roomCode: null, myIdx: null, screen: "home" });
    return;
  }
  useGame.setState({ screen: "lobby", roomCode: msg.code ?? null, myIdx: (msg.idx ?? 0) as 0 | 1, error: null });
});

// Reconnect automatically if we have a saved room (e.g. after a page refresh).
if (loadSavedRoom()) socket.connect();
