import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Player } from "../lib/types";
import { primaryPosLabel } from "../lib/types";
import { cn, proxiedImg } from "../lib/utils";
import { sound } from "../lib/sound";
import { Confetti } from "./Confetti";

export interface PowerFXData {
  type: "wildcard" | "noRisk";
  idx: number;
  out?: Player;
  picked?: Player;
}

interface Props {
  fx: PowerFXData;
  teamName: string;
  onClose: () => void;
}

/** Big face card used across both animations. */
function FaceCard({ p, size = "md" }: { p: Player; size?: "md" | "lg" }) {
  return (
    <div className={cn("w-40 sm:w-48", size === "lg" && "w-44 sm:w-56")}>
      <PlayerCardLite player={p} />
    </div>
  );
}

/** Minimal card (photo + name + OVR) — avoids importing the full PlayerCard
 *  chrome so the overlay controls its own styling. */
function PlayerCardLite({ player }: { player: Player }) {
  const [broken, setBroken] = useState(false);
  const parts = (player.name || "?").split(" ").filter(Boolean);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0]?.[0] ?? "?");
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-neon-gold/50 bg-slate-900/95 shadow-card">
      <div className="relative h-40 w-full sm:h-48">
        {player.img && !broken ? (
          <img
            src={proxiedImg(player.img) ?? undefined}
            alt={player.name}
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-950 font-display text-4xl font-extrabold text-white/70">
            {initials}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />
        <div className="absolute left-2 top-2 rounded-lg bg-black/80 px-2 py-0.5 font-display text-[10px] font-extrabold uppercase tracking-widest text-white/85 ring-1 ring-white/20">
          {primaryPosLabel(player)}
        </div>
        <div className="absolute bottom-1.5 right-1.5 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-amber-200 to-yellow-600 font-display text-xl font-extrabold text-black shadow-lg">
          {player.overall}
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="truncate font-display text-base font-extrabold uppercase leading-tight text-white">
          {player.name}
        </div>
        <div className="truncate text-[11px] text-white/45">{player.club ?? "—"}</div>
      </div>
    </div>
  );
}

/* ---------------- Swap ceremony (shared by Wildcard & No Risk) ---------------- */

