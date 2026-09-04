import { useState } from "react";
import { motion } from "framer-motion";
import { useGame, type PlayType } from "../store/useGame";
import { MODE_CONFIG, POWER_META, type Mode, type Pos, type PowerId } from "../lib/types";
import { cn, fmtMoney } from "../lib/utils";
import { SettingsPanel } from "../components/SettingsPanel";

const PLAY_TYPES: { id: PlayType; title: string; desc: string }[] = [
  { id: "ai", title: "vs Computer", desc: "Draft against a smart AI" },
  { id: "hotseat", title: "Local 2P", desc: "Pass & play on one device" },
  { id: "online", title: "Online", desc: "Challenge a friend" },
];

/** Static class maps so Tailwind can see every variant. */
const POWER_STYLE: Record<PowerId, { activeCard: string; iconBg: string; text: string; pill: string }> = {
  lastBid: {
    activeCard: "border-neon-gold/70 shadow-glow-gold bg-gradient-to-b from-neon-gold/15 to-transparent",
    iconBg: "bg-gradient-to-br from-amber-300 to-yellow-600",
    text: "text-neon-gold",
    pill: "bg-neon-gold/20 text-neon-gold ring-neon-gold/40",
  },
  wildcard: {
    activeCard: "border-neon-pink/70 shadow-glow-pink bg-gradient-to-b from-neon-pink/15 to-transparent",
    iconBg: "bg-gradient-to-br from-fuchsia-400 to-purple-600",
    text: "text-neon-pink",
    pill: "bg-neon-pink/20 text-neon-pink ring-neon-pink/40",
  },
  noRisk: {
    activeCard: "border-red-400/70 shadow-glow-red bg-gradient-to-b from-red-500/15 to-transparent",
    iconBg: "bg-gradient-to-br from-red-400 to-rose-700",
    text: "text-red-300",
    pill: "bg-red-500/20 text-red-300 ring-red-400/40",
  },
};

const POS_COLOR: Record<Pos, string> = {
  GK: "border-white/30 text-white/70",
  CB: "border-neon-cyan/60 text-neon-cyan",
  LB: "border-neon-cyan/60 text-neon-cyan",
  RB: "border-neon-cyan/60 text-neon-cyan",
  CM: "border-neon-gold/60 text-neon-gold",
  LW: "border-red-400/70 text-red-300",
  RW: "border-red-400/70 text-red-300",
  CF: "border-red-400/70 text-red-300",
};

