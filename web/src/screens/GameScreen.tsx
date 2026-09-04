import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useGame } from "../store/useGame";
import { TeamPanel } from "../components/TeamPanel";
import { PitchField } from "../components/PitchField";
import { BidPanel } from "../components/BidPanel";
import { RevealOverlay } from "../components/RevealOverlay";
import { EndScreen } from "../components/EndScreen";
import MobileGame from "../components/MobileGame";
import { PowerFX } from "../components/PowerFX";
import { WildcardPicker } from "../components/WildcardPicker";
import { sound } from "../lib/sound";
import { cn } from "../lib/utils";
import { POWER_META, type PowerId } from "../lib/types";

export default function GameScreen() {
  const {
    state,
    playType,
    myIdx,
    onlineBid,
    onlineFold,
    onlineNext,
    localBid,
    localFold,
    localNext,
    localWildcard,
    localNoRisk,
    onlineWildcard,
    onlineNoRisk,
    leaveRoom,
    mode,
    startLocal,
    onlineRematch,
    startMatch,
    players,
    powerFx,
    clearPowerFx,
  } = useGame();

  const prevRef = useRef({ roundIdx: -1, status: "", phase: "", lastBid: -1 });
  const [showEnd, setShowEnd] = useState(false);
  const [wildcardFor, setWildcardFor] = useState<number | null>(null);

  useEffect(() => {
    if (state?.phase === "round") setShowEnd(false);
  }, [state?.phase]);

  useEffect(() => {
    if (!state) return;
    const prev = prevRef.current;
    if (state.roundIdx !== prev.roundIdx && state.phase === "round") sound.tick();
    if (state.lastBid !== prev.lastBid) sound.bid();
    if (state.status === "round_done" && prev.status !== "round_done") sound.reveal();
    if (state.phase === "end" && prev.phase !== "end") sound.win();
    prevRef.current = {
      roundIdx: state.roundIdx,
      status: state.status,
      phase: state.phase,
      lastBid: state.lastBid,
    };
  }, [state]);

  if (!state) return null;

  const isOnline = playType === "online";
  const revealOpen = state.phase === "round" && state.rounds[state.roundIdx]?.status === "reveal";
  const you = isOnline ? myIdx : playType === "ai" ? 0 : null;
  const hotseat = playType === "hotseat";
  const powers = state.powers ?? { lastBid: false, wildcard: false, noRisk: false };
  const enabledPowers = (Object.keys(POWER_META) as PowerId[]).filter((id) => powers[id]);

  const handleBid = (amount: number) => (isOnline ? onlineBid(amount) : localBid(amount));
  const handleFold = () => (isOnline ? onlineFold() : localFold());
  // Powers: online derives the team from the socket; local games act per team idx.
  // Wildcard is two-step: open the picker, then fire with the chosen player.
  const canControl = (idx: number) => (isOnline ? myIdx === idx : hotseat ? true : idx === 0);
  const handleWildcard = (idx: number) => {
    if (!canControl(idx)) return;
    setWildcardFor(idx);
  };
  const confirmWildcard = (playerId: number) => {
    if (wildcardFor == null) return;
    if (isOnline) onlineWildcard(playerId);
    else localWildcard(wildcardFor, playerId);
    setWildcardFor(null);
  };
  const handleNoRisk = (idx: number) => {
    if (!canControl(idx)) return;
    if (isOnline) onlineNoRisk();
    else localNoRisk(idx);
  };
  const handleNext = () => {
    if (state.phase === "end") {
      setShowEnd(true);
      return;
    }
    isOnline ? onlineNext() : localNext();
  };

  const handleRematch = () => {
    if (isOnline) {
      onlineRematch();
    } else if (state) {
      startLocal(mode, playType, state.names, state.formation);
    }
  };

  return (
    <div className="bg-stadium relative min-h-screen overflow-hidden">
      <div className="crowd pointer-events-none absolute inset-0" />

      {/* ---- MOBILE app layout (< lg) ---- */}
      <div className="lg:hidden">
        <MobileGame
          state={state}
          playType={playType}
          myIdx={myIdx}
          onBid={handleBid}
          onFold={handleFold}
          onNext={handleNext}
          onQuit={leaveRoom}
          onWildcard={handleWildcard}
          onNoRisk={handleNoRisk}
          canControl={canControl}
        />
      </div>

      {/* ---- DESKTOP layout (>= lg) ---- */}
      <div className="relative z-10 mx-auto hidden min-h-screen max-w-6xl flex-col px-4 py-4 lg:flex">
        {/* header */}
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-extrabold uppercase text-white">
              Auction<span className="text-neon-green">Arena</span>
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-widest text-white/70">
              {mode}v{mode}
            </span>
            {isOnline && (
              <span className="rounded-full bg-neon-cyan/15 px-3 py-1 font-display text-xs font-bold uppercase tracking-widest text-neon-cyan">
                online
              </span>
            )}
            {enabledPowers.map((id) => (
              <span
                key={id}
                title={POWER_META[id].desc}
                className={cn(
                  "rounded-full px-2.5 py-1 font-display text-xs font-bold uppercase tracking-widest ring-1",
                  id === "lastBid" && "bg-neon-gold/15 text-neon-gold ring-neon-gold/30",
                  id === "wildcard" && "bg-neon-pink/15 text-neon-pink ring-neon-pink/30",
                  id === "noRisk" && "bg-red-500/15 text-red-300 ring-red-400/30"
                )}
              >
                {POWER_META[id].icon} {POWER_META[id].title}
              </span>
            ))}
          </div>
          <button
            onClick={leaveRoom}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:bg-white/10"
          >
            Quit
          </button>
        </header>

        {/* budgets */}
        <TeamPanel
          state={state}
          you={you}
          active={state.turn}
          canControl={canControl}
          onWildcard={handleWildcard}
          onNoRisk={handleNoRisk}
        />

        <div className="mt-3 grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.25fr_1fr] lg:items-start">
          <PitchField state={state} />
          <BidPanel
            state={state}
            playType={playType}
            myIdx={myIdx}
            onBid={handleBid}
            onFold={handleFold}
            onNext={handleNext}
          />
        </div>
      </div>

      {/* shared overlays */}
      <RevealOverlay
        state={state}
        open={revealOpen}
        onClose={() => (isOnline ? onlineNext() : localNext())}
      />

      {state.phase === "end" && showEnd && (
        <EndScreen state={state} onClose={() => setShowEnd(false)} onRematch={handleRematch} onMatch={startMatch} onHome={leaveRoom} />
      )}

      {/* wildcard step 1: pick which player to risk */}
      <AnimatePresence>
        {wildcardFor != null && (
          <WildcardPicker
            state={state}
            idx={wildcardFor}
            onPick={confirmWildcard}
            onClose={() => setWildcardFor(null)}
          />
        )}
      </AnimatePresence>

      {/* game changer FX (wildcard lucky-replace / no-risk machine) */}
      <AnimatePresence>
        {powerFx && (
          <PowerFX
            fx={powerFx}
            teamName={state.names[powerFx.idx]}
            onClose={clearPowerFx}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
