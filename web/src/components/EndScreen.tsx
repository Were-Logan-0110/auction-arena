import { motion } from "framer-motion";
import type { EngineState, Player } from "../lib/types";
import { cn, fmtMoney } from "../lib/utils";
import { Confetti } from "./Confetti";
import { PlayerCard } from "./PlayerCard";

function squadTotal(players: Player[]) {
  return players.reduce((a, p) => a + p.overall, 0);
}

interface Props {
  state: EngineState;
  onClose: () => void;
  onRematch: () => void;
  onMatch: () => void;
  onHome: () => void;
}

export function EndScreen({ state, onClose, onRematch, onMatch, onHome }: Props) {
  const w = state.winner;
  const winner = w === null ? null : state.names[w];
  const t0 = squadTotal(state.squads[0]);
  const t1 = squadTotal(state.squads[1]);
  const isDraw = w === null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-black/85 backdrop-blur-md">
      <button
        onClick={onClose}
        className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/60 font-display text-lg font-bold text-white/70 transition hover:bg-white/10"
      >
        ✕
      </button>
      {!isDraw && <Confetti />}
      <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="font-display text-sm font-bold uppercase tracking-[0.4em] text-white/50">
            Draft complete
          </div>
          <div
            className={cn(
              "mt-2 font-display text-4xl font-extrabold uppercase sm:text-6xl",
              isDraw ? "text-white" : "text-neon-gold text-glow-gold"
            )}
          >
            {isDraw ? "Draw!" : `${winner} wins!`}
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-white">
            {t0} <span className="text-white/40">–</span> {t1}
          </div>
          {!isDraw && (
            <div className="mt-1 text-sm text-white/50">
              Winner kept {fmtMoney(state.budgets[w!])} in the bank
            </div>
          )}
        </motion.div>

        <div className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-full", i === 0 ? "bg-neon-green" : "bg-neon-cyan")} />
                  <span className="font-display text-lg font-bold uppercase text-white">{state.names[i]}</span>
                </div>
                <span className="font-display text-2xl font-extrabold text-white">{i === 0 ? t0 : t1}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {state.squads[i].map((p) => (
                  <div key={p.id} className="w-16">
                    <PlayerCard player={p} size="sm" />
                    <div className="mt-1 text-center font-display text-xs font-bold text-white/80">
                      {p.overall}
                    </div>
                  </div>
                ))}
                {state.squads[i].length === 0 && (
                  <div className="text-sm text-white/40">No players won</div>
                )}
              </div>
              <div className="mt-3 border-t border-white/10 pt-2 text-xs text-white/50">
                Spent {fmtMoney(state.budget - state.budgets[i])} of {fmtMoney(state.budget)} · budget left {fmtMoney(state.budgets[i])}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:flex sm:justify-center sm:gap-4">
          <button
            onClick={onRematch}
            className="w-full rounded-xl bg-gradient-to-r from-neon-green to-emerald-500 px-8 py-3 font-display text-lg font-extrabold uppercase tracking-wider text-black shadow-glow transition hover:brightness-110 active:scale-95 sm:w-auto"
          >
            Rematch
          </button>
          <button
            onClick={onMatch}
            className="w-full rounded-xl bg-gradient-to-r from-neon-cyan to-sky-500 px-8 py-3 font-display text-lg font-extrabold uppercase tracking-wider text-black shadow-glow-cyan transition hover:brightness-110 active:scale-95 sm:w-auto"
          >
            Start Match
          </button>
          <button
            onClick={onHome}
            className="glass w-full rounded-xl px-8 py-3 font-display text-lg font-extrabold uppercase tracking-wider text-white transition hover:bg-white/10 sm:w-auto"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
