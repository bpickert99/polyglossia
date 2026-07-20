// Dynamic lesson generation.
//
// Instead of pre-written lessons, each "skill" on the path is a POOL of items
// (vocabulary + associated grammar/culture notes). When you start a skill we
// assemble a fresh lesson on the spot from three ingredients, in the spirit of
// Duolingo's Birdbrain:
//   1. NEW items — a few, throttled by ability and review backlog
//      (Birdbrain slows new material when you're struggling or behind).
//   2. REVIEW items — this skill's shaky words + due words from OTHER skills
//      (spaced repetition + interleaving), pulled from the FSRS queue.
//   3. Exercises whose difficulty is aimed at each item by predicted success,
//      so every rendered exercise sits near the ~80% success sweet spot.
// Start the same skill twice and you get two different lessons.
import { getItems, getAbility } from "./storage.js";
import { predictP, newItemBudget, seedDifficulty } from "./birdbrain.js";
import { generateExercise, matchExercise, shuffled, hasWord } from "./exercises.js";
import { reviewQueue, dueCount } from "./practice.js";
import { strength } from "./srs.js";

// Flatten a unit's authored lessons into one item pool. Grammar/culture notes
// ride along on the first item of the lesson they came from, so a note surfaces
// exactly when its vocabulary is first introduced.
export function poolFromUnit(unitData) {
  const items = [];
  const seen = new Set();
  for (const lesson of unitData.lessons || []) {
    (lesson.teach || []).forEach((t, idx) => {
      const key = t.roman || t.target;
      if (!t.target || seen.has(key)) return;
      seen.add(key);
      items.push({
        key,
        target: t.target,
        roman: t.roman,
        english: t.english,
        note: t.note,
        level: unitData.level,
        _grammar: idx === 0 ? lesson.grammar : undefined,
        _culture: idx === 0 ? lesson.culture : undefined,
      });
    });
  }
  return items;
}

export function poolKeys(unitData) {
  return poolFromUnit(unitData).map((i) => i.key);
}

// Fraction of a unit's pool the learner has a solid grip on (for path progress).
export function unitMastery(lang, unitData) {
  const keys = poolKeys(unitData);
  if (!keys.length) return 0;
  const byKey = new Map(getItems(lang).map((i) => [i.key, i]));
  const total = keys.reduce((s, k) => {
    const item = byKey.get(k);
    return s + (item ? Math.min(1, strength(item) * 1.15) : 0);
  }, 0);
  return total / keys.length;
}

// Build a lesson object (shape consumed by lesson.js) for a unit/skill.
export function buildLesson(course, unitData, size = 12) {
  const lang = course.code;
  const pool = poolFromUnit(unitData);
  const records = new Map(getItems(lang).map((i) => [i.key, i]));

  const isNew = (i) => {
    const r = records.get(i.key);
    return !r || !(r.reps > 0);
  };
  const ability = getAbility(lang);
  const due = dueCount(lang);

  // 1. NEW items to introduce this session.
  const newItems = pool.filter(isNew).slice(0, newItemBudget({ ability, dueCount: due }));

  // 2. REVIEW items: this skill's already-seen items that are shaky, plus a few
  //    due items from anywhere (interleaving across skills).
  const newKeys = new Set(newItems.map((i) => i.key));
  const skillSeen = pool
    .filter((i) => !newKeys.has(i.key) && records.has(i.key))
    .map((i) => records.get(i.key))
    .sort((a, b) => strength(a) - strength(b));
  const globalDue = reviewQueue(lang).filter((i) => !newKeys.has(i.key));
  const reviewItems = [];
  const seenR = new Set();
  for (const i of [...skillSeen, ...globalDue]) {
    if (seenR.has(i.key)) continue;
    seenR.add(i.key);
    reviewItems.push(i);
    if (reviewItems.length >= size - newItems.length) break;
  }

  // A pool for distractors: everything we can name.
  const distractorPool = [
    ...pool,
    ...getItems(lang).filter(hasWord),
  ].filter(hasWord);

  // 3. Exercises. New items get a gentle first retrieval right after their teach
  //    card; review items are aimed by predicted success.
  const exercises = [];
  for (const item of newItems) {
    const ex = generateExercise({ ...item }, distractorPool, 0.25); // low p → recognize
    if (ex) exercises.push(ex);
  }
  for (const item of reviewItems) {
    const p = predictP(ability, item.bd ?? seedDifficulty(item.level));
    const ex = generateExercise(item, distractorPool, p);
    if (ex) exercises.push(ex);
  }

  // Interleave the review exercises among the new-item exercises.
  const interleaved = shuffled(exercises);

  // A matching block over a spread of this session's items.
  const matchItems = [...newItems, ...reviewItems].filter(hasWord);
  const match = matchExercise(matchItems);
  if (match) interleaved.splice(Math.floor(interleaved.length / 2), 0, match);

  // First grammar/culture note among the newly-introduced items.
  const grammar = newItems.find((i) => i._grammar)?._grammar;
  const culture = newItems.find((i) => i._culture)?._culture;

  return {
    id: `${unitData.id}-gen-${Date.now()}`,
    title: unitData.title,
    unitId: unitData.id,
    teach: newItems.map(({ key, target, roman, english, note, level }) => ({
      key, target, roman, english, note, level,
    })),
    grammar,
    culture,
    exercises: interleaved,
    // If there's nothing new AND nothing to review, the caller shows a message.
    empty: newItems.length === 0 && reviewItems.length === 0,
  };
}
