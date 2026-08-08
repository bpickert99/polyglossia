// The daily learning loop's decision gate: a time-budgeted, confidence-gated
// day. PURE (imports only srs.js) so it's unit-testable and can never become an
// import cycle.
//
// Division of labor (see docs/learning-loop.md): this module — BirdBrain/FSRS
// territory — decides WHETHER and WHAT to do next (extend the day, reinforce,
// or stop). The AI tutor, elsewhere, only ever decides HOW to teach whatever
// this hands it. Time is the ceiling; demonstrated confidence is the throttle.
import { progress } from "./srs.js";

export const SESSION = {
  budgetMs: 30 * 60000,     // the ~30-minute daily expectation (soft target)
  minSegmentMs: 6 * 60000,  // don't open a new segment with less than this left
  confident: 0.7,           // today's material this solid → safe to extend
  maxConsolidate: 2,        // cap reinforcement rounds so a hard day still ends
  weakBelow: 0.85,          // an item under this is worth reinforcing
};

// Average within-session mastery of a set of keys (0..1). progress() responds
// immediately to repeated correct answers, so it reflects "did they get today's
// material" — the right signal here — rather than "will they remember it in 3
// weeks" (that's strength(), which is deliberately time-gated).
export function todayConfidence(records, keys) {
  const ks = [...new Set(keys)].filter(Boolean);
  if (!ks.length) return 1;
  let sum = 0;
  for (const k of ks) sum += progress(records.get(k) || {});
  return sum / ks.length;
}

// Which of the given keys are still shaky enough to be worth reinforcing.
export function weakKeys(records, keys, threshold = SESSION.weakBelow) {
  return [...new Set(keys)].filter((k) => progress(records.get(k) || {}) < threshold);
}

// The gate. Given time spent, how solid today's material is, and whether there
// is anything left to teach, decide the next move:
//   "extend"      — teach the next increment (confident + time + more to learn)
//   "consolidate" — reinforce today's weak items (time left, not over-reinforced)
//   "wrap"        — stop (out of time, or nothing left to do)
// The gate only fires *between* segments, so a segment already underway always
// runs to completion — that's how a confident learner's day naturally runs a
// little past the soft budget. What the gate controls is whether to START
// another segment, and only if a full minSegment of budget still remains.
export function nextMove({ elapsedMs, confidence, hasMore, consolidations = 0, cfg = SESSION }) {
  const remaining = cfg.budgetMs - elapsedMs;
  if (remaining < cfg.minSegmentMs) return "wrap"; // not enough budget for another segment
  // Confident and something new to teach → lengthen the day with new material.
  if (confidence >= cfg.confident && hasMore) return "extend";
  // Otherwise spend the remaining budget locking in today's material, rather
  // than pushing new material onto a shaky learner — bounded so a hard day ends.
  if (consolidations < cfg.maxConsolidate) return "consolidate";
  return "wrap";
}
