import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store/useGame";
import { cn, proxiedImg, smallImg } from "../lib/utils";
import { sound } from "../lib/sound";
import type { Player, Pos } from "../lib/types";
import {
  EVENT_META,
  normalizeMatch,
  type MatchData,
  type MatchEvent,
} from "../lib/matchforge";
import { generateMatch, hasConfiguredKey } from "../lib/matchSim";
import { getSettings } from "../lib/settings";
import { Confetti } from "../components/Confetti";

const DURATIONS = [45, 90, 150];
const SPEEDS = [1, 2, 4, 8];

export default function MatchScreen() {
  const state = useGame((s) => s.state);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!state) {
        setLoading(false);
        return;
      }
      try {
        const settings = getSettings();
        if (hasConfiguredKey(settings)) {
          // Offline-first: generate straight from this device via the user's
          // configured API key (Gemini by default, OpenRouter optional).
          const match = await generateMatch(
            state.mode,
            state.names,
            state.squads as [Player[], Player[]],
            state.formation,
            settings
          );
          if (!cancelled) setMatch(match);
        } else {
          // No key configured -> fall back to the hosted server's /api/match-sim
          // (PythonAnywhere / local dev), which has its own key in .env.
          const res = await fetch("/api/match-sim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              names: state.names,
              squads: state.squads,
              mode: state.mode,
              formations: state.formation,
            }),
          });
          const data = await res.json();
          if (cancelled) return;
          if (!data.ok) throw new Error(data.error || "Match generation failed");
          setMatch(normalizeMatch(data.match));
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <MatchLoading />;
  if (error || !match || !state)
    return (
      <MatchError
        error={error ?? "No match data"}
        onBack={() => useGame.getState().startMatch()}
        onHome={() => useGame.getState().leaveRoom()}
      />
    );

  return (
    <MatchSim
      key={match.summary}
      match={match}
      mode={state.mode}
      squads={state.squads}
      formation={state.formation}
    />
  );
}

/* ---------------- Loading / Error ---------------- */

function MatchLoading() {
  const lines = [
    "Tuning the floodlights…",
    "Analyzing squad chemistry…",
    "Coach whispering tactics…",
    "AI referee polishing the whistle…",
    "Simulating 90 minutes…",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, lines.length - 1)), 1400);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="bg-arena flex min-h-screen flex-col items-center justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
        className="h-16 w-16 rounded-full border-4 border-neon-green/20 border-t-neon-green"
      />
      <div className="mt-6 font-display text-2xl font-bold uppercase tracking-widest text-white">
        MatchForge
      </div>
      <div className="mt-2 animate-pulse text-sm text-white/50">{lines[i]}</div>
    </div>
  );
}

function MatchError({ error, onBack, onHome }: { error: string; onBack: () => void; onHome: () => void }) {
  return (
    <div className="bg-arena flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="glass max-w-md rounded-3xl p-8">
        <div className="text-5xl">🏟️</div>
        <h1 className="mt-4 font-display text-2xl font-extrabold uppercase text-white">
          Couldn't build the match
        </h1>
        <p className="mt-2 break-words text-sm text-red-300">{error}</p>
        <p className="mt-2 text-xs text-white/40">
          Make sure the online server is running (python server.py) and try again.
        </p>
        <button onClick={onBack} className="btn-primary mt-6 w-full">
          Try again
        </button>
        <button onClick={onHome} className="btn-secondary mt-3 w-full">
          Home
        </button>
      </div>
    </div>
  );
}

/* ---------------- Main sim ---------------- */

interface SimProps {
  match: MatchData;
  mode: 5 | 11;
  squads: Player[][];
  formation: Pos[];
}

