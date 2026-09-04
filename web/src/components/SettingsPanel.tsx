import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/utils";
import {
  getSettings,
  saveSettings,
  type MatchSettings,
  type Provider,
} from "../lib/settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PROVIDERS: { id: Provider; title: string; desc: string }[] = [
  { id: "gemini", title: "Gemini", desc: "Google AI — recommended (default)" },
  { id: "openrouter", title: "OpenRouter", desc: "One key for many models" },
];

export function SettingsPanel({ open, onClose }: Props) {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [geminiKey, setGeminiKey] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!open) return;
    const s = getSettings();
    setProvider(s.provider);
    setGeminiKey(s.geminiKey);
    setOpenRouterKey(s.openRouterKey);
  }, [open]);

  const save = () => {
    saveSettings({
      provider,
      geminiKey: geminiKey.trim(),
      openRouterKey: openRouterKey.trim(),
    } satisfies MatchSettings);
    onClose();
  };

  const key = provider === "gemini" ? geminiKey : openRouterKey;
  const setKey = provider === "gemini" ? setGeminiKey : setOpenRouterKey;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="glass w-full max-w-md rounded-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-xl font-extrabold uppercase tracking-wider text-white">
                Match Engine
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-white/50">
              Match sims run straight from this app via your own API key — no server needed.
            </p>

            {/* provider */}
            <div className="mt-5">
              <div className="mb-2 font-display text-xs font-bold uppercase tracking-[0.3em] text-white/40">
                Provider
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={cn(
                      "glass rounded-2xl p-3 text-left transition hover:bg-white/10",
                      provider === p.id && "border-neon-green/60 shadow-glow"
                    )}
                  >
                    <div className="font-display text-base font-bold uppercase text-white">{p.title}</div>
                    <div className="mt-0.5 text-[11px] leading-tight text-white/50">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* api key */}
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-white/40">
                  API key · {provider === "gemini" ? "Gemini" : "OpenRouter"}
                </span>
                <button
                  onClick={() => setShow((v) => !v)}
                  className="text-[10px] font-semibold uppercase tracking-wider text-white/40 transition hover:text-white/70"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={provider === "gemini" ? "AIza..." : "sk-or-..."}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-white/25 focus:border-neon-green/60"
              />
              <p className="mt-2 text-[11px] leading-snug text-white/40">
                {provider === "gemini"
                  ? "Get a free key at aistudio.google.com/apikey"
                  : "Get a key at openrouter.ai/keys"}
                . Stored only on this device.
              </p>
            </div>

            <button
              onClick={save}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-neon-green to-emerald-500 py-3.5 font-display text-lg font-extrabold uppercase tracking-wider text-black shadow-glow transition hover:brightness-110 active:scale-95"
            >
              Save
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