function RiskFX({
  teamName,
  out,
  picked,
  theme,
}: {
  teamName: string;
  out: Player;
  picked: Player;
  theme: { icon: string; machine: string; sub: string; accent: string; border: string; blurb: string };
}) {
  const [phase, setPhase] = useState<"feed" | "flash" | "reveal">("feed");
  const delta = picked.overall - out.overall;
  const verdict =
    delta > 0
      ? { label: `UPGRADE ▲ +${delta}`, cls: "text-neon-green", bar: "from-emerald-400 to-neon-green" }
      : delta < 0
        ? { label: `DOWNGRADE ▼ ${delta}`, cls: "text-red-300", bar: "from-red-500 to-rose-700" }
        : { label: "EVEN SWAP", cls: "text-neon-cyan", bar: "from-sky-400 to-neon-cyan" };

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("flash"), 1500);
    const t2 = setTimeout(() => {
      setPhase("reveal");
      if (delta > 0) sound.win();
      else if (delta < 0) sound.fold();
      else sound.reveal();
    }, 1750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="mt-4 max-w-xs text-sm text-white/60">
        {phase === "reveal" ? (
          <>Fate has spoken.</>
        ) : (
          <>{teamName} {theme.blurb}</>
        )}
      </p>

      <div className="relative mt-5 flex h-72 items-end justify-center gap-4 sm:h-80">
        {/* sacrificed card */}
        <AnimatePresence>
          {phase !== "reveal" && (
            <motion.div
              key="out"
              initial={{ opacity: 0, x: -60, rotate: -8 }}
              animate={
                phase === "feed"
                  ? { opacity: 1, x: 0, rotate: -4, y: [0, 0, 46, 96] }
                  : { opacity: 0, y: 120, scale: 0.7 }
              }
              exit={{ opacity: 0, y: 120, scale: 0.7 }}
              transition={
                phase === "feed"
                  ? { y: { delay: 0.7, duration: 0.75, ease: "easeIn" }, default: { duration: 0.3 } }
                  : { duration: 0.3 }
              }
              className="absolute bottom-24 z-10 w-32 opacity-95 sm:w-36"
            >
              <FaceCard p={out} />
              <div className="mt-1 text-center font-display text-[10px] font-bold uppercase tracking-widest text-red-300/80">
                risked
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* the machine */}
        <motion.div
          animate={phase === "feed" || phase === "flash" ? { x: [0, -3, 3, -2, 2, 0], rotate: [0, -1, 1, -0.5, 0] } : {}}
          transition={phase === "feed" ? { delay: 0.7, repeat: Infinity, duration: 0.28 } : phase === "flash" ? { duration: 0.15, repeat: Infinity } : {}}
          className={cn(
            "relative flex h-56 w-44 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 bg-gradient-to-b from-slate-800 via-slate-900 to-black shadow-card sm:h-64 sm:w-52",
            theme.border,
            phase === "flash" && "border-white"
          )}
        >
          <div className="absolute inset-x-6 top-8 h-3 rounded-full bg-black/80 ring-2 ring-white/15" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
            className="text-5xl"
          >
            ⚙️
          </motion.div>
          <div className={cn("mt-3 font-display text-sm font-extrabold uppercase tracking-[0.3em]", theme.accent)}>
            {theme.machine}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-white/35">
            {theme.sub}
          </div>
          {phase === "flash" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 bg-white"
            />
          )}
        </motion.div>

        {/* replacement */}
        <AnimatePresence>
          {phase === "reveal" && (
            <>
              <motion.div
                key="picked"
                initial={{ y: -160, opacity: 0, rotate: 10, scale: 0.7 }}
                animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 17 }}
                className="absolute bottom-16 z-10 w-36 sm:w-40"
              >
                <FaceCard p={picked} />
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.4 }}
                  className={cn("mx-auto mt-2 h-1.5 w-4/5 origin-left rounded-full bg-gradient-to-r", verdict.bar)}
                />
              </motion.div>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="absolute -bottom-9 z-20"
              >
                <span className={cn("rounded-full bg-black/70 px-4 py-1 font-display text-xl font-extrabold uppercase tracking-wider ring-1 ring-current sm:text-2xl", verdict.cls)}>
                  {verdict.label}
                </span>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {delta > 0 && phase === "reveal" && <Confetti count={40} />}
    </>
  );
}

/* ---------------- Shell ---------------- */

const WILD_THEME = {
  icon: "🎰",
  title: "Wildcard",
  machine: "LUCKY REPLACE",
  sub: "budget luck decides",
  accent: "text-neon-pink",
  border: "border-neon-pink/40",
  grad: "from-fuchsia-400 to-purple-600",
  glow: "shadow-glow-pink",
  blurb: "feeds their pick into the lucky replace… who comes out is up to the odds.",
};

const RISK_THEME = {
  icon: "🃏",
  title: "No Risk No Fun",
  machine: "THE MACHINE",
  sub: "no risk · no fun",
  accent: "text-red-300",
  border: "border-red-400/40",
  grad: "from-red-400 to-rose-700",
  glow: "shadow-glow-red",
  blurb: "feeds a random signing into the machine… better or worse, nobody knows.",
};

export function PowerFX({ fx, teamName, onClose }: Props) {
  const meta = fx.type === "wildcard" ? WILD_THEME : RISK_THEME;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        className={cn(
          "glass relative w-full max-w-md overflow-hidden rounded-3xl p-6 text-center",
          meta.glow
        )}
      >
        <div className="font-display text-xs font-bold uppercase tracking-[0.35em] text-white/45">
          {teamName} activates
        </div>
        <div className={cn("mt-1 font-display text-3xl font-extrabold uppercase", meta.accent)}>
          {meta.icon} {meta.title}
        </div>

        {fx.out && fx.picked && (
          <RiskFX teamName={teamName} out={fx.out} picked={fx.picked} theme={meta} />
        )}

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.1 }}
          onClick={onClose}
          disabled={!fx.out || !fx.picked}
          className={cn(
            "mt-20 w-full rounded-xl bg-gradient-to-r py-3 font-display text-lg font-extrabold uppercase tracking-wider text-black transition hover:brightness-110 active:scale-95 sm:mt-24",
            meta.grad,
            meta.glow
          )}
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
