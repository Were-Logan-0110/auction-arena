import { AnimatePresence, motion } from "framer-motion";
import type { EngineState } from "../lib/types";
import { primaryPosLabel } from "../lib/types";
import { cn, fmtMoney } from "../lib/utils";
import { PlayerCard } from "./PlayerCard";

interface Props {
  state: EngineState;
  open: boolean;
  onClose: () => void;
}

export function RevealOverlay({ state, open, onClose }: Props) {
  const round = state.rounds[state.roundIdx];
  const winner = round?.winner;
  const wild = round?.via === "wildcard";

  return (
    <AnimatePresence>
      {open && winner != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 30 }}
            className={cn(
              "glass w-full max-w-md rounded-3xl p-6 text-center",
              wild && "border-neon-pink/50 shadow-glow-pink"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {wild ? (
              <>
                <div className="font-display text-xs font-bold uppercase tracking-[0.3em] text-neon-pink">
                  🎰 Wildcard · Round {state.roundIdx + 1}
                </div>
                <div className="mt-1 font-display text-3xl font-extrabold uppercase text-white">
                  {state.names[winner]} gambles on luck
                </div>
                <p className="mt-2 text-sm text-white/60">
                  The star card was tossed aside — the arena rolled a mystery signing weighted by{" "}
                  {state.names[winner]}'s budget luck. Free transfer!
                </p>
              </>
            ) : (
              <>
                <div className="font-display text-xs font-bold uppercase tracking-[0.3em] text-white/50">
                  {primaryPosLabel(round.visible)} · Round {state.roundIdx + 1}
                </div>
                <div className="mt-1 font-display text-3xl font-extrabold uppercase text-neon-gold text-glow-gold">
                  {state.names[winner]} wins the auction
                </div>
              </>
            )}

            <div className="mt-6 flex items-center justify-center gap-3">
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="w-36"
              >
                <PlayerCard player={round.visible} size="md" revealed />
                <div className={cn("mt-2 text-xs font-bold", wild ? "text-neon-pink" : "text-neon-green")}>
                  {wild ? "WON · FREE TRANSFER" : `WON · ${fmtMoney(round.wonAmount)}`}
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 }}
                className="w-36"
              >
                <PlayerCard player={round.hidden} size="md" revealed />
                <div className="mt-2 text-xs font-bold text-neon-cyan">
                  {state.names[winner === 0 ? 1 : 0]} · mystery
                </div>
              </motion.div>
            </div>

            <p className="mt-4 text-sm text-white/60">
              The mystery card goes to {state.names[winner === 0 ? 1 : 0]}.
            </p>

            <button
              onClick={onClose}
              className={cn(
                "mt-5 w-full rounded-xl py-3 font-display text-lg font-extrabold uppercase tracking-wider transition hover:brightness-110 active:scale-95",
                wild
                  ? "bg-gradient-to-r from-fuchsia-400 to-purple-600 text-black shadow-glow-pink"
                  : "bg-gradient-to-r from-neon-green to-emerald-500 text-black shadow-glow"
              )}
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
