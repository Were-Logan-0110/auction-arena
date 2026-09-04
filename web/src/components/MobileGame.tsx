import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { EngineState, Player } from "../lib/types";
import { primaryPosLabel } from "../lib/types";
import { cn, fmtMoney, proxiedImg, smallImg } from "../lib/utils";
import { useBidDraft, useBidKeys } from "../lib/useBidDraft";
import type { PlayType } from "../store/useGame";
import { AnimatedMoney } from "./AnimatedMoney";
import { DraftInput } from "./DraftInput";
import { PitchField } from "./PitchField";
import { PlayerCard } from "./PlayerCard";
import { PowerSlots } from "./PowerSlots";

type Tab = "auction" | "pitch" | "teams";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "auction", icon: "🔨", label: "Auction" },
  { id: "pitch", icon: "🏟️", label: "Pitch" },
  { id: "teams", icon: "👥", label: "Teams" },
];

interface Props {
  state: EngineState;
  playType: PlayType;
  myIdx: number | null;
  onBid: (amount: number) => void;
  onFold: () => void;
  onNext: () => void;
  onQuit: () => void;
  onWildcard: (idx: number) => void;
  onNoRisk: (idx: number) => void;
  canControl: (idx: number) => boolean;
}

export default function MobileGame({
  state,
  playType,
  myIdx,
  onBid,
  onFold,
  onNext,
  onQuit,
  onWildcard,
  onNoRisk,
  canControl,
}: Props) {
  const [tab, setTab] = useState<Tab>("auction");
  const you = playType === "ai" ? 0 : playType === "online" ? myIdx : null;
  const bidding = state.phase === "round" && state.rounds[state.roundIdx]?.status === "bidding";
  const yourTurn = bidding && (playType === "hotseat" ? true : state.turn === you);

  // jump back to the auction tab the moment it's your turn (only when the turn
  // *becomes* yours — while it's your turn you can browse the other tabs freely)
  const wasYourTurn = useRef(yourTurn);
  useEffect(() => {
    if (yourTurn && !wasYourTurn.current) setTab("auction");
    wasYourTurn.current = yourTurn;
  }, [yourTurn]);

  return (
    <div className="bg-stadium relative flex min-h-screen flex-col">
      <div className="crowd pointer-events-none absolute inset-0" />

      {/* header */}
      <header className="relative z-10 flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-lg font-extrabold uppercase text-white">
            Auction<span className="text-neon-green">Arena</span>
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-white/70">
            {state.mode}v{state.mode}
          </span>
        </div>
        <button
          onClick={onQuit}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:bg-white/10"
        >
          Quit
        </button>
      </header>

      {/* round stepper (steps) */}
      <div className="relative z-10 mb-1 flex items-center justify-between px-4">
        <div className="flex items-center gap-1.5">
          {state.rounds.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === state.roundIdx
                  ? "w-6 bg-neon-gold shadow-glow-gold"
                  : i < state.roundIdx
                    ? "w-3 bg-neon-green/70"
                    : "w-3 bg-white/15"
              )}
            />
          ))}
        </div>
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
          Round {state.roundIdx + 1} / {state.rounds.length}
        </span>
      </div>

      {/* tab content */}
      <main className="relative z-10 flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: tab === "auction" ? -24 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {tab === "auction" && (
              <MobileAuction
                state={state}
                playType={playType}
                myIdx={myIdx}
                onBid={onBid}
                onFold={onFold}
                onNext={onNext}
                onWildcard={onWildcard}
                onNoRisk={onNoRisk}
              />
            )}
            {tab === "pitch" && (
              <div className="px-3 pb-4 pt-1">
                <PitchField state={state} />
              </div>
            )}
            {tab === "teams" && (
              <TeamsView
                state={state}
                playType={playType}
                myIdx={myIdx}
                canControl={canControl}
                onWildcard={onWildcard}
                onNoRisk={onNoRisk}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/70 backdrop-blur-xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 transition",
                tab === t.id ? "text-neon-gold" : "text-white/40 hover:text-white/70"
              )}
            >
              <span className={cn("text-xl", tab === t.id && "drop-shadow-[0_0_8px_rgba(255,190,60,0.6)]")}>
                {t.icon}
              </span>
              <span className="font-display text-[10px] font-bold uppercase tracking-widest">
                {t.label}
              </span>
              {tab === t.id && <span className="h-1 w-1 rounded-full bg-neon-gold" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ---------------- Auction tab ---------------- */

function MobileAuction({
  state,
  playType,
  myIdx,
  onBid,
  onFold,
  onNext,
  onWildcard,
  onNoRisk,
}: {
  state: EngineState;
  playType: PlayType;
  myIdx: number | null;
  onBid: (amount: number) => void;
  onFold: () => void;
  onNext: () => void;
  onWildcard: (idx: number) => void;
  onNoRisk: (idx: number) => void;
}) {
  const round = state.rounds[state.roundIdx];
  const {
    draft,
    setDraft,
    step,
    active,
    isOpen,
    isResponse,
    iAmTurn,
    minDraft,
    maxDraft,
    draftOk,
    canRaise,
    quick,
  } = useBidDraft(state, playType, myIdx);

  useBidKeys(active, iAmTurn, draft, draftOk, isResponse, step, onBid, onFold);

  const you = playType === "ai" ? 0 : playType === "online" ? myIdx : null;
  const turnName = state.names[state.turn];
  const isTurnYou = you !== null && state.turn === you;
  const isEnd = state.phase === "end";
  const roundDone = state.phase === "round" && state.status === "round_done";
  const hasPowers =
    !!state.powers && (state.powers.lastBid || state.powers.wildcard || state.powers.noRisk);

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-1">
      {/* turn banner */}
      <div className="flex items-center justify-center gap-2">
        {active && (
          <>
            <span
              className={cn(
                "h-2 w-2 animate-ping rounded-full",
                isTurnYou ? "bg-neon-green" : "bg-neon-cyan"
              )}
            />
            <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white/70">
              {isTurnYou ? "You" : turnName} {isOpen ? "to open" : "to respond"}
            </span>
          </>
        )}
      </div>

      {/* card stage */}
      <div className="relative flex flex-1 items-center justify-center py-2">
        {/* spotlight */}
        <div
          className={cn(
            "pointer-events-none absolute h-72 w-72 rounded-full transition-colors duration-700 sm:h-80 sm:w-80",
            active
              ? "bg-[radial-gradient(circle,rgba(255,190,60,0.18)_0%,transparent_65%)]"
              : "bg-[radial-gradient(circle,rgba(255,255,255,0.08)_0%,transparent_65%)]"
          )}
        />
        {active && <div className="pointer-events-none absolute h-40 w-40 animate-ping rounded-full border-2 border-neon-gold/15" />}

        <AnimatePresence mode="wait">
          {round && (
            <motion.div
              key={round.visible.id + "-" + state.roundIdx}
              initial={{ opacity: 0, y: 60, scale: 0.8, rotate: -4 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, y: -60, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              className="relative z-10 w-44 sm:w-52"
            >
              <PlayerCard player={round.visible} size="lg" revealed />
              <div className="mt-2 text-center">
                <span className="rounded-full bg-black/50 px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-neon-gold ring-1 ring-neon-gold/30">
                  {primaryPosLabel(round.visible)}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* current bid */}
      <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-center backdrop-blur-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
          {state.lastBid > 0 ? "Current bid" : "Opening bid"}
        </div>
        <div className="mt-0.5 font-display text-4xl font-extrabold text-white text-glow-green">
          <AnimatedMoney value={state.lastBid} />
        </div>
        <div className="mt-0.5 h-4 text-xs font-medium text-white/60">
          {state.lastBid > 0 && state.bidder != null ? (
            <>held by <span className="font-semibold text-white">{state.names[state.bidder]}</span></>
          ) : (
            <span className="animate-pulse text-neon-gold">{turnName} to open</span>
          )}
        </div>
      </div>

      {/* game changer slots for this client's team */}
      {hasPowers && you !== null && (
        <div className="mt-2 flex justify-center">
          <PowerSlots state={state} idx={you} canControl onWildcard={onWildcard} onNoRisk={onNoRisk} />
        </div>
      )}

      {/* actions */}
      <div className="mt-3">
        {active && iAmTurn ? (
          <div className="space-y-2.5">
            {/* stepper */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => step(-0.5)}
                disabled={draft <= minDraft}
                className="glass flex h-14 w-14 items-center justify-center rounded-2xl font-display text-2xl font-bold text-white/80 transition active:scale-90 disabled:opacity-30"
              >
                −
              </button>
              <div className="flex h-14 min-w-32 items-center justify-center rounded-2xl border border-white/15 bg-black/50 px-2">
                <DraftInput draft={draft} setDraft={setDraft} minDraft={minDraft} maxDraft={maxDraft} onBid={onBid} className="text-3xl" />
              </div>
              <button
                onClick={() => step(0.5)}
                disabled={draft >= maxDraft}
                className="glass flex h-14 w-14 items-center justify-center rounded-2xl font-display text-2xl font-bold text-white/80 transition active:scale-90 disabled:opacity-30"
              >
                +
              </button>
            </div>

            {/* quick chips */}
            <div className="flex items-center justify-center gap-2">
              {quick.map((q) => (
                <button
                  key={q}
                  onClick={() => setDraft(q)}
                  className={cn(
                    "rounded-xl border px-4 py-1.5 text-sm font-semibold transition active:scale-95",
                    draft === q
                      ? "border-neon-green/60 bg-neon-green/15 text-neon-green"
                      : "border-white/10 bg-white/5 text-white/60"
                  )}
                >
                  {fmtMoney(q, 1)}
                </button>
              ))}
            </div>

            {/* bid / fold */}
            <div className="flex gap-3">
              <button
                onClick={() => onBid(draft)}
                disabled={!draftOk}
                className="flex-1 rounded-2xl bg-gradient-to-r from-neon-green to-emerald-500 py-4 font-display text-xl font-extrabold uppercase tracking-wider text-black shadow-glow transition active:scale-95 disabled:opacity-30 disabled:shadow-none"
              >
                {isResponse ? "Raise" : "Bid"}
              </button>
              {isResponse && (
                <button
                  onClick={onFold}
                  className="rounded-2xl border border-red-400/40 bg-red-500/15 px-8 py-4 font-display text-xl font-extrabold uppercase tracking-wider text-red-300 transition active:scale-95"
                >
                  Fold
                </button>
              )}
            </div>
            {!canRaise && isResponse && (
              <p className="text-center text-xs font-medium text-red-300">
                You can't cover the minimum raise — fold.
              </p>
            )}
          </div>
        ) : active ? (
          <div className="flex items-center justify-center gap-3 py-4">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-neon-cyan" />
            <p className="font-display text-base font-semibold uppercase tracking-wider text-neon-cyan">
              {turnName} is thinking…
            </p>
          </div>
        ) : (
          <div className="py-2 text-center">
            <div className="font-display text-lg font-bold text-neon-gold">
              {isEnd ? "Draft complete" : roundDone ? `${state.names[state.bidder ?? 0]} wins the round` : "—"}
            </div>
            <button
              onClick={onNext}
              className="mt-3 w-full rounded-2xl bg-gradient-to-r from-neon-cyan to-cyan-500 py-4 font-display text-xl font-extrabold uppercase tracking-wider text-black shadow-glow-cyan transition active:scale-95"
            >
              {isEnd ? "See Results" : "Next Round"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Teams tab ---------------- */

function rating(players: Player[]): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((a, p) => a + p.overall, 0);
  return Math.round((sum / players.length) * 10) / 10;
}

function Thumb({ p }: { p: Player }) {
  const [src, setSrc] = useState(proxiedImg(p.img));
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setSrc(proxiedImg(p.img));
    setBroken(false);
  }, [p.img]);
  const onError = () => {
    if (!p.img || src?.includes("_60.")) setBroken(true);
    else setSrc(smallImg(p.img));
  };
  const parts = (p.name || "?").split(" ").filter(Boolean);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0]?.[0] ?? "?");
  return (
    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-white/20">
      {p.img && !broken ? (
        <img src={src ?? undefined} alt={p.name} loading="lazy" referrerPolicy="no-referrer" onError={onError} className="h-full w-full object-cover object-top" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-950 font-display text-[10px] font-extrabold text-white/70">
          {initials}
        </span>
      )}
    </span>
  );
}

function TeamsView({
  state,
  playType,
  myIdx,
  canControl,
  onWildcard,
  onNoRisk,
}: {
  state: EngineState;
  playType: PlayType;
  myIdx: number | null;
  canControl: (idx: number) => boolean;
  onWildcard: (idx: number) => void;
  onNoRisk: (idx: number) => void;
}) {
  const initial = state.budget;
  return (
    <div className="space-y-3 px-3 pb-4 pt-1">
      {[0, 1].map((i) => {
        const squad = state.squads[i];
        const color = i === 0 ? "green" : "cyan";
        return (
          <div key={i} className="glass rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", color === "green" ? "bg-neon-green" : "bg-neon-cyan")} />
              <span className="truncate font-display text-base font-bold uppercase text-white">{state.names[i]}</span>
              <span className="ml-auto font-display text-sm font-extrabold text-white/80">OVR {rating(squad).toFixed(1)}</span>
            </div>
            <div className="mt-2 flex items-end justify-between text-xs">
              <span className="uppercase tracking-widest text-white/40">Budget left</span>
              <span className="font-display text-lg font-extrabold text-white">
                <AnimatedMoney value={state.budgets[i]} />
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                  color === "green" ? "from-emerald-500 to-neon-green" : "from-sky-500 to-neon-cyan"
                )}
                style={{ width: `${Math.max(0, Math.min(100, (state.budgets[i] / initial) * 100))}%` }}
              />
            </div>

            <PowerSlots
              state={state}
              idx={i}
              canControl={canControl(i)}
              onWildcard={onWildcard}
              onNoRisk={onNoRisk}
            />

            <div className="mt-3 space-y-1">
              {squad.length === 0 && <div className="py-2 text-center text-xs text-white/40">No players signed yet</div>}
              {squad.map((p, pi) => {
                const cost = state.prices?.[i]?.[pi];
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5">
                    <Thumb p={p} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">{p.name}</span>
                    {cost != null && (
                      <span className={cn("shrink-0 font-display text-[10px] font-extrabold uppercase", cost > 0 ? "text-neon-gold/90" : "text-neon-green/80")}>
                        {cost > 0 ? fmtMoney(cost) : "free"}
                      </span>
                    )}
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b font-display text-xs font-extrabold text-black", color === "green" ? "from-emerald-300 to-emerald-500" : "from-cyan-300 to-cyan-500")}>
                      {p.overall}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-center text-[10px] uppercase tracking-widest text-white/30">
        {state.formation.join("-")} formation
      </p>
    </div>
  );
}
