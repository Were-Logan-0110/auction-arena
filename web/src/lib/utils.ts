import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtMoney(amount: number, digits = 1): string {
  return `€${amount.toFixed(digits)}M`;
}

export function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}

/**
 * Route sofifa headshots through our own backend proxy — sofifa hotlink-
 * blocks direct embedding, so the backend fetches them with spoofed headers
 * (see /api/img-proxy in server.py). Non-sofifa URLs pass through untouched.
 */
export function proxiedImg(u: string | null | undefined): string | null {
  if (!u) return null;
  if (!u.includes("sofifa")) return u;
  return `${import.meta.env.BASE_URL}api/img-proxy?u=${encodeURIComponent(u)}`;
}

/** Smaller fallback size for a sofifa image URL (_360/_120 -> _60). */
export function smallImg(u: string): string {
  return proxiedImg(u.replace(/_\d+\./, "_60.")) ?? u;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function countUp(target: number, onFrame: (v: number) => void, ms = 500): () => void {
  let rafId = 0;
  const start = performance.now();
  const from = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    onFrame(from + (target - from) * eased);
    if (t < 1) rafId = requestAnimationFrame(tick);
    else onFrame(target);
  };
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}