export default function Home() {
  const { mode, setMode, playType, setPlayType, startLocal, onlineCreate, onlineJoin, powers, togglePower } =
    useGame();
  const [p1, setP1] = useState("Player 1");
  const [p2, setP2] = useState("Player 2");
  const [code, setCode] = useState("");
  const [name, setName] = useState("Guest");
  const [formationIdx, setFormationIdx] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const start = () => {
    const formations = MODE_CONFIG[mode].formations;
    const formation = formations[formationIdx] ?? formations[0];
    if (playType === "ai") {
      startLocal(mode, "ai", [p1 || "You", "CPU"], formation);
    } else if (playType === "hotseat") {
      startLocal(mode, "hotseat", [p1 || "Player 1", p2 || "Player 2"], formation);
    } else {
      onlineCreate(mode, name || "Guest", formation);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-10">
      <button
        onClick={() => setSettingsOpen(true)}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
        aria-label="Settings"
      >
        ⚙️
      </button>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="font-display text-sm font-bold uppercase tracking-[0.5em] text-neon-cyan text-glow-cyan">
          Football · Auction · Draft
        </div>
        <h1 className="mt-2 font-display text-7xl font-extrabold uppercase leading-none tracking-tight text-white sm:text-8xl">
          Auction<span className="text-neon-green text-glow-green">Arena</span>
        </h1>
        <p className="mt-3 text-white/60">
          Blind-card bidding. Win the star, take the mystery. Build the stronger squad.
        </p>
      </motion.div>

      {/* mode */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-10 w-full"
      >
        <Label>Format</Label>
        <div className="grid grid-cols-2 gap-3">
          {([5, 11] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "glass rounded-2xl p-4 text-left transition hover:bg-white/10",
                mode === m && "border-neon-green/60 shadow-glow"
              )}
            >
              <div className="font-display text-4xl font-extrabold text-white">{m}v{m}</div>
              <div className="text-xs text-white/50">
                {fmtMoney(MODE_CONFIG[m].budget, 0)} budget · {MODE_CONFIG[m].formations[0].length} rounds
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* formation */}
      {mode === 5 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-6 w-full"
        >
          <Label>Formation</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODE_CONFIG[mode].formations.map((f, i) => (
              <button
                key={i}
                onClick={() => setFormationIdx(i)}
                className={cn(
                  "glass rounded-2xl p-4 transition hover:bg-white/10",
                  formationIdx === i && "border-neon-gold/60 shadow-glow-gold"
                )}
              >
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {f.map((pos, j) => (
                    <span
                      key={j}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-black/40 font-display text-[11px] font-extrabold",
                        POS_COLOR[pos]
                      )}
                    >
                      {pos}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-center font-display text-sm font-bold uppercase text-white">
                  {f.join("-")}
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* game changers */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="mt-6 w-full"
      >
        <Label>
          Game Changers <span className="normal-case tracking-normal text-white/25">· optional powers</span>
        </Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(Object.keys(POWER_META) as PowerId[]).map((id) => {
            const meta = POWER_META[id];
            const on = powers[id];
            const style = POWER_STYLE[id];
            return (
              <button
                key={id}
                onClick={() => togglePower(id)}
                aria-pressed={on}
                className={cn(
                  "glass group relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-300 hover:bg-white/10",
                  on ? style.activeCard : "opacity-70 hover:opacity-100"
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`power-shine-${id}`}
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.12)_48%,transparent_62%)] bg-[length:200%_100%] animate-shimmer"
                  />
                )}
                <div className="relative flex items-start justify-between">
                  <span
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition-transform duration-300",
                      style.iconBg,
                      on ? "scale-100 rotate-0" : "scale-90 grayscale-[0.6]"
                    )}
                  >
                    {meta.icon}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-display text-[10px] font-extrabold uppercase tracking-widest ring-1 transition",
                      on ? style.pill : "bg-white/5 text-white/40 ring-white/15"
                    )}
                  >
                    {on ? "ON" : "OFF"}
                  </span>
                </div>
                <div className={cn("relative mt-3 font-display text-lg font-extrabold uppercase tracking-wide", on ? style.text : "text-white/80")}>
                  {meta.title}
                </div>
                <div className="relative mt-1 text-xs leading-snug text-white/55">{meta.desc}</div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* play type */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 w-full"
      >
        <Label>Opponent</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLAY_TYPES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlayType(p.id)}
              className={cn(
                "glass rounded-2xl p-4 text-left transition hover:bg-white/10",
                playType === p.id && "border-neon-cyan/60 shadow-glow-cyan"
              )}
            >
              <div className="font-display text-lg font-bold uppercase text-white">{p.title}</div>
              <div className="mt-1 text-xs text-white/50">{p.desc}</div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* names / online */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6 w-full"
      >
        {playType === "online" ? (
          <div className="glass rounded-2xl p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Your name" value={name} onChange={setName} placeholder="e.g. MessiFan" />
              <Input
                label="Join with room code"
                value={code}
                onChange={(v) => setCode(v.toUpperCase())}
                placeholder="ABC123"
                optional
              />
            </div>
            <div className="mt-3 flex gap-3">
              <button onClick={start} className="btn-primary flex-1">Create Room</button>
              <button
                onClick={() => code.trim() && onlineJoin(code.trim(), name || "Guest")}
                disabled={!code.trim()}
                className="btn-secondary flex-1"
              >
                Join Room
              </button>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={playType === "ai" ? "Your name" : "Player 1"} value={p1} onChange={setP1} placeholder="Player 1" />
              {playType === "hotseat" && (
                <Input label="Player 2" value={p2} onChange={setP2} placeholder="Player 2" />
              )}
            </div>
            <button onClick={start} className="btn-primary mt-3 w-full">
              Start Auction
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.3em] text-white/40">
      {children}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-white/50">{label}</span>
        {optional && <span className="text-[10px] text-white/30">optional</span>}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={14}
        className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-neon-green/60"
      />
    </div>
  );
}
