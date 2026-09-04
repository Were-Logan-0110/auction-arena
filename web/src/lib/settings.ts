export type Provider = "gemini" | "openrouter";

export interface MatchSettings {
  provider: Provider;
  geminiKey: string;
  openRouterKey: string;
}

const STORE_KEY = "aa_match_settings";

export const DEFAULT_SETTINGS: MatchSettings = {
  provider: "gemini",
  geminiKey: "",
  openRouterKey: "",
};

let cache: MatchSettings | null = null;

export function getSettings(): MatchSettings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MatchSettings>;
      cache = {
        provider: parsed.provider === "openrouter" ? "openrouter" : "gemini",
        geminiKey: typeof parsed.geminiKey === "string" ? parsed.geminiKey : DEFAULT_SETTINGS.geminiKey,
        openRouterKey: typeof parsed.openRouterKey === "string" ? parsed.openRouterKey : DEFAULT_SETTINGS.openRouterKey,
      };
      return cache;
    }
  } catch {
    /* corrupted storage -> defaults */
  }
  cache = { ...DEFAULT_SETTINGS };
  return cache;
}

export function saveSettings(s: MatchSettings): MatchSettings {
  cache = { ...s };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
  return cache;
}

/** The key for the currently selected provider ("" means "not configured"). */
export function activeKey(s: MatchSettings): string {
  return s.provider === "gemini" ? s.geminiKey.trim() : s.openRouterKey.trim();
}
