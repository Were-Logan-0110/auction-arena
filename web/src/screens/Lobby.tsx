import { motion } from "framer-motion";
import { useState } from "react";
import { useGame } from "../store/useGame";
import { POWER_META, type PowerId } from "../lib/types";
import { cn } from "../lib/utils";

export default function Lobby() {
  const { roomCode, myIdx, onlineStart, leaveRoom, powers } = useGame();
  const [copied, setCopied] = useState(false);
  const activePowers = (Object.keys(POWER_META) as PowerId[]).filter((id) => powers[id]);

  const copy = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass w-full rounded-3xl p-8 text-center"
      >
        <div className="font-display text-sm font-bold uppercase tracking-[0.4em] text-neon-cyan">
          Room created
        </div>
        <div className="mt-4 font-display text-6xl font-extrabold tracking-widest text-white">
          {roomCode}
        </div>
        <button onClick={copy} className="mt-3 text-xs font-semibold text-white/50 hover:text-white">
          {copied ? "Copied ✓" : "Tap to copy code"}
        </button>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/60">
          <span className="h-2 w-2 animate-ping rounded-full bg-neon-green" />
          {myIdx === 0 ? "Waiting for your opponent to join…" : "Waiting for the host to start…"}
        </div>

        {activePowers.length > 0 && (
          <div className="mt-5">
            <div className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
              Game Changers in play
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {activePowers.map((id) => (
                <span
                  key={id}
                  className={cn(
                    "rounded-full border bg-black/30 px-3 py-1 font-display text-xs font-bold uppercase tracking-wider",
                    id === "lastBid" && "border-neon-gold/50 text-neon-gold",
                    id === "wildcard" && "border-neon-pink/50 text-neon-pink",
                    id === "noRisk" && "border-red-400/50 text-red-300"
                  )}
                >
                  {POWER_META[id].icon} {POWER_META[id].title}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={onlineStart}
            disabled={myIdx !== 0}
            className={cn(
              "btn-primary w-full",
              myIdx !== 0 && "opacity-30"
            )}
          >
            Start Draft
          </button>
          <button onClick={leaveRoom} className="btn-secondary mt-3 w-full">
            Leave Room
          </button>
        </div>
      </motion.div>
    </div>
  );
}
