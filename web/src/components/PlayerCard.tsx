import { useState } from "react";
import { cn, proxiedImg, smallImg } from "../lib/utils";
import type { Player } from "../lib/types";

const FLAGS: Record<string, string> = {
  Brazil: "🇧🇷",
  Argentina: "🇦🇷",
  France: "🇫🇷",
  England: "🏴",
  Portugal: "🇵🇹",
  Spain: "🇪🇸",
  Germany: "🇩🇪",
  Italy: "🇮🇹",
  Netherlands: "🇳🇱",
  Belgium: "🇧🇪",
  Croatia: "🇭🇷",
  Norway: "🇳🇴",
  Morocco: "🇲🇦",
  Senegal: "🇸🇳",
  Nigeria: "🇳🇬",
  Egypt: "🇪🇬",
  Poland: "🇵🇱",
  Denmark: "🇩🇰",
  Uruguay: "🇺🇾",
  Colombia: "🇨🇴",
  USA: "🇺🇸",
  Japan: "🇯🇵",
  "South Korea": "🇰🇷",
  Mexico: "🇲🇽",
  Switzerland: "🇨🇭",
  Austria: "🇦🇹",
  Wales: "🏴",
  Scotland: "🏴",
  Sweden: "🇸🇪",
  Turkey: "🇹🇷",
  "Czech Republic": "🇨🇿",
};

function rarity(p: Player): { ring: string; glow: string; badge: string; line: string } {
  if (p.overall >= 88)
    return {
      ring: "border-amber-400/80",
      glow: "shadow-[0_0_28px_rgba(255,201,94,0.35)]",
      badge: "from-amber-300 to-amber-500 text-black",
      line: "from-amber-300/80 to-amber-500/10",
    };
  if (p.overall >= 84)
    return {
      ring: "border-cyan-400/80",
      glow: "shadow-[0_0_28px_rgba(46,230,214,0.3)]",
      badge: "from-cyan-300 to-cyan-500 text-black",
      line: "from-cyan-300/80 to-cyan-500/10",
    };
  if (p.overall >= 78)
    return {
      ring: "border-emerald-400/70",
      glow: "shadow-[0_0_24px_rgba(34,224,138,0.28)]",
      badge: "from-emerald-300 to-emerald-500 text-black",
      line: "from-emerald-300/80 to-emerald-500/10",
    };
  return {
    ring: "border-white/20",
    glow: "shadow-[0_0_18px_rgba(0,0,0,0.4)]",
    badge: "from-slate-400 to-slate-600 text-white",
    line: "from-slate-400/60 to-transparent",
  };
}

function initials(p: Player): string {
  const parts = (p.full_name || p.name || "?").split(" ").filter(Boolean);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0]?.[0] ?? "?");
}

const SIZES = {
  sm: { overall: "text-lg", badge: "h-6 w-6 text-sm", pos: "px-1 py-px text-[7px]", name: "text-[10px]", club: "text-[8px]", padding: "p-1", flag: "text-[9px]" },
  md: { overall: "text-3xl", badge: "h-11 w-11 text-xl", pos: "px-1.5 py-0.5 text-[9px]", name: "text-base", club: "text-[11px]", padding: "p-2", flag: "text-xs" },
  lg: { overall: "text-5xl", badge: "h-16 w-16 text-3xl", pos: "px-2 py-1 text-xs", name: "text-3xl", club: "text-sm", padding: "p-3", flag: "text-lg" },
};

interface Props {
  player: Player;
  size?: keyof typeof SIZES;
  className?: string;
  faceDown?: boolean;
  revealed?: boolean;
}

export function PlayerCard({ player, size = "md", className, faceDown, revealed }: Props) {
  const [src, setSrc] = useState(proxiedImg(player.img));
  const [broken, setBroken] = useState(false);
  const r = rarity(player);
  const s = SIZES[size];
  const flag = player.nation ? FLAGS[player.nation] : null;

  const onImgError = () => {
    if (src?.includes("_60.")) {
      setBroken(true);
    } else {
      setSrc(smallImg(player.img ?? ""));
    }
  };

  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-full overflow-hidden rounded-xl border-2 bg-gradient-to-b from-slate-800 to-slate-950",
        r.ring,
        revealed ? r.glow : "shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
        className
      )}
    >
      {faceDown ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <span className="text-3xl opacity-40">🛡️</span>
          <span className="font-display text-sm font-semibold tracking-[0.3em] text-slate-400">
            ???
          </span>
        </div>
      ) : (
        <>
          {/* photo */}
          <div className="absolute inset-0">
            {player.img && !broken ? (
              <img
                src={src ?? undefined}
                alt={player.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={onImgError}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950">
                <span className="font-display text-4xl font-extrabold text-slate-500">
                  {initials(player)}
                </span>
              </div>
            )}
          </div>

          {/* scrims */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/30" />

          {/* rarity accent line */}
          <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r", r.line)} />
          {/* sheen */}
          <div className={cn("card-sheen pointer-events-none absolute inset-0", revealed && "revealed")} />

          {/* position tag */}
          <div className={cn("absolute inset-x-0 top-0 flex items-start justify-between gap-1", s.padding)}>
            <span
              className={cn(
                "rounded-md bg-black/45 font-display font-bold uppercase tracking-wider text-white/85 ring-1 ring-white/15 backdrop-blur-sm",
                s.pos
              )}
            >
              {player.positions}
            </span>
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-b font-display font-extrabold shadow-lg ring-1 ring-white/30",
                s.badge,
                s.overall,
                r.badge
              )}
            >
              {player.overall}
            </div>
          </div>

          {/* name + club */}
          <div className={cn("absolute inset-x-0 bottom-0", s.padding)}>
            <div
              className={cn(
                "truncate font-display font-extrabold uppercase leading-tight tracking-wide text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.9)]",
                s.name
              )}
            >
              {player.name}
            </div>
            <div className={cn("mt-0.5 flex items-center gap-1 font-medium text-slate-300", s.club)}>
              {flag && <span className={s.flag}>{flag}</span>}
              <span className="truncate">
                {player.club ?? "—"}
                {player.legend ? " ★" : ""}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