function MatchSim({ match, mode, squads, formation }: SimProps) {
  const leaveRoom = useGame((s) => s.leaveRoom);
  const [kicked, setKicked] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [durationSec, setDurationSec] = useState(90);
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [overlay, setOverlay] = useState<{ kind: "goal" | "red"; team: 0 | 1 | null; player: string | null } | null>(null);
  const [htShow, setHtShow] = useState(false);
  const [done, setDone] = useState(false);
  const [showFulltime, setShowFulltime] = useState(false);

  const idxRef = useRef(0);
  const htShownRef = useRef(false);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef(1);

  const score = useMemo<[number, number]>(() => {
    const s: [number, number] = [0, 0];
    for (const e of feed) if (e.type === "goal" && e.team !== null) s[e.team]++;
    return s;
  }, [feed]);

  const accum = useMemo(() => {
    const a = { shots: [0, 0], sot: [0, 0], corn: [0, 0], foul: [0, 0], yc: [0, 0], rc: [0, 0] };
    for (const e of feed) {
      if (e.team === null) continue;
      const t = e.team;
      switch (e.type) {
        case "goal":
        case "saved":
        case "woodwork":
        case "penalty":
          a.shots[t]++;
          a.sot[t]++;
          break;
        case "chance":
        case "penalty_missed":
          a.shots[t]++;
          break;
        case "corner":
          a.corn[t]++;
          break;
        case "foul":
          a.foul[t]++;
          break;
        case "yellow":
          a.yc[t]++;
          break;
        case "red":
          a.rc[t]++;
          break;
      }
    }
    return a;
  }, [feed]);

  const showOverlay = useCallback((kind: "goal" | "red", team: 0 | 1 | null, player: string | null) => {
    setOverlay({ kind, team, player });
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlay(null), kind === "goal" ? 2400 : 2200);
  }, []);

  const applyEvent = useCallback(
    (ev: MatchEvent) => {
      if (ev.type === "goal") sound.goal();
      if (ev.type === "half_time" || ev.type === "full_time") sound.whistle();
      if (ev.type === "goal" || ev.type === "red") {
        showOverlay(ev.type === "goal" ? "goal" : "red", ev.team, ev.player);
      }
      setFeed((f) => [...f, ev]);
      if (ev.type === "half_time" && !htShownRef.current) {
        htShownRef.current = true;
        setHtShow(true);
        setTimeout(() => setHtShow(false), 2800);
      }
    },
    [showOverlay]
  );

  // kick-off countdown — the match starts itself, no click required
  useEffect(() => {
    if (kicked) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setKicked(true);
          return 0;
        }
        return c - 1;
      });
    }, 900);
    return () => clearInterval(id);
  }, [kicked]);

  useEffect(() => {
    if (!kicked) return;
    sound.whistle();
    sound.crowd();
  }, [kicked]);

  // match clock — advances 90 game-minutes over `durationSec` real seconds
  useEffect(() => {
    if (!kicked || done || htShow) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000); // real seconds elapsed
      last = now;
      setMinute((m) => Math.min(90, m + (dt * speedRef.current * 90) / durationSec));
    }, 50);
    return () => clearInterval(id);
  }, [kicked, done, htShow, durationSec]);

  // fire events that are due at the current minute
  useEffect(() => {
    while (idxRef.current < match.events.length) {
      const ev = match.events[idxRef.current];
      if (ev.minute > Math.floor(minute)) break;
      idxRef.current += 1;
      applyEvent(ev);
    }
  }, [minute, match.events, applyEvent]);

  // full-time
  useEffect(() => {
    if (kicked && minute >= 90 && idxRef.current >= match.events.length) {
      setOverlay(null);
      setHtShow(false);
      setDone(true);
    }
  }, [kicked, minute, match.events.length]);

  const changeSpeed = (s: number) => {
    speedRef.current = s;
    setSpeed(s);
  };

  const skip = useCallback(() => {
    setMinute(90);
  }, []);

  const minuteInt = Math.floor(minute);
  const half = minuteInt < 45 ? 1 : 2;
  const poss0 = Math.round(50 + (match.stats[0].possession - 50) * Math.min(1, minute / 90));
  const poss1 = 100 - poss0;
  const progress = Math.min(100, (minute / 90) * 100);
  const playing = kicked && !done;
  const shots = accum.shots;
  const sot = accum.sot;

  return (
    <div className="bg-stadium relative min-h-screen overflow-hidden text-white">
      {/* crowd dots */}
      <div className="crowd pointer-events-none absolute inset-0" />

      {/* kick-off splash */}
      <AnimatePresence>
        {!kicked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -60 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-2xl"
            >
              <div className="text-center">
                <div className="font-display text-xs font-bold uppercase tracking-[0.5em] text-neon-cyan text-glow-cyan">
                  {mode}v{mode} · MatchForge
                </div>
                <h1 className="mt-2 font-display text-5xl font-extrabold uppercase text-white sm:text-6xl">
                  Kick <span className="text-neon-green text-glow-green">Off</span>
                </h1>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                {[0, 1].map((i) => (
                  <div key={i} className="glass rounded-2xl p-4 text-center">
                    <div className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 font-display text-2xl font-extrabold", i === 0 ? "border-neon-green bg-neon-green/20 text-neon-green" : "border-neon-cyan bg-neon-cyan/20 text-neon-cyan")}>
                      {match.teams[i].name[0] ?? "?"}
                    </div>
                    <div className="mt-2 truncate font-display text-xl font-bold uppercase text-white">
                      {match.teams[i].name}
                    </div>
                    <div className="text-xs text-white/50">
                      {match.teams[i].formation} · OVR {match.teams[i].rating.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="glass mt-6 rounded-2xl p-4">
                <div className="mb-3 text-center font-display text-xs font-bold uppercase tracking-[0.3em] text-white/50">
                  Match length
                </div>
                <div className="flex justify-center gap-3">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDurationSec(d)}
                      className={cn(
                        "rounded-xl border px-5 py-3 font-display text-lg font-bold transition",
                        durationSec === d
                          ? "border-neon-gold/70 bg-neon-gold/15 text-neon-gold shadow-glow-gold"
                          : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                      )}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-white/40">
                  The full 90 minutes play out automatically — speed can be changed live.
                </p>
              </div>

              <button onClick={() => setKicked(true)} className="btn-primary mt-6 w-full py-4 text-2xl">
                {countdown > 0 ? `Kick Off in ${countdown}…` : "▶ Kick Off"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* main layout */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-3 py-3 sm:px-5">
        {/* scoreboard */}
        <Scoreboard
          names={match.teams.map((t) => t.name)}
          score={score}
          minute={minuteInt}
          half={half}
          playing={playing}
          progress={progress}
        />

        {/* live stat row */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Possession" a={poss0} b={poss1} team0={0} pct />
          <StatCard label="Shots" a={shots[0]} b={shots[1]} team0={0} max={Math.max(1, shots[0] + shots[1])} />
          <StatCard label="On target" a={sot[0]} b={sot[1]} team0={0} max={Math.max(1, sot[0] + sot[1])} />
          <StatCard label="Corners" a={accum.corn[0]} b={accum.corn[1]} team0={0} max={Math.max(1, accum.corn[0] + accum.corn[1])} />
        </div>

        <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_320px] lg:grid-rows-[minmax(0,1fr)]">
          {/* timeline / lineups tabs (the main space) */}
          <SidePanel match={match} feed={feed} score={score} squads={squads} formation={formation} minute={minuteInt} />
          {/* live moment strip */}
          <PitchView match={match} minute={minute} feed={feed} score={score} done={done} />
        </div>

        {/* controls */}
        <Controls
          playing={playing}
          done={done}
          speed={speed}
          minute={minuteInt}
          onSpeed={changeSpeed}
          onSkip={skip}
          onContinue={() => setShowFulltime(true)}
          onHome={leaveRoom}
        />
      </div>

      {/* goal / red overlays */}
      <AnimatePresence>
        {overlay && (
          <motion.div
            key={overlay.kind + overlay.player}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.3 }}
            className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
          >
            <div className={cn("text-center", overlay.kind === "goal" ? "text-neon-gold" : "text-red-500")}>
              {overlay.kind === "goal" && <Confetti count={50} />}
              <motion.div
                initial={{ y: 40, scale: 0.6 }}
                animate={{ y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 14 }}
                className="text-8xl font-display font-extrabold uppercase text-glow-gold sm:text-9xl"
              >
                {overlay.kind === "goal" ? "Goal!" : "Red Card"}
              </motion.div>
              {overlay.player && (
                <div className="mt-2 font-display text-3xl font-bold text-white drop-shadow-lg">
                  {overlay.player}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* half-time overlay */}
      <AnimatePresence>
        {htShow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md"
          >
            <div className="font-display text-6xl font-extrabold uppercase tracking-widest text-neon-cyan text-glow-cyan sm:text-7xl">
              Half-time
            </div>
            <div className="mt-4 font-display text-5xl font-extrabold text-white">
              {score[0]} <span className="text-white/30">—</span> {score[1]}
            </div>
            <div className="mt-2 text-sm text-white/50">The managers are adjusting…</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* full-time overlay (opened via Continue) */}
      <AnimatePresence>
        {showFulltime && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 overflow-y-auto bg-black/90 backdrop-blur-md"
          >
            <button
              onClick={() => setShowFulltime(false)}
              className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/60 font-display text-lg font-bold text-white/70 transition hover:bg-white/10"
            >
              ✕
            </button>
            {match.winner !== null && <Confetti count={120} />}
            <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center p-6 text-center">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
                <div className="font-display text-sm font-bold uppercase tracking-[0.4em] text-white/50">
                  Full-time
                </div>
                <div className={cn("mt-2 font-display text-7xl font-extrabold text-white sm:text-8xl", match.winner !== null && (match.winner === 0 ? "text-neon-green text-glow-green" : "text-neon-cyan text-glow-cyan"))}>
                  {score[0]} <span className="text-white/30">–</span> {score[1]}
                </div>
                <div className="mt-2 font-display text-2xl font-bold uppercase text-white">
                  {match.winner !== null ? `${match.teams[match.winner].name} win it!` : "A hard-fought draw"}
                </div>
              </motion.div>

              {/* MOTM */}
              <div className="glass mt-6 w-full rounded-2xl p-5">
                <div className="font-display text-xs font-bold uppercase tracking-[0.3em] text-neon-gold">
                  Player of the match
                </div>
                <div className="mt-1 font-display text-3xl font-extrabold text-white">
                  {match.motm.player}
                </div>
                <div className="mt-1 text-sm text-white/60">
                  {match.teams[match.motm.team].name} · rating {match.motm.rating.toFixed(1)}
                </div>
                {match.motm.note && <p className="mt-2 text-sm italic text-white/50">"{match.motm.note}"</p>}
              </div>

              {/* final stats */}
              <div className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="glass rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <span className={cn("font-display text-lg font-bold uppercase", i === 0 ? "text-neon-green" : "text-neon-cyan")}>
                        {match.teams[i].name}
                      </span>
                      <span className="font-display text-2xl font-extrabold text-white">{score[i]}</span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm">
                      <Row k="Possession" v={`${match.stats[i].possession}%`} />
                      <Row k="Shots" v={`${match.stats[i].shots}`} />
                      <Row k="On target" v={`${match.stats[i].shotsOnTarget}`} />
                      <Row k="Passes" v={`${match.stats[i].passes} (${match.stats[i].passAccuracy}%)`} />
                      <Row k="Corners" v={`${match.stats[i].corners}`} />
                      <Row k="Cards" v={"🟨".repeat(match.stats[i].yellowCards) + " 🟥".repeat(match.stats[i].redCards) || "—"} />
                    </div>
                  </div>
                ))}
              </div>

              {match.summary && (
                <p className="mt-5 max-w-2xl text-center text-sm text-white/60">"{match.summary}"</p>
              )}

              <div className="mt-6 flex gap-4">
                <button onClick={() => location.reload()} className="btn-primary px-8">
                  Replay
                </button>
                <button onClick={leaveRoom} className="btn-secondary px-8">
                  Home
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function Scoreboard({
  names,
  score,
  minute,
  half,
  playing,
  progress,
}: {
  names: string[];
  score: [number, number];
  minute: number;
  half: number;
  playing: boolean;
  progress: number;
}) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <TeamName name={names[0]} color="green" align="right" />
        <div className="flex items-center gap-3">
          <ScoreNum value={score[0]} color="green" />
          <div className="w-28 text-center sm:w-40">
            <div className="font-display text-3xl font-extrabold text-white sm:text-4xl">
              {minute}'
              <span className="ml-1 text-base text-white/50">{half === 1 ? "1H" : "2H"}</span>
            </div>
            <div className={cn("mt-0.5 text-[10px] font-bold uppercase tracking-widest", playing ? "animate-pulse text-neon-green" : "text-white/40")}>
              {playing ? "Live" : "—"}
            </div>
          </div>
          <ScoreNum value={score[1]} color="cyan" />
        </div>
        <TeamName name={names[1]} color="cyan" align="left" />
      </div>
      <div className="h-1.5 w-full bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-neon-green via-neon-gold to-neon-cyan"
          animate={{ width: `${progress}%` }}
          transition={{ ease: "linear", duration: 0.1 }}
        />
      </div>
    </div>
  );
}

function TeamName({ name, color, align }: { name: string; color: "green" | "cyan"; align: "left" | "right" }) {
  return (
    <div className={cn("flex flex-1 items-center gap-2", align === "right" && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-extrabold",
          color === "green" ? "border-neon-green bg-neon-green/20 text-neon-green" : "border-neon-cyan bg-neon-cyan/20 text-neon-cyan"
        )}
      >
        {name[0] ?? "?"}
      </div>
      <span className={cn("truncate font-display text-base font-bold uppercase sm:text-lg", align === "right" ? "text-right" : "text-left")}>
        {name}
      </span>
    </div>
  );
}

function ScoreNum({ value, color }: { value: number; color: "green" | "cyan" }) {
  return (
    <div className="relative w-14 text-center">
      <span className={cn("font-display text-6xl font-extrabold sm:text-7xl", color === "green" ? "text-neon-green text-glow-green" : "text-neon-cyan text-glow-cyan")}>
        {value}
      </span>
    </div>
  );
}

function StatCard({
  label,
  a,
  b,
  team0,
  pct,
  max,
}: {
  label: string;
  a: number;
  b: number;
  team0: 0 | 1;
  pct?: boolean;
  max?: number;
}) {
  const total = max ?? Math.max(1, a + b);
  const aw = pct ? a : (a / total) * 100;
  const bw = pct ? 100 - a : (b / total) * 100;
  return (
    <div className="glass rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between text-xs font-semibold text-white/60">
        <span>{label}</span>
        <span className="font-display text-base font-extrabold text-white">
          {a} <span className="text-white/30">:</span> {b}
        </span>
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full bg-neon-green"
          animate={{ width: `${aw}%` }}
          transition={{ ease: "linear", duration: 0.3 }}
        />
        <motion.div
          className="h-full bg-neon-cyan"
          animate={{ width: `${bw}%` }}
          transition={{ ease: "linear", duration: 0.3 }}
        />
      </div>
    </div>
  );
}

function PitchView({
  match,
  minute,
  feed,
  score,
  done,
}: {
  match: MatchData;
  minute: number;
  feed: MatchEvent[];
  score: [number, number];
  done: boolean;
}) {
  const last = feed[feed.length - 1];
  const meta = last ? EVENT_META[last.type] : null;
  return (
    <div className="relative min-h-[300px] overflow-hidden rounded-2xl border border-white/10">
      <div className="pitch-zoom absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      <div className="relative z-10 flex h-full min-h-[300px] flex-col items-center justify-center p-3 text-center">
        <div className="font-display text-5xl font-extrabold text-white/90 sm:text-6xl">
          {score[0]} <span className="text-white/25">–</span> {score[1]}
        </div>
        <div className="mt-1 font-display text-sm font-bold uppercase tracking-widest text-white/60">
          {Math.floor(minute)}' · {match.teams[0].name} v {match.teams[1].name}
        </div>

        <div className="mt-5 h-28 w-full">
          <AnimatePresence mode="wait">
            {last && meta ? (
              <motion.div
                key={feed.length}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="glass rounded-2xl px-4 py-3"
              >
                <div className={cn("text-xs font-bold uppercase tracking-widest", last.type === "goal" ? "text-neon-gold" : last.type === "red" ? "text-red-400" : "text-neon-cyan")}>
                  {meta.icon} {last.type === "goal" ? "GOAL!" : meta.label} · {last.minute}'
                </div>
                <p className="mt-1 text-sm text-white/85">{last.text}</p>
              </motion.div>
            ) : (
              <div className="flex h-full items-center justify-center font-display text-lg font-bold uppercase text-white/30">
                {done ? "Final whistle" : "Waiting for action…"}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Timeline / Lineups tabs ---------------- */

type SideTab = "timeline" | "lineups";

function SidePanel({
  match,
  feed,
  score,
  squads,
  formation,
  minute,
}: {
  match: MatchData;
  feed: MatchEvent[];
  score: [number, number];
  squads: Player[][];
  formation: Pos[];
  minute: number;
}) {
  const [tab, setTab] = useState<SideTab>("timeline");
  return (
    <div className="glass flex max-h-[75vh] min-h-[420px] flex-col overflow-hidden rounded-2xl lg:h-full lg:max-h-none lg:min-h-0">
      <div className="flex border-b border-white/10">
        <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")} icon="📜" label="Timeline" />
        <TabButton active={tab === "lineups"} onClick={() => setTab("lineups")} icon="👥" label="Lineups" />
      </div>
      {tab === "timeline" ? (
        <TimelineFeed feed={feed} />
      ) : (
        <LineupsView match={match} feed={feed} score={score} squads={squads} formation={formation} minute={minute} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-2.5 font-display text-xs font-bold uppercase tracking-[0.2em] transition",
        active ? "border-neon-gold text-neon-gold" : "border-transparent text-white/50 hover:text-white/80"
      )}
    >
      <span>{icon}</span> {label}
    </button>
  );
}

function TimelineFeed({ feed }: { feed: MatchEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [feed.length]);
  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-3">
      {feed.length === 0 && (
        <div className="py-10 text-center text-sm text-white/30">Commentary will appear here…</div>
      )}
      {feed.map((ev, i) => {
        const m = EVENT_META[ev.type];
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2",
              ev.type === "goal"
                ? "border-neon-gold/40 bg-neon-gold/10"
                : ev.type === "red"
                  ? "border-red-400/40 bg-red-500/10"
                  : ev.type === "half_time" || ev.type === "full_time"
                    ? "border-neon-cyan/30 bg-neon-cyan/5"
                    : "border-white/5 bg-white/[0.03]"
            )}
          >
            <span className="w-14 shrink-0 text-right font-display text-sm font-extrabold text-white/70">
              {ev.minute}'
            </span>
            <span>{m.icon}</span>
            <p className={cn("min-w-0 flex-1 text-xs leading-snug text-white/85", ev.type === "goal" && "font-semibold text-neon-gold")}>
              {ev.text}
            </p>
            <span className="shrink-0 rounded-md bg-black/40 px-1.5 py-0.5 font-display text-xs font-extrabold text-white/70">
              {ev.score[0]}–{ev.score[1]}
            </span>
          </motion.div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function LineupsView({
  match,
  feed,
  score,
  squads,
  formation,
  minute,
}: {
  match: MatchData;
  feed: MatchEvent[];
  score: [number, number];
  squads: Player[][];
  formation: Pos[];
  minute: number;
}) {
  const byPlayer = useMemo(() => {
    const goals = new Map<string, number>();
    const card = new Map<string, "yellow" | "red">();
    for (const ev of feed) {
      if (ev.type === "goal" && ev.player) goals.set(ev.player, (goals.get(ev.player) ?? 0) + 1);
      if (ev.type === "red" && ev.player) card.set(ev.player, "red");
      else if (ev.type === "yellow" && ev.player && !card.has(ev.player)) card.set(ev.player, "yellow");
    }
    return { goals, card };
  }, [feed]);

  return (
    <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className={cn("flex items-center justify-between px-3 py-2", i === 0 ? "bg-neon-green/10" : "bg-neon-cyan/10")}>
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-extrabold", i === 0 ? "border-neon-green text-neon-green" : "border-neon-cyan text-neon-cyan")}>
                {match.teams[i].name[0] ?? "?"}
              </span>
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-bold uppercase text-white">{match.teams[i].name}</div>
                <div className="text-[10px] text-white/50">{match.teams[i].formation} · OVR {match.teams[i].rating.toFixed(1)}</div>
              </div>
            </div>
            <div className="shrink-0 pl-2 font-display text-xl font-extrabold text-white">{score[i]}</div>
          </div>
          <div className="space-y-0.5 p-2">
            {formation.map((pos, si) => {
              const p = squads[i]?.[si];
              if (!p) return null;
              const ppos = primaryPos(p) || pos;
              const goals = byPlayer.goals.get(p.name) ?? 0;
              const card = byPlayer.card.get(p.name);
              return (
                <div key={si} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1">
                  <span className="w-8 shrink-0 font-display text-[10px] font-extrabold uppercase text-white/40">{ppos}</span>
                  <PlayerThumb p={p} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/85">{p.name}</span>
                  {goals > 0 && <span className="shrink-0 text-[11px] text-neon-gold">⚽{goals}</span>}
                  {card === "red" && <span className="shrink-0 text-[11px]">🟥</span>}
                  {card === "yellow" && <span className="shrink-0 text-[11px]">🟨</span>}
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-b font-display text-[10px] font-extrabold text-black", i === 0 ? "from-emerald-300 to-emerald-500" : "from-cyan-300 to-cyan-500")}>
                    {p.overall}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="text-center text-[10px] uppercase tracking-widest text-white/30">Lineups as of {minute}'</div>
    </div>
  );
}

function PlayerThumb({ p }: { p: Player }) {
  const [src, setSrc] = useState(proxiedImg(p.img));
  const [broken, setBroken] = useState(false);
  const onError = () => {
    if (!p.img || src?.includes("_60.")) setBroken(true);
    else setSrc(smallImg(p.img));
  };
  return (
    <span className="h-6 w-6 shrink-0 overflow-hidden rounded ring-1 ring-white/20">
      {p.img && !broken ? (
        <img src={src ?? undefined} alt={p.name} loading="lazy" referrerPolicy="no-referrer" onError={onError} className="h-full w-full object-cover object-top" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-950 font-display text-[9px] font-extrabold text-white/70">
          {initials(p.name)}
        </span>
      )}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0]?.[0] ?? "?");
}

/** First-listed real position of a player (same rule the match sim uses). */
function primaryPos(p: Player): string | null {
  const tok = p.positions.split(/[|,/\s]+/).find((s) => s.trim().length > 0);
  return tok ? tok.trim().toUpperCase() : null;
}

function Controls({
  playing,
  done,
  speed,
  minute,
  onSpeed,
  onSkip,
  onContinue,
  onHome,
}: {
  playing: boolean;
  done: boolean;
  speed: number;
  minute: number;
  onSpeed: (s: number) => void;
  onSkip: () => void;
  onContinue: () => void;
  onHome: () => void;
}) {
  return (
    <div className="glass mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            disabled={done}
            className={cn(
              "rounded-lg border px-3 py-1.5 font-display text-sm font-bold transition",
              speed === s
                ? "border-neon-cyan/70 bg-neon-cyan/15 text-neon-cyan"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10",
              done && "opacity-40"
            )}
          >
            {s}x
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden font-display text-sm font-bold text-white/60 sm:block">{minute}'</span>
        {done ? (
          <button
            onClick={onContinue}
            className="animate-pulse rounded-lg border border-neon-gold/60 bg-neon-gold/20 px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wider text-neon-gold transition hover:bg-neon-gold/30"
          >
            Continue ▶
          </button>
        ) : (
          <button
            onClick={onSkip}
            disabled={!playing}
            className="rounded-lg border border-neon-gold/50 bg-neon-gold/15 px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wider text-neon-gold transition hover:bg-neon-gold/25 disabled:opacity-40"
          >
            Skip ⏭
          </button>
        )}
        <button
          onClick={onHome}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wider text-white/70 transition hover:bg-white/10"
        >
          Quit
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/50">{k}</span>
      <span className="font-semibold text-white">{v}</span>
    </div>
  );
}
