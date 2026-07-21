// "Birdbrain-lite" — adaptive difficulty, modeled on how Duolingo's Birdbrain
// works (Settles & Meeder; CMU/Duolingo). The published system predicts, for a
// given learner and a given exercise, the probability of a correct answer, and
// uses that to keep the learner in the "zone of proximal development" — it aims
// exercises at roughly a 70–80% success rate: hard enough to grow, not so hard
// it discourages.
//
// We implement the same idea with a lightweight two-parameter logistic (Elo)
// model instead of a 500M-lesson neural net:
//   - each learner has an ABILITY θ (per language)
//   - each vocabulary item has a DIFFICULTY δ (personal to this learner)
//   - P(correct) = logistic(θ − δ)
// After every answer we nudge θ and δ toward each other (as in chess Elo):
// a wrong answer lowers θ and raises δ; a right answer does the reverse.
//
// This module is PURE (no storage import) so it can't create import cycles.
// Callers pass ability/difficulty in and persist the returned values.

const K_ABILITY = 0.32;   // how fast the learner estimate moves per answer
const K_DIFFICULTY = 0.14; // items move slower than the learner
export const TARGET_SUCCESS = 0.8; // the success rate we aim each exercise at

// CEFR level → difficulty prior (logits). New words start here until answered.
const LEVEL_PRIOR = { A1: -1.1, A2: -0.3, B1: 0.5, B2: 1.2, C1: 1.9, C2: 2.6 };

export function seedDifficulty(level) {
  return LEVEL_PRIOR[level] ?? 0;
}

const logistic = (x) => 1 / (1 + Math.exp(-x));

export function predictP(ability, difficulty) {
  return logistic((ability ?? 0) - (difficulty ?? 0));
}

// Returns { ability, difficulty } after one graded answer.
export function updateRatings(ability, difficulty, correct) {
  const a = ability ?? 0;
  const d = difficulty ?? 0;
  const p = predictP(a, d);
  const y = correct ? 1 : 0;
  return {
    ability: a + K_ABILITY * (y - p),
    difficulty: d - K_DIFFICULTY * (y - p),
  };
}

// ---------- selection helpers (used by the lesson builder) ----------

// Given the learner's predicted success on an item, pick how demanding the
// rendered exercise should be, so the *rendered* exercise sits near
// TARGET_SUCCESS. Weak grasp → gentle recognition; strong grasp → production.
//   returns one of: "recognize" | "listen" | "produce"
export function exerciseDemand(pCorrect) {
  if (pCorrect < 0.55) return "recognize"; // multiple choice, easy distractors
  if (pCorrect < 0.8) return "listen";      // audio → pick written form
  return "produce";                         // type it from memory
}

// How confusable multiple-choice distractors should be (0 = very different,
// 1 = near-minimal pairs). Stronger learners get trickier distractors.
export function distractorHardness(pCorrect) {
  return Math.max(0, Math.min(1, (pCorrect - 0.4) / 0.5));
}

// How many brand-new items to introduce this session. Duolingo throttles new
// material when the learner is struggling or has a big review backlog; so do we.
export function newItemBudget({ ability, dueCount, baseNew = 5 }) {
  let budget = baseNew;
  if (dueCount > 12) budget -= 2;        // clear the backlog first
  else if (dueCount > 6) budget -= 1;
  if ((ability ?? 0) < -0.5) budget -= 1; // shaky learner: slow down
  if ((ability ?? 0) > 1.2) budget += 1;  // confident learner: a bit faster
  return Math.max(1, Math.min(6, budget));
}

// A rough CEFR-ish descriptor of current ability, for the stats page.
export function abilityBand(ability) {
  const a = ability ?? 0;
  if (a < -0.6) return { label: "Just starting", cefr: "A1" };
  if (a < 0.2) return { label: "Finding your feet", cefr: "A1+" };
  if (a < 0.9) return { label: "Getting comfortable", cefr: "A2" };
  if (a < 1.6) return { label: "Growing fluent", cefr: "A2+/B1" };
  return { label: "Strong", cefr: "B1+" };
}
