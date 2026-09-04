import type { EngineState, Player } from "../lib/types";
import { cn } from "../lib/utils";
import { AnimatedMoney } from "./AnimatedMoney";
import { PowerSlots } from "./PowerSlots";

function teamRating(players: Player[]): number {
  if (players.length === 0) return 0;
  const sum = players.reduce((a, p) => a + p.overall, 0);
  return Math.round((sum / players.length) * 10) / 10;
}

interface Props {
  state: EngineState;
  you: number | null;
  active: number;
  canControl?: (idx: number) => boolean;
  onWildcard?: (idx: number) => void;
  onNoRisk?: (idx: number) => void;
}

export function TeamPanel({ state, you, active, canControl, onWildcard, onNoRisk }: Props) {
  const names = state.names;
  const initial = state.budget;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map((i) => {
        const squad = state.squads[i];
        const rating = teamRating(squad);
        const isMe = you === i;
        const isTurn = state.phase === "round" && state.turn === i && state.rounds[state.roundIdx]?.status === "bidding";
        const color = i === 0 ? "green" : "cyan";
        return (
          <div
            key={i}
            className={cn(
              "glass relative overflow-hidden rounded-2xl p-3 transition",
              isTurn && "ring-2 ring-neon-gold/70"
            )}
          >
            {/* accent glow */}
            <div
              className={cn(
                "pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl",
                color === "green" ? "bg-neon-green/15" : "bg-neon-cyan/15"
              )}
            />

            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-extrabold",
                  color === "green"
                    ? "border-neon-green bg-neon-green/15 text-neon-green"
                    : "border-neon-cyan bg-neon-cyan/15 text-neon-cyan"
                )}
              >
                {names[i][0] ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-display text-base font-bold uppercase tracking-wide text-white">
                    {names[i]}
                  </span>
                  {isMe && (
                    <span className="rounded bg-white/15 px-1.5 text-[9px] font-bold uppercase tracking-wider text-white/80">
                      you
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/50">
                  <span>{squad.length}/{state.formation.length} signed</span>
                  <span className="text-white/25">·</span>
                  <span className={color === "green" ? "text-neon-green/80" : "text-neon-cyan/80"}>
                    OVR {rating.toFixed(1)}
                  </span>
                </div>
              </div>
              {isTurn && (
                <span className="animate-pulse rounded-full bg-neon-gold/15 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-widest text-neon-gold">
                  bidding
                </span>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-end justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  Budget left
                </span>
                <AnimatedMoney value={state.budgets[i]} />
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

            {onWildcard && onNoRisk && (
              <PowerSlots
                state={state}
                idx={i}
                canControl={canControl ? canControl(i) : false}
                onWildcard={onWildcard}
                onNoRisk={onNoRisk}
              />
            )}
          </div>
          </div>
        );
      })}
    </div>
  );
}
