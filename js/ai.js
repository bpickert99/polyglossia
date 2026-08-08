// Client for the AI lesson-construction proxy (Supabase Edge Function).
//
// Everything here is best-effort and non-blocking: if the user isn't signed in,
// the network is down, or the daily cap is hit, the caller falls back to the
// static lesson. The AI never becomes a hard dependency, and — because the
// server prompt is hard-limited to the taught word set and we re-check here —
// it can't surface vocabulary the learner hasn't been taught.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { isRungKey } from "./grammar.js";

// In-the-wild scenarios stay locked until there's genuinely enough learned to
// improvise with — the first couple of weeks don't have the material to justify
// one. Tuned to roughly the end of the ramp.
export const SCENARIO_MIN_WORDS = 30;
export const SCENARIO_MIN_RUNGS = 3;

let sb = null;
async function client() {
  if (!SUPABASE_URL) return null;
  if (!sb) {
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn("AI unavailable (Supabase client didn't load):", e);
      return null;
    }
  }
  return sb;
}

export async function isSignedIn() {
  const c = await client();
  if (!c) return false;
  const { data } = await c.auth.getSession();
  return !!data?.session?.user;
}

// Have enough words + grammar been STARTED to make an improvised scenario worth
// it? Counts vocabulary (non-rung) and grammar rungs the learner has touched.
export function scenarioUnlocked(records) {
  let words = 0, rungs = 0;
  for (const [k, rec] of records) {
    if (!(rec?.reps > 0)) continue;
    if (isRungKey(k)) rungs++; else words++;
  }
  return words >= SCENARIO_MIN_WORDS && rungs >= SCENARIO_MIN_RUNGS;
}

// How close the learner is to unlocking scenarios (0..1) — for a dashboard hint.
export function scenarioProgress(records) {
  let words = 0, rungs = 0;
  for (const [k, rec] of records) {
    if (!(rec?.reps > 0)) continue;
    if (isRungKey(k)) rungs++; else words++;
  }
  return Math.min(1, (words / SCENARIO_MIN_WORDS + rungs / SCENARIO_MIN_RUNGS) / 2);
}

// Ask the model for a scenario. Returns the scenario object, or null on any
// failure (caller falls back). Throws only never — failures resolve to null.
export async function generateScenario(payload) {
  try {
    const c = await client();
    if (!c) return null;
    const { data, error } = await c.functions.invoke("generate-lesson", {
      body: { mode: "scenario", ...payload },
    });
    if (error) { console.warn("scenario generation failed:", error.message || error); return null; }
    const scenario = data?.scenario;
    return sanitizeScenario(scenario);
  } catch (e) {
    console.warn("scenario generation error:", e);
    return null;
  }
}

// Fresh recombinant production drills for the daily lesson (works from day one,
// not gated). Returns typed-exercise objects ready for the lesson renderer, or
// [] on any failure.
//
// Each drill declares the ONE known word it primarily trains (its "target").
// We validate that target against the taught set and, when it matches, key the
// exercise to it so the grade feeds FSRS — closing the loop so AI tutoring moves
// the same confidence ledger the scheduler runs on. A drill whose target we
// can't verify stays ungraded (keys:[]) rather than corrupting a wrong item.
export async function generatePractice(payload) {
  try {
    const c = await client();
    if (!c) return [];
    const { data, error } = await c.functions.invoke("generate-lesson", { body: { mode: "practice", ...payload } });
    if (error) { console.warn("practice generation failed:", error.message || error); return []; }
    const knownRomans = new Set((payload.known || []).map((w) => w.roman));
    return (Array.isArray(data?.items) ? data.items : [])
      .filter((it) => it && it.instruction && it.answer)
      .slice(0, 4)
      .map((it) => {
        const target = typeof it.target === "string" ? it.target.trim() : "";
        const graded = target && knownRomans.has(target);
        return {
          type: "type", prompt: String(it.instruction), answer: String(it.answer),
          accept: Array.isArray(it.accept) ? it.accept.map(String) : [],
          keys: graded ? [target] : [], ai: true,
        };
      });
  } catch (e) {
    console.warn("practice generation error:", e);
    return [];
  }
}

// Judge a free typed/spoken attempt at a scenario task. Returns
// { verdict, feedback, better } or null (caller shows a gentle fallback).
export async function evaluateAnswer(payload) {
  try {
    const c = await client();
    if (!c) return null;
    const { data, error } = await c.functions.invoke("generate-lesson", { body: { mode: "evaluate", ...payload } });
    if (error || !data?.verdict) return null;
    return { verdict: data.verdict, feedback: String(data.feedback || ""), better: String(data.better || "") };
  } catch {
    return null;
  }
}

// Light structural guard. The server prompt already constrains vocabulary; this
// just drops anything malformed so the renderer never sees a half-built line.
// (Deliberately lenient on tokens — conjugated forms like "kanakol" legitimately
// won't appear verbatim in the taught base-word set.)
function sanitizeScenario(sc) {
  if (!sc || !Array.isArray(sc.lines)) return null;
  const lines = sc.lines
    .filter((l) => l && typeof l.roman === "string" && l.roman.trim() && Array.isArray(l.chunks) && l.chunks.length)
    .map((l) => ({
      speaker: l.speaker === "you" ? "you" : "them",
      roman: l.roman.trim(),
      english: String(l.english || ""),
      chunks: l.chunks
        .filter((c) => c && typeof c.roman === "string" && c.roman.trim())
        .map((c) => ({
          roman: c.roman.trim(),
          en: String(c.en || ""),
          group: Number.isInteger(c.group) ? c.group : 0,
          morphemes: Array.isArray(c.morphemes)
            ? c.morphemes.filter((m) => m && m.seg).map((m) => ({ seg: String(m.seg), role: String(m.role || "") }))
            : [],
        })),
    }))
    .filter((l) => l.chunks.length);
  if (lines.length < 2) return null;
  return { setting: String(sc.setting || ""), lines, task: String(sc.task || "") };
}
