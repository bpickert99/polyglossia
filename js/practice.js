// Adaptive practice: builds review sessions from the learner model.
//
// Pedagogy this encodes (see README "How the learning engine works"):
// - Spaced repetition: items are queued when FSRS says they're near forgetting.
// - Error targeting: items you get wrong are boosted to the front of the queue.
// - Retrieval practice: as an item matures, recognition exercises (multiple
//   choice) give way to production exercises (typing) — harder retrieval,
//   stronger memories.
// - Interleaving: the queue deliberately mixes units and topics.
import { getItems } from "./storage.js";
import { isDue, retrievability, accuracy, strength } from "./srs.js";

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const hasWord = (i) => i.target && i.english;

// Items most worth reviewing right now, best-first.
export function reviewQueue(lang, now = Date.now()) {
  const items = getItems(lang).filter(hasWord);
  const scored = items.map((i) => {
    let score = 0;
    if (isDue(i, now)) score += 2 + (1 - retrievability(i, now)); // overdue first
    score += (1 - accuracy(i)) * 2;                              // error-prone next
    if ((i.lapses || 0) >= 2) score += 0.5;
    return { item: i, score };
  });
  return scored.filter((s) => s.score > 0.2).sort((a, b) => b.score - a.score).map((s) => s.item);
}

export function dueCount(lang, now = Date.now()) {
  return getItems(lang).filter((i) => hasWord(i) && isDue(i, now)).length;
}

// ---------- exercise generation ----------

function distractors(pool, item, field, n = 3) {
  return shuffled(pool.filter((p) => p.key !== item.key && p[field] && p[field] !== item[field]))
    .slice(0, n)
    .map((p) => p[field]);
}

function mcExercise(item, pool, direction) {
  // direction "t2e": show target, pick english; "e2t": show english, pick target
  const field = direction === "t2e" ? "english" : "target";
  const opts = distractors(pool, item, field);
  if (opts.length < 2) return null;
  const choices = shuffled([item[field], ...opts]);
  return {
    type: "mc",
    key: item.key,
    prompt: direction === "t2e"
      ? `What does ${item.target}${item.roman ? ` (${item.roman})` : ""} mean?`
      : `Which is "${item.english}"?`,
    choices,
    answer: choices.indexOf(item[field]),
    tts: direction === "t2e" ? (item.roman || item.target) : undefined,
  };
}

function listenExercise(item, pool) {
  const opts = distractors(pool, item, "target");
  if (!item.roman || opts.length < 2) return null;
  const choices = shuffled([item.target, ...opts]);
  return {
    type: "listen",
    key: item.key,
    prompt: "Which one did you hear?",
    ttsText: item.roman,
    choices,
    answer: choices.indexOf(item.target),
  };
}

function typeExercise(item) {
  if (!item.roman) return null;
  return {
    type: "type",
    key: item.key,
    prompt: `Type the romanization of ${item.target} ("${item.english}")`,
    answer: item.roman,
    tts: item.roman,
  };
}

function exerciseFor(item, pool) {
  const young = (item.reps || 0) < 3;
  const candidates = young
    ? [() => mcExercise(item, pool, "t2e"), () => listenExercise(item, pool), () => mcExercise(item, pool, "e2t")]
    : [() => typeExercise(item), () => mcExercise(item, pool, "e2t"), () => listenExercise(item, pool)];
  for (const make of shuffled(candidates)) {
    const ex = make();
    if (ex) return ex;
  }
  return null;
}

// A full adaptive practice session (returned as a synthetic "lesson").
export function buildPracticeSession(lang, size = 12) {
  const pool = getItems(lang).filter(hasWord);
  let queue = reviewQueue(lang);
  if (queue.length < 5) {
    // Not enough due/weak items — top up with the shakiest known words.
    const extras = pool
      .filter((i) => !queue.includes(i))
      .sort((a, b) => strength(a) - strength(b));
    queue = [...queue, ...extras];
  }
  const picked = queue.slice(0, size);
  if (!picked.length) return null;

  const exercises = picked.map((i) => exerciseFor(i, pool)).filter(Boolean);
  // Interleave a matching block to force discrimination between items.
  const matchable = shuffled(picked.filter((i) => i.target && i.english)).slice(0, 5);
  if (matchable.length >= 3) {
    exercises.splice(Math.floor(exercises.length / 2), 0, {
      type: "match",
      keys: matchable.map((i) => i.key),
      prompt: "Match the pairs",
      pairs: matchable.map((i) => [i.target, i.english]),
    });
  }
  return {
    id: `practice-${Date.now()}`,
    title: "Practice",
    teach: [],
    exercises,
  };
}

// Short warm-up (used at the start of regular lessons): the 2-3 most urgent
// review items, so new material is always interleaved with old.
export function buildWarmup(lang, max = 3) {
  const pool = getItems(lang).filter(hasWord);
  return reviewQueue(lang)
    .slice(0, max)
    .map((i) => exerciseFor(i, pool))
    .filter(Boolean)
    .map((ex) => ({ ...ex, review: true }));
}
