// Turns one day's plan (from trip.js) into the explicit 3-step daily session
// the lesson renderer consumes: (1) warm-up review of what's fading, (2) teach
// the day's new words + this module's grammar frame, (3) put it to work —
// exercises over new+review plus a listening-comprehension drill (hear a
// realistic reply, pick what it means). Reuses the existing exercise generator
// and lesson renderer, so every exercise type and the polished UX come for free.
import { getAbility } from "./storage.js";
import { predictP } from "./birdbrain.js";
import { generateExercise, shuffled, hasWord } from "./exercises.js";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const audioPath = (it) => `audio/${slug(it.roman || it.target)}.wav`;
const tierLevel = (t) => (t === 0 ? "A1" : t === 1 ? "A1" : "A2");

// Present an item for display in the chosen script. Arabizi mode shows the
// Latin form only; Arabic mode shows the Arabic script with the Arabizi as a
// helper line underneath (lesson.js renders `roman` as the helper when it
// differs from `target`).
function display(it, scriptMode) {
  if (scriptMode === "arabic" && it.arabic) {
    return { target: it.arabic, roman: it.roman || it.target };
  }
  return { target: it.roman || it.target, roman: it.roman || it.target };
}

function teachCard(it, scriptMode) {
  const d = display(it, scriptMode);
  return {
    key: it.key, target: d.target, roman: d.roman, english: it.english,
    note: it.note, audio: audioPath(it), level: tierLevel(it.tier),
  };
}

// One graded exercise for a review/new item, aimed near the success sweet spot.
function drill(item, pool, ability, floor) {
  const p = floor != null ? floor : predictP(ability, item.bd ?? 0);
  return generateExercise(item, pool, p);
}

// A comprehension drill: the other person's reply is shown (and, once audio is
// generated, played), and you pick its meaning. Ungraded against vocabulary
// (keys: []), like a reading question — it checks understanding, not recall.
function comprehensionExercise(entry) {
  const promptLines = [
    entry.ask ? `You ask: "${entry.ask}"` : null,
    `They say: “${entry.reply}”`,
    "",
    entry.question || "What do they mean?",
  ].filter((l) => l !== null).join("\n");
  return {
    type: "mc",
    keys: [],
    prompt: promptLines,
    tts: entry.reply,          // plays the reply once pre-rendered audio exists
    choices: entry.choices,
    answer: entry.answer,
    note: entry.english,
    comprehension: true,
  };
}

export function buildTripSession(pack, plan, moduleItems, records, opts = {}) {
  const lang = pack.code;
  const scriptMode = opts.scriptMode || "arabizi";
  const ability = getAbility(lang);

  // Distractor pool = every teachable item in the pack, shown in the chosen script.
  const allItems = [];
  for (const mod of moduleItems.values()) {
    for (const it of (mod.items || [])) {
      const d = display(it, scriptMode);
      allItems.push({ ...it, key: it.roman || it.target, target: d.target, roman: d.roman });
    }
  }
  const pool = allItems.filter(hasWord);

  // Merge each plan item with its FSRS record + display form.
  const merge = (it) => {
    const d = display(it, scriptMode);
    return { ...(records.get(it.key) || {}), ...it, key: it.key, target: d.target, roman: d.roman };
  };

  // Step 1 — warm-up: the two or three most urgent review items, up front.
  const reviewItems = plan.todayReview.map(merge);
  const warmupN = plan.todayNew.length ? Math.min(3, reviewItems.length) : 0;
  const warmup = reviewItems.slice(0, warmupN).map((i) => ({ ...drill(i, pool, ability), review: true })).filter((x) => x.type);
  const restReview = reviewItems.slice(warmupN);

  // Step 2 — teach: the day's new items + this module's grammar frame(s).
  const teach = plan.todayNew.map((it) => teachCard(it, scriptMode));
  const grammar = [];
  const seen = new Set();
  for (const it of plan.todayNew) {
    if (seen.has(it.moduleId)) continue;
    seen.add(it.moduleId);
    const mod = moduleItems.get(it.moduleId);
    if (mod && mod.grammar) grammar.push(mod.grammar);
  }

  // Step 3 — put to work: a gentle first retrieval of each new item, the rest
  // of the review, and a comprehension drill, interleaved.
  const exercises = [];
  for (const it of plan.todayNew) {
    const ex = drill(merge(it), pool, ability, 0.45);
    if (ex) exercises.push(ex);
  }
  for (const it of restReview) {
    const ex = drill(it, pool, ability);
    if (ex) exercises.push({ ...ex, review: true });
  }
  const interleaved = shuffled(exercises);

  // Pull a comprehension entry from the day's module (or any in-scope module
  // that has one) and place it near the end — the rehearsal of the real moment.
  const compModuleId = (plan.module && plan.module.id) || (plan.todayNew[0] || {}).moduleId;
  const compMod = moduleItems.get(compModuleId);
  const comps = (compMod && compMod.comprehension) || [];
  if (comps.length) {
    const entry = comps[Math.floor(Math.random() * comps.length)];
    interleaved.push(comprehensionExercise(entry));
  }

  return {
    id: `trip-${Date.now()}`,
    title: plan.module ? plan.module.title : "Today",
    teach,
    grammar,
    culture: [],
    warmup,
    exercises: interleaved,
    newCount: teach.length,
    reviewCount: warmup.length + interleaved.filter((e) => e.review).length,
    empty: !teach.length && !warmup.length && !interleaved.length,
  };
}
