import type { EngineState } from "../lib/types";
import { cn } from "../lib/utils";

interface Props {
  state: EngineState;
  idx: number;
  /** Whether this client is allowed to fire powers for this team. */
  canControl: boolean;
  onWildcard: (idx: number) => void;
  onNoRisk: (idx: number) => void;
}

/** Per-team Game Changer slots: the passive LAST BID charm plus the two
 *  one-shot cards (WILDCARD / NO RISK NO FUN) when the host enabled them.
 *  The two cards are ENDGAME only — they unlock once every slot is signed. */
export function PowerSlots({ state, idx, canControl, onWildcard, onNoRisk }: Props) {
  const powers = state.powers;
  if (!powers || (!powers.lastBid && !powers.wildcard && !powers.noRisk)) return null;
  const used = state.powerUsed?.[idx];
  const endgame = state.phase === "end";
  const squadSize = state.squads[idx]?.length ?? 0;

  const wildReady = endgame && powers.wildcard && !!used && !used.wildcard;
  const riskReady = endgame && powers.noRisk && !!used && !used.noRisk;

  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      {powers.lastBid && (
        <span
          title="Last Bid: backing down signs the hidden player for your last bid"
          className="flex items-center gap-1 rounded-lg border border-neon-gold/40 bg-neon-gold/10 px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-wider text-neon-gold"
        >
          💰 Last Bid
        </span>
      )}
      {powers.wildcard && (
        <button
          onClick={() => wildReady && canControl && onWildcard(idx)}
          disabled={!wildReady || !canControl}
          title={
            used?.wildcard
              ? "Wildcard spent"
              : endgame
                ? "Wildcard: pick one of your players to risk — budget luck rolls their replacement"
                : "Unlocks at the end of the draft, once every slot is signed"
          }
          className={cn(
            "flex items-center gap-1 rounded-lg border px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-wider transition",
            wildReady
              ? "animate-pulse border-neon-pink/60 bg-neon-pink/15 text-neon-pink shadow-glow-pink hover:brightness-125 hover:animate-none active:scale-95"
              : used?.wildcard
                ? "border-white/10 bg-white/5 text-white/30 line-through decoration-neon-pink/60"
                : "border-white/10 bg-white/5 text-white/30"
          )}
        >
          🎰 Wildcard{!wildReady && !used?.wildcard && !endgame ? " 🔒" : ""}
        </button>
      )}
      {powers.noRisk && (
        <button
          onClick={() => riskReady && squadSize > 0 && canControl && onNoRisk(idx)}
          disabled={!riskReady || squadSize === 0 || !canControl}
          title={
            used?.noRisk
              ? "No Risk No Fun spent"
              : !endgame
                ? "Unlocks at the end of the draft, once every slot is signed"
                : squadSize === 0
                  ? "Sign at least one player first"
                  : "Feed a random signing into the machine — better… or worse"
          }
          className={cn(
            "flex items-center gap-1 rounded-lg border px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-wider transition",
            riskReady && squadSize > 0
              ? "animate-pulse border-red-400/60 bg-red-500/15 text-red-300 shadow-glow-red hover:brightness-125 hover:animate-none active:scale-95"
              : used?.noRisk
                ? "border-white/10 bg-white/5 text-white/30 line-through decoration-red-400/60"
                : "border-white/10 bg-white/5 text-white/30"
          )}
        >
          🃏 No Risk No Fun{!riskReady && !used?.noRisk && (!endgame || squadSize === 0) ? " 🔒" : ""}
        </button>
      )}
    </div>
  );
}
