import { useEffect, useMemo, useState } from "react";
import type { EngineState } from "./types";
import { BID_STEP, MIN_BID } from "./types";
import { roundHalf } from "./utils";
import type { PlayType } from "../store/useGame";

/**
 * Shared bidding logic for the desktop BidPanel and the mobile auction tab:
 * draft amount, validity, quick amounts and keyboard handling.
 */
export interface BidDraft {
  draft: number;
  setDraft: (v: number) => void;
  step: (d: number) => void;
  active: boolean;
  isOpen: boolean;
  isResponse: boolean;
  iAmTurn: boolean;
  minDraft: number;
  maxDraft: number;
  draftOk: boolean;
  canRaise: boolean;
  quick: number[];
}

export function useBidDraft(
  state: EngineState,
  playType: PlayType,
  myIdx: number | null
): BidDraft {
  const round = state.rounds[state.roundIdx];
  const [draft, setDraft] = useState(() => Math.max(MIN_BID, roundHalf(5)));

  const active = state.phase === "round" && round?.status === "bidding";
  const isResponse = active && state.status === "response";
  const isOpen = active && state.status === "open";
  const iAmTurn =
    active &&
    (playType === "hotseat"
      ? true
      : playType === "ai"
        ? state.turn === 0
        : state.turn === myIdx);

  const minDraft = isResponse ? roundHalf(state.lastBid + BID_STEP) : MIN_BID;
  const maxDraft = Math.max(0, roundHalf(state.budgets[state.turn] - MIN_BID));

  useEffect(() => {
    if (active) setDraft((p) => roundHalf(isOpen ? Math.min(5, maxDraft) : Math.max(minDraft, p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roundIdx, state.status, state.lastBid]);

  const step = (d: number) => setDraft((p) => roundHalf(Math.min(maxDraft, Math.max(MIN_BID, p + d))));

  const quick = useMemo(() => {
    const base = isResponse ? minDraft : 0;
    return [base + 1, base + 2.5, base + 5].filter((x) => x <= maxDraft);
  }, [isResponse, minDraft, maxDraft]);

  const draftOk = iAmTurn && draft >= minDraft && draft <= maxDraft && draft >= MIN_BID;
  const canRaise = iAmTurn && maxDraft >= roundHalf(state.lastBid + BID_STEP);

  return { draft, setDraft, step, active, isOpen, isResponse, iAmTurn, minDraft, maxDraft, draftOk, canRaise, quick };
}

/** ↑/↓ adjust the draft, Enter bids, F folds. */
export function useBidKeys(
  active: boolean,
  iAmTurn: boolean,
  draft: number,
  draftOk: boolean,
  isResponse: boolean,
  step: (d: number) => void,
  onBid: (amount: number) => void,
  onFold: () => void
) {
  useEffect(() => {
    if (!active || !iAmTurn) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const k = e.key;
      if (k === "ArrowUp" || k === "+" || k === "ArrowRight") {
        e.preventDefault();
        step(BID_STEP);
      } else if (k === "ArrowDown" || k === "-" || k === "ArrowLeft") {
        e.preventDefault();
        step(-BID_STEP);
      } else if (k === "Enter") {
        if (draftOk) {
          e.preventDefault();
          onBid(draft);
        }
      } else if ((k === "f" || k === "F") && isResponse) {
        e.preventDefault();
        onFold();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, iAmTurn, draft, draftOk, isResponse]);
}
