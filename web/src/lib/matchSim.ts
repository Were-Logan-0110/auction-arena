import type { Player, Pos } from "./types";
import { primaryPosition } from "./engine";
import { normalizeMatch, type MatchData } from "./matchforge";
import { activeKey, getSettings, type MatchSettings } from "./settings";

/**
 * Client-side match simulation — the APK/web app calls the LLM API DIRECTLY
 * with the key configured in Settings (Gemini by default, OpenRouter optional).
 * The prompt is the same one the Python server uses, so output is identical in
 * spirit. Falls back to the server endpoint only when no key is configured.
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
const GEMINI_MODEL = "gemini-flash-latest";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "google/gemini-2.5-flash";

const FWD_POS = new Set(["ST", "CF", "LW", "RW", "LF", "RF"]);
const KNOWN_POS = ["GK", "CB", "LB", "RB", "RWB", "LWB", "CDM", "CM", "CAM", "LM", "RM", "CF", "ST", "LW", "RW", "LF", "RF"];

const SYSTEM_PROMPT = `You are MatchForge, an elite football match simulation engine. Given two complete squads and match settings you produce the ENTIRE match in a single shot as STRICT JSON — every goal, save, card, chance, tactical shift and team stat. You write like a brilliant, dramatic TV commentator.

ABSOLUTE RULES:
- Reply with ONLY valid JSON. No markdown code fences, no prose before or after, no trailing commas.
- The match lasts 90 minutes. Events MUST be sorted by minute ascending (minutes 1..90).
- "team" is 0 (home) or 1 (away), or null for neutral events.
- The running score is derived from "goal" events ONLY. Every goal event MUST carry the exact "minute" and the scorer's "player" name. Never skip or duplicate goals. Never invent a goal that is not a "goal" event, and never have a final score that does not match the goal events.
- The "score" field of EVERY event is the cumulative score AFTER that event (score[0] = home goals, score[1] = away goals).
- Goals must feel earned: at least half of them should be set up by earlier "chance"/"saved"/"corner" pressure from the same team.
- Shape a real narrative: a strong early moment, tension in the middle, and drama in the final 15 minutes (a comeback, a late winner, or a heroic clean-sheet battle).
- Include EXACTLY one "half_time" event at minute 45 and EXACTLY one "full_time" event at minute 90.
- Use event variety across these types: goal, chance, saved, woodwork, yellow, red, sub, injury, var, disallowed, penalty, penalty_missed, corner, foul, tactical, kickoff, half_time, full_time. (cards/subs: at most a few; red cards are rare and dramatic).
- Keep "text" commentary SHORT and punchy — 6 to 15 words, TV-commentary style. Never write essays.
- Player names MUST come ONLY from the provided rosters. Do not invent players or club names.
- Every player plays EXACTLY the MAIN position shown in brackets in the roster / line-up. NEVER shift anyone in 11v11: an RB is a right back, an LB a left back, a CB a centre back, an LW a left winger, an RW a right winger. NEVER play a fullback at centre-back or as a winger, and NEVER play a winger or fullback as a centre-forward if their listed position is a wide or midfield one. The formation is indicative — players do NOT move to fill it. Any event text that contradicts a player's listed position is a hard failure. (5v5 exception: wide players and forwards compress to CF.)
- Team stats must be internally consistent: shots >= shotsOnTarget; possession across both teams sums to 100; yellowCards/redCards match the events you wrote; passAccuracy between 70 and 95.
- The better-rated squad should win more often, but not always — upsets make it epic.
- Give each team a believable "formation" string and an average "rating" (one decimal).
- End with a "summary" of 2-3 punchy sentences.

Return this EXACT schema:
{
  "teams": [{"name": string, "formation": string, "rating": number}],
  "events": [{"minute": int, "team": 0|1|null, "type": string, "text": string, "player": string|null, "score": [int,int]}],
  "stats": [{"name": string, "possession": int, "shots": int, "shotsOnTarget": int, "corners": int, "fouls": int, "yellowCards": int, "redCards": int, "passes": int, "passAccuracy": int}],
  "motm": {"player": string, "team": 0|1, "rating": number, "note": string},
  "summary": string
}`;

function preferredPos(p: Player): string {
  const raw = (p.positions || "").toUpperCase();
  const toks = raw
    .split(/[|,/\s]+/)
    .map((t) => t.trim())
    .filter((t) => KNOWN_POS.includes(t));
  if (toks.length === 0) return "?";
  if (toks[0] === "GK") return "GK";
  for (const t of toks) if (FWD_POS.has(t)) return t;
  return toks[0];
}

function buildRoster(names: [string, string], squads: [Player[], Player[]]): string {
  return squads
    .map((squad, team) => {
      const name = (names[team] || `Team ${team}`).slice(0, 20);
      const items = squad.map((p) => `${p.name || p.full_name} (${preferredPos(p)}, ${p.overall})`).join(", ") || "unknown";
      return `TEAM ${team} — ${name} (roster: ${items})`;
    })
    .join("\n");
}

function buildLineup(names: [string, string], squads: [Player[], Player[]]): string {
  const lines: string[] = [];
  squads.forEach((squad, team) => {
    const name = (names[team] || `Team ${team}`).slice(0, 20);
    lines.push(`TEAM ${team} — ${name} (STARTING LINE-UP — play every player at EXACTLY the position listed):`);
    if (squad.length === 0) {
      lines.push("  (no players — do not invent any)");
    } else {
      squad.forEach((p, i) => {
        lines.push(`  ${String(i + 1).padStart(2, " ")}. ${p.name || p.full_name}  ->  ${preferredPos(p)}`);
      });
    }
  });
  return lines.join("\n");
}

function positionLaw(mode: 5 | 11): string {
  if (mode === 11) {
    return (
      "POSITION LAW (ABSOLUTE, THE MOST IMPORTANT RULE IN THIS PROMPT):\n" +
      "The STARTING LINE-UP block below is the ONLY source of truth for where every player plays. Every player plays EXACTLY the position listed after their name — never anything else, never a single shift:\n" +
      "  - A player listed LB is a left back. NEVER a winger, NEVER a centre-back.\n" +
      "  - A player listed RB is a right back. NEVER a winger, NEVER a centre-back.\n" +
      "  - A player listed CB is a centre back. NEVER a fullback, NEVER defensive mid.\n" +
      "  - A player listed CM/CDM is a central midfielder. NEVER a winger, NEVER a striker.\n" +
      "  - A player listed LW/RW is a wide player. NEVER a central midfielder, NEVER a striker.\n" +
      "  - A player listed ST/CF is the striker. NEVER a midfielder.\n" +
      "Do NOT move anyone to make the formation numbers work — the formation string is indicative only. Every event you write (goals, chances, assists, saves, fouls, cards, commentary) must describe players acting in exactly their listed position. If a player isn't a natural match for a role in your narrative, DON'T force it — the line-up is fixed.\n" +
      "Violating the line-up is a FAILURE that ruins the whole match."
    );
  }
  return (
    "POSITION LAW (ABSOLUTE): in this 5v5 match, wingers and forwards (LW/RW/ST/CAM/CF/LF/RF) are strikers — they attack. Fullbacks and central midfielders stay in midfield/defence. A player listed LB/RB/CB/CDM/CM is NEVER a striker, and a listed striker is NEVER a defensive midfielder or defender. Everyone plays the main position in the line-up block."
  );
}

function buildUserPrompt(mode: 5 | 11, names: [string, string], squads: [Player[], Player[]], formation: Pos[]): string {
  const nEvents = mode === 11 ? 26 : 18;
  const fmt = formation.join("/");
  return (
    `Generate the match between the two squads below.\n\n` +
    `Match settings:\n` +
    `- Format: ${mode}v${mode}\n` +
    `- Formation: ${fmt}\n` +
    `- Target number of key events: ~${nEvents} (land between ${nEvents - 3} and ${nEvents + 3})\n\n` +
    `${buildRoster(names, squads)}\n\n` +
    `${buildLineup(names, squads)}\n\n` +
    `${positionLaw(mode)}\n\n` +
    `Now produce the full match as JSON per the schema. Be efficient with tokens.`
  );
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fence ? fence[1] : text;
  for (const t of [candidate, candidate.replace(/,\s*([}\]])/g, "$1").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')]) {
    try {
      return JSON.parse(t);
    } catch {
      /* try next */
    }
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* try next */
      }
    }
  }
  throw new Error("AI did not return valid JSON");
}

