import { useEffect, useState } from "react";
import type { EngineState, Player, Pos } from "../lib/types";
import { POS_LABEL } from "../lib/types";
import { cn, fmtMoney, proxiedImg, smallImg } from "../lib/utils";

/**
 * Tactical board: a vertical pitch with round position tokens (photo + OVR),
 * no overlapping cards. The readable player cards live in a roster strip
 * below the pitch — big faces, full names, club, OVR — one row per team,
 * aligned 1:1 with the formation slots on the board.
 */
const HOME: Record<string, [number, number][]> = {
  "GK,CB,CM,CF,CF": [
    [50, 92], [50, 81], [50, 70], [38, 58], [62, 58],
  ],
  "GK,CB,CM,CM,CF": [
    [50, 92], [50, 81], [38, 70], [62, 70], [50, 58],
  ],
  "GK,CB,CB,CM,CF": [
    [50, 92], [38, 81], [62, 81], [50, 70], [50, 58],
  ],
  "GK,CB,CB,LB,RB,CM,CM,CM,LW,RW,CF": [
    [50, 92], [38, 80], [62, 80], [22, 82], [78, 82],
    [30, 68], [50, 70], [70, 68], [22, 58], [78, 58], [50, 56],
  ],
};

/** Away is a vertical mirror of home: same x, y -> 100 - y. */
function mirror(coords: [number, number][]): [number, number][] {
  return coords.map(([x, y]) => [x, 100 - y]);
}

/** Stretch a bottom-half formation to fill the whole pitch (single-team view). */
function spread(coords: [number, number][]): [number, number][] {
  return coords.map(([x, y]) => [16 + ((x - 22) * 68) / 56, 10 + ((y - 55) * 78) / 37]);
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0]?.[0] ?? "?");
}

function usePhoto(img: string | null) {
  const [src, setSrc] = useState(proxiedImg(img));
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setSrc(proxiedImg(img));
    setBroken(false);
  }, [img]);
  const onError = () => {
    if (!img || src?.includes("_60.")) setBroken(true);
    else setSrc(smallImg(img));
  };
  return { src, broken, onError };
}

/* ---------------- Pitch tokens ---------------- */

