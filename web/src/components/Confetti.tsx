import { motion } from "framer-motion";
import { useMemo } from "react";

const COLORS = ["#22e08a", "#2ee6d6", "#ffc95e", "#ff5ec9", "#ffffff"];

export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        dur: 2.5 + Math.random() * 2,
        rot: Math.random() * 720 - 360,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w: 6 + Math.random() * 6,
        h: 10 + Math.random() * 8,
        drift: Math.random() * 120 - 60,
      })),
    [count]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -40, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: "110vh", x: p.drift, rotate: p.rot, opacity: [1, 1, 0.9, 0.7] }}
          transition={{ duration: p.dur, delay: p.delay, ease: "linear" }}
          className="absolute"
          style={{ left: `${p.left}%`, width: p.w, height: p.h, backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}
