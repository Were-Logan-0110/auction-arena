import { useEffect, useRef, useState } from "react";
import { MIN_BID } from "../lib/types";
import { roundHalf } from "../lib/utils";
import { cn } from "../lib/utils";

interface Props {
  draft: number;
  setDraft: (v: number) => void;
  minDraft: number;
  maxDraft: number;
  onBid?: (v: number) => void;
  className?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Editable bid amount: type any number — it commits to the draft as you type
 * (clamped to the legal range, rounded to the half-step), Enter submits. */
export function DraftInput({ draft, setDraft, minDraft, maxDraft, onBid, className }: Props) {
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  // resync the display when the draft changes externally (reset, steps, chips)
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(null);
  }, [draft]);

  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (!isNaN(v)) setDraft(roundHalf(clamp(v, minDraft, maxDraft)));
  };

  return (
    <input
      ref={ref}
      inputMode="decimal"
      aria-label="Bid amount"
      value={text ?? String(draft)}
      onChange={(e) => {
        const raw = e.target.value;
        if (/^\d*\.?\d{0,2}$/.test(raw)) {
          setText(raw);
          if (raw !== "" && !raw.endsWith(".")) commit(raw);
        }
      }}
      onFocus={() => setText(String(draft))}
      onBlur={() => setText(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = parseFloat(text ?? String(draft));
          if (!isNaN(v)) {
            const amt = roundHalf(clamp(v, minDraft, maxDraft));
            setDraft(amt);
            setText(null);
            onBid?.(amt);
          }
        }
      }}
      className={cn("w-full bg-transparent text-center font-display font-extrabold text-white outline-none", className)}
    />
  );
}