function PitchToken({ p, pos, owner, active, compact }: { p?: Player; pos: Pos; owner: 0 | 1; active: boolean; compact?: boolean }) {
  const photo = usePhoto(p?.img ?? null);
  return (
    <div className="relative flex flex-col items-center gap-1">
      <div
        className={cn(
          "relative overflow-hidden rounded-full border-[2.5px] shadow-lg",
          compact ? "h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14" : "h-14 w-14 sm:h-16 sm:w-16",
          active && "ring-2 ring-neon-gold/50",
          p
            ? owner === 0
              ? "border-neon-green shadow-[0_0_14px_rgba(34,224,138,0.4)]"
              : "border-neon-cyan shadow-[0_0_14px_rgba(46,230,214,0.4)]"
            : "border-dashed border-white/30 bg-black/30"
        )}
      >
        {p ? (
          p.img && !photo.broken ? (
            <img
              src={photo.src ?? undefined}
              alt={p.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={photo.onError}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-950 font-display text-xs font-extrabold text-white/70">
              {initials(p.name)}
            </div>
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-xs font-extrabold text-white/40">
            {pos}
          </div>
        )}
        {active && <div className="absolute inset-0 animate-ping rounded-full bg-neon-gold/20" />}
      </div>
      {p && (
        <div className={cn("absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-black/90 font-display font-extrabold text-white shadow-lg ring-1 ring-white/60", compact ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]")}>
          {p.overall}
        </div>
      )}
      <span
        className={cn(
          "rounded px-1 font-display text-[10px] font-bold uppercase tracking-wider",
          active
            ? "bg-neon-gold/15 text-neon-gold"
            : p
              ? owner === 0
                ? "text-neon-green/90"
                : "text-neon-cyan/90"
              : "text-white/35"
        )}
      >
        {pos}
      </span>
    </div>
  );
}

/* ---------------- Roster cards (readable) ---------------- */

function RosterCard({ p, owner, active, price }: { p: Player; owner: 0 | 1; active: boolean; price?: number }) {
  const photo = usePhoto(p.img);
  return (
    <div
      className={cn(
        "w-28 shrink-0 overflow-hidden rounded-xl border-2 bg-slate-900/90 backdrop-blur-sm",
        active
          ? "border-neon-gold shadow-[0_0_16px_rgba(255,190,60,0.45)]"
          : owner === 0
            ? "border-neon-green/50"
            : "border-neon-cyan/50"
      )}
      title={`${p.name} · ${p.positions}`}
    >
      <div className="relative h-24 w-full overflow-hidden">
        {p.img && !photo.broken ? (
          <img
            src={photo.src ?? undefined}
            alt={p.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={photo.onError}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-700 to-slate-950 font-display text-lg font-extrabold text-white/70">
            {initials(p.name)}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent" />
        <div
          className={cn(
            "absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-b font-display text-sm font-extrabold text-black ring-1 ring-black/30",
            owner === 0 ? "from-emerald-300 to-emerald-500" : "from-cyan-300 to-cyan-500",
            active && "from-amber-300 to-amber-500"
          )}
        >
          {p.overall}
        </div>
      </div>
      <div className="p-2">
        <div className="font-display text-[11px] font-bold uppercase leading-tight text-white">{p.name}</div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span className="truncate text-[9px] text-white/45">{p.club ?? "—"}</span>
          {price != null && (
            <span className={cn("shrink-0 font-display text-[9px] font-extrabold uppercase", price > 0 ? "text-neon-gold/90" : "text-neon-green/80")}>
              {price > 0 ? fmtMoney(price) : "free"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RosterEmpty({ pos, active }: { pos: Pos; active: boolean }) {
  return (
    <div
      className={cn(
        "flex h-[150px] w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-white/[0.02]",
        active ? "border-neon-gold/70 bg-neon-gold/5" : "border-white/15"
      )}
    >
      <span className={cn("font-display text-sm font-extrabold uppercase", active ? "text-neon-gold" : "text-white/40")}>
        {pos}
      </span>
      <span className="text-[9px] uppercase tracking-widest text-white/30">{active ? "on auction" : "awaiting bid"}</span>
    </div>
  );
}

function RosterStrip({ state, auctionSlot }: { state: EngineState; auctionSlot: number }) {
  return (
    <div className="mt-3 space-y-3">
      {[0, 1].map((i) => (
        <div key={i}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className={cn("h-2.5 w-2.5 rounded-full", i === 0 ? "bg-neon-green" : "bg-neon-cyan")} />
            <span className="truncate font-display text-xs font-bold uppercase tracking-widest text-white/70">{state.names[i]}</span>
            <span className="ml-auto text-[10px] uppercase tracking-widest text-white/40">
              {state.formation.length} slots
            </span>
          </div>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {Array.from({ length: Math.max(state.formation.length, state.squads[i].length) }).map((_, si) => {
              const pos = state.formation[si];
              const p = state.squads[i][si];
              const active = si === auctionSlot;
              return p ? (
                <RosterCard key={si} p={p} owner={i as 0 | 1} active={active} price={state.prices?.[i]?.[si]} />
              ) : (
                <RosterEmpty key={si} pos={pos ?? "?"} active={active} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Pitch field ---------------- */

interface Props {
  state: EngineState;
}

export function PitchField({ state }: Props) {
  const key = state.formation.join(",");
  const home = HOME[key] ?? HOME["GK,CB,CM,CF,CF"];
  const away = mirror(home);
  const is11 = home.length === 11;
  const [view, setView] = useState<0 | 1>(0);
  const auctionSlot = state.phase === "round" ? state.roundIdx : -1;
  const label = auctionSlot >= 0 ? POS_LABEL[state.formation[auctionSlot]] : null;
  const teamView = is11 ? view : null;
  const spreadHome = is11 ? spread(home) : home;
  const spreadAway = spreadHome.map(([x, y]) => [x, 100 - y]);
  const tokens = teamView === null ? home : teamView === 0 ? spreadHome : spreadAway;

  return (
    <div className="min-w-0">
      {is11 && (
        <div className="mb-2 flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 sm:mx-auto sm:w-fit sm:gap-0">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setView(i as 0 | 1)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 font-display text-xs font-bold uppercase tracking-widest transition sm:flex-none sm:px-5",
                view === i
                  ? i === 0
                    ? "bg-neon-green/15 text-neon-green ring-1 ring-neon-green/40"
                    : "bg-neon-cyan/15 text-neon-cyan ring-1 ring-neon-cyan/40"
                  : "text-white/45 hover:text-white/80"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", i === 0 ? "bg-neon-green" : "bg-neon-cyan")} />
              {state.names[i]}
            </button>
          ))}
        </div>
      )}
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#082d18] sm:mx-auto sm:w-fit">
        <div
          className={cn(
            "relative w-full",
            is11 ? "aspect-[9/18]" : "aspect-[9/15]",
            is11
              ? "sm:aspect-auto sm:h-[min(calc(100vh_-_210px),860px)] sm:w-[min(calc((100vh_-_210px)_*_0.85),612px)]"
              : "sm:aspect-auto sm:h-[min(calc(100vh_-_200px),780px)] sm:w-[min(calc((100vh_-_200px)_*_0.9),612px)]"
          )}
          style={{
            background:
              "linear-gradient(180deg, #0b4423 0%, #0a3a1d 45%, #083c1f 55%, #0b4423 100%)",
          }}
        >
          {/* mow stripes */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 30px, transparent 30px 60px)",
            }}
          />
          {/* vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_55%,rgba(0,0,0,0.45)_100%)]" />

          {/* markings */}
          <div className="absolute inset-x-[5%] inset-y-[3%] rounded-[3%] border-2 border-white/25" />
          <div className="absolute left-[5%] right-[5%] top-1/2 h-0.5 bg-white/25" />
          <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
          <div className="absolute left-[20%] right-[20%] top-[3%] h-[11%] rounded-b-[10%] border-2 border-t-0 border-white/25" />
          <div className="absolute left-[20%] right-[20%] bottom-[3%] h-[11%] rounded-t-[10%] border-2 border-b-0 border-white/25" />
          <div className="absolute left-[35%] right-[35%] top-[1%] h-[4%] rounded-b border-2 border-t-0 border-white/40 bg-white/10" />
          <div className="absolute left-[35%] right-[35%] bottom-[1%] h-[4%] rounded-t border-2 border-b-0 border-white/40 bg-white/10" />

          {/* half labels */}
          <div className="absolute left-[7%] top-[7%] font-display text-xs font-extrabold uppercase tracking-[0.25em] text-neon-cyan/80 drop-shadow-lg sm:text-sm">
            {state.names[1]}
          </div>
          <div className="absolute left-[7%] bottom-[7%] font-display text-xs font-extrabold uppercase tracking-[0.25em] text-neon-green/80 drop-shadow-lg sm:text-sm">
            {state.names[0]}
          </div>

          {/* tokens */}
          {tokens.map(([x, y], i) => {
            const pos = state.formation[i];
            const isAuction = i === auctionSlot;
            if (teamView === null) {
              const p0 = state.squads[0][i];
              const p1 = state.squads[1][i];
              return (
                <div key={i}>
                  <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                    <PitchToken p={p0} pos={pos} owner={0} active={isAuction} />
                  </div>
                  <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${away[i][0]}%`, top: `${away[i][1]}%` }}>
                    <PitchToken p={p1} pos={pos} owner={1} active={isAuction} />
                  </div>
                </div>
              );
            }
            const p = state.squads[teamView][i];
            return (
              <div key={i} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                <PitchToken p={p} pos={pos} owner={teamView} active={isAuction} compact />
              </div>
            );
          })}

          {/* current auction banner */}
          {label && (
            <div className="absolute inset-x-0 bottom-[2%] z-20 flex justify-center">
              <div className="rounded-full bg-black/60 px-4 py-1 font-display text-xs font-bold uppercase tracking-[0.3em] text-neon-gold backdrop-blur-md ring-1 ring-neon-gold/40">
                Auctioning · {label}
              </div>
            </div>
          )}
        </div>
      </div>

      <RosterStrip state={state} auctionSlot={auctionSlot} />
    </div>
  );
}
