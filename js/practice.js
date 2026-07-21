// Practice mode: review sessions built from the learner model.
//
// - Spaced repetition: items surface when FSRS says they're near forgetting.
// - Error targeting: wrong/weak items are boosted to the front of the queue.
// - Birdbrain: each exercise's difficulty is aimed by predicted success.
// - Interleaving: the queue deliberately mixes skills and topics.
import { getItems, getAbility } from "./storage.js";
import { isDue, retrievability, accuracy, strength, isLeech } from "./srs.js";
import { predictP, seedDifficulty } from "./birdbrain.js";
import { generateExercise, matchExercise, shadowExercise, shuffled, hasWord } from "./exercises.js";

// Items most worth reviewing right now, best-first.
export function reviewQueue(lang, now = Date.now()) {
  const items = getItems(lang).filter(hasWord);
  const scored = items.map((i) => {
    let score = 0;
    if (isDue(i, now)) score += 2 + (1 - retrievability(i, now)); // overdue first
    score += (1 - accuracy(i)) * 2;                               // error-prone next
    if ((i.lapses || 0) >= 2) score += 0.5;
    return { item: i, score };
  });
  return scored.filter((s) => s.score > 0.2).sort((a, b) => b.score - a.score).map((s) => s.item);
}

export function dueCount(lang, now = Date.now()) {
  return getItems(lang).filter((i) => hasWord(i) && isDue(i, now)).length;
}

function exerciseForReview(item, pool, lang) {
  if (isLeech(item)) {
    return { type: "reteach", key: item.key, target: item.target, roman: item.roman,
      english: item.english, note: item.note, ipa: item.ipa, audio: item.audio };
  }
  const p = predictP(getAbility(lang), item.bd ?? seedDifficulty(item.level));
  return generateExercise(item, pool, p);
}

// A full adaptive practice session (returned as a synthetic "lesson").
export function buildPracticeSession(lang, size = 12) {
  const pool = getItems(lang).filter(hasWord);
  let queue = reviewQueue(lang);
  if (queue.length < 5) {
    const extras = pool.filter((i) => !queue.includes(i)).sort((a, b) => strength(a) - strength(b));
    queue = [...queue, ...extras];
  }
  const picked = queue.slice(0, size);
  if (!picked.length) return null;

  const exercises = picked.map((i) => exerciseForReview(i, pool, lang)).filter(Boolean);
  const match = matchExercise(picked);
  if (match) exercises.splice(Math.floor(exercises.length / 2), 0, match);
  const shadow = shadowExercise(picked);
  if (shadow) exercises.splice(Math.min(2, exercises.length), 0, shadow);

  return { id: `practice-${Date.now()}`, title: "Practice", teach: [], exercises };
}
