import { AnimatePresence, motion } from "framer-motion";
import type { EngineState } from "../lib/types";
import { BID_STEP, MIN_BID, primaryPosLabel } from "../lib/types";
import { cn, fmtMoney } from "../lib/utils";
import { useBidDraft, useBidKeys } from "../lib/useBidDraft";
import { AnimatedMoney } from "./AnimatedMoney";
import { DraftInput } from "./DraftInput";
import { PlayerCard } from "./PlayerCard";
import type { PlayType } from "../store/useGame";

interface Props {
  state: EngineState;
  playType: PlayType;
  myIdx: number | null;
  onBid: (amount: number) => void;
  onFold: () => void;
  onNext: () => void;
}

export function BidPanel({ state, playType, myIdx, onBid, onFold, onNext }: Props) {
  const round = state.rounds[state.roundIdx];
  const {
    draft,
    setDraft,
    step,
    active,
    isResponse,
    iAmTurn,
    minDraft,
    maxDraft,
    draftOk,
    canRaise,
    quick,
  } = useBidDraft(state, playType, myIdx);

  useBidKeys(active, iAmTurn, draft, draftOk, isResponse, step, onBid, onFold);

  const revealDone = state.phase === "round" && round?.status === "reveal";
  const isEnd = state.phase === "end";
  const canNext = revealDone || isEnd;

  const turnName = state.names[state.turn];

  return (
    <div className="glass relative flex flex-col overflow-hidden rounded-2xl p-4 lg:sticky lg:top-4">
      {/* accent glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-neon-gold/10 blur-3xl" />

      {/* header */}
      <div className="flex items-center justify-between">
        <div className="font-display text-lg font-bold uppercase tracking-wider text-white">
          Round {state.roundIdx + 1}
          <span className="text-white/40"> / {state.rounds.length}</span>
        </div>
        <div className="rounded-full bg-neon-gold/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-widest text-neon-gold ring-1 ring-neon-gold/30">
          {round ? primaryPosLabel(round.visible) : "Draft complete"}
        </div>
      </div>
      <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* card */}
      <div className="mt-4 flex flex-1 flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {round && (
            <motion.div
              key={round.visible.id + "-" + state.roundIdx}
              initial={{ opacity: 0, y: 30, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="w-40 sm:w-48"
            >
              <PlayerCard player={round.visible} size="lg" revealed />
            </motion.div>
          )}
        </AnimatePresence>

        {/* current bid */}
        <div className="mt-5 w-full max-w-56 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-center backdrop-blur-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/40">
            {state.lastBid > 0 ? "Current bid" : "Opening bid"}
          </div>
          <div className="mt-1 font-display text-5xl font-extrabold text-white text-glow-green">
            <AnimatedMoney value={state.lastBid} />
          </div>
          <div className="mt-1 h-5 text-sm font-medium text-white/60">
            {state.lastBid > 0 && state.bidder != null ? (
              <>held by <span className="font-semibold text-white">{state.names[state.bidder]}</span></>
            ) : (
              <span className="animate-pulse text-neon-gold">no bid yet — {turnName} to open</span>
            )}
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="mt-4">
        {active && iAmTurn ? (
          <div className="animate-float-in space-y-3">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => step(-BID_STEP)}
                disabled={draft <= MIN_BID}
                className="glass h-12 w-12 rounded-xl font-display text-2xl font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-30"
              >
                −
              </button>
              <div className="flex h-12 min-w-28 items-center justify-center rounded-xl border border-white/15 bg-black/40 px-2">
                <DraftInput draft={draft} setDraft={setDraft} minDraft={minDraft} maxDraft={maxDraft} onBid={onBid} className="text-2xl" />
              </div>
              <button
                onClick={() => step(BID_STEP)}
                disabled={draft >= maxDraft}
                className="glass h-12 w-12 rounded-xl font-display text-2xl font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-30"
              >
                +
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {quick.map((q) => (
                <button
                  key={q}
                  onClick={() => setDraft(q)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                    draft === q
                      ? "border-neon-green/60 bg-neon-green/15 text-neon-green"
                      : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                  )}
                >
                  {fmtMoney(q, 1)}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => onBid(draft)}
                disabled={!draftOk}
                className="flex-1 rounded-xl bg-gradient-to-r from-neon-green to-emerald-500 py-3.5 font-display text-lg font-extrabold uppercase tracking-wider text-black shadow-glow transition hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:shadow-none"
              >
                {isResponse ? "Raise" : "Bid"}
              </button>
              {isResponse && (
                <button
                  onClick={onFold}
                  className="rounded-xl border border-red-400/40 bg-red-500/15 px-6 py-3.5 font-display text-lg font-extrabold uppercase tracking-wider text-red-300 transition hover:bg-red-500/25 active:scale-95"
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
            <p className="font-display text-lg font-semibold uppercase tracking-wider text-neon-cyan">
              {turnName} is thinking…
            </p>
          </div>
        ) : (
          <div className="py-4 text-center">
            <div className="font-display text-lg font-bold text-neon-gold">
              {state.bidder != null && state.phase === "round"
                ? `${state.names[state.bidder]} wins the round`
                : "Draft complete"}
            </div>
            <button
              onClick={onNext}
              disabled={!canNext}
              className={cn(
                "mt-3 w-full rounded-xl bg-gradient-to-r from-neon-cyan to-cyan-500 py-3.5 font-display text-lg font-extrabold uppercase tracking-wider text-black transition hover:brightness-110 active:scale-95",
                !canNext && "opacity-40"
              )}
            >
              {isEnd ? "See Results" : "Next Round"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