async function callGemini(prompt: string, key: string): Promise<unknown> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.9, maxOutputTokens: 8192, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify((await res.json())?.error ?? {});
    } catch {
      detail = await res.text();
    }
    throw new Error(res.status === 401 || res.status === 403 ? "Gemini: invalid API key" : `Gemini HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini API error: ${data?.error?.message ?? "empty response"}`);
  return extractJson(text);
}

async function callOpenRouter(prompt: string, key: string): Promise<unknown> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify((await res.json())?.error ?? {});
    } catch {
      detail = await res.text();
    }
    throw new Error(res.status === 401 ? "OpenRouter: invalid API key" : `OpenRouter HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenRouter: empty response");
  return extractJson(text);
}

/** Full client-side match generation. Throws with a readable message on failure. */
export async function generateMatch(
  mode: 5 | 11,
  names: [string, string],
  squads: [Player[], Player[]],
  formation: Pos[],
  settings?: MatchSettings
): Promise<MatchData> {
  const s = settings ?? getSettings();
  const prompt = buildUserPrompt(mode, names, squads, formation);
  let raw: unknown;
  if (s.provider === "gemini") {
    if (!s.geminiKey.trim()) throw new Error("No Gemini API key configured — open Settings and paste one.");
    raw = await callGemini(prompt, s.geminiKey.trim());
  } else {
    if (!s.openRouterKey.trim()) throw new Error("No OpenRouter API key configured — open Settings and paste one.");
    raw = await callOpenRouter(prompt, s.openRouterKey.trim());
  }
  return normalizeMatch(raw);
}

/** True when the currently selected provider has a key configured. */
export function hasConfiguredKey(settings?: MatchSettings): boolean {
  return activeKey(settings ?? getSettings()).length > 0;
}
