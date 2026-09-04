import { motion } from "framer-motion";
import { useState } from "react";
import type { EngineState } from "../lib/types";
import { primaryPosLabel } from "../lib/types";
import { cn, fmtMoney, proxiedImg } from "../lib/utils";

interface Props {
  state: EngineState;
  idx: number;
  onPick: (playerId: number) => void;
  onClose: () => void;
}

/** WILDCARD step 1: choose which of your own players you're willing to lose.
 *  Their replacement is rolled by your leftover-budget luck afterwards. */
export function WildcardPicker({ state, idx, onPick, onClose }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const squad = state.squads[idx];

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
        className="glass relative w-full max-w-lg overflow-hidden rounded-3xl p-5 shadow-glow-pink sm:p-6"
      >
        <div className="text-center">
          <div className="font-display text-xs font-bold uppercase tracking-[0.35em] text-white/45">
            {state.names[idx]} activates
          </div>
          <div className="mt-1 font-display text-3xl font-extrabold uppercase text-neon-pink">🎰 Wildcard</div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/60">
            Pick the player you're willing to lose — your leftover{" "}
            <span className="font-bold text-neon-gold">{fmtMoney(state.budgets[idx])}</span> luck decides who replaces them.
          </p>
        </div>

        <div className="no-scrollbar mt-4 grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {squad.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "group flex items-center gap-2 rounded-xl border bg-white/[0.03] p-1.5 text-left transition active:scale-95",
                hovered === p.id
                  ? "border-neon-pink/70 bg-neon-pink/10 shadow-glow-pink"
                  : "border-white/10 hover:border-neon-pink/40"
              )}
            >
              <span className="relative h-11 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15">
                {p.img ? (
                  <img
                    src={proxiedImg(p.img) ?? undefined}
                    alt={p.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover object-top"
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-xs font-bold uppercase leading-tight text-white">{p.name}</span>
                <span className="block text-[10px] text-white/40">
                  {primaryPosLabel(p)} · OVR {p.overall}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-white/60 transition hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
