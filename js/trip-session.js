// Turns one day's plan (from trip.js) into the explicit 3-step daily session
// the lesson renderer consumes: (1) warm-up review of what's fading, (2) teach
// the day's new words + this module's grammar frame, (3) put it to work —
// exercises over new+review plus a listening-comprehension drill (hear a
// realistic reply, pick what it means). Reuses the existing exercise generator
// and lesson renderer, so every exercise type and the polished UX come for free.
import { getAbility } from "./storage.js";
import { predictP } from "./birdbrain.js";
import { isLeech } from "./srs.js";
import { generateExercise, shuffled, hasWord } from "./exercises.js";
import { nextRung, dueRungs, rungExercises } from "./grammar.js";

// Below this many started words, the comprehension slot stays multiple-choice;
// at or above it, it upgrades to an open "gist in English" (see gistExercise).
const GIST_MIN_VOCAB = 12;

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
// A leech (missed several reviews running) is re-taught instead of re-quizzed —
// breaking the fail-the-same-quiz loop — and the reteach card is where the AI
// tutor diagnoses why it won't stick (see lesson.js opts.explain).
function drill(item, pool, ability, floor) {
  if (isLeech(item)) {
    return {
      type: "reteach", key: item.key, target: item.target, roman: item.roman,
      english: item.english, note: item.note, audio: audioPath(item), ipa: item.ipa,
    };
  }
  const p = floor != null ? floor : predictP(ability, item.bd ?? 0);
  return generateExercise(item, pool, p);
}

// A gist drill: hear the reply and say what it MEANS in English (the gist, not a
// literal translation). The receptive counterpart to production — trains
// "understand what comes back". Ungraded against vocabulary; AI-scored when
// available, else self-assessed. Reserved for learners with enough vocabulary to
// parse a real reply (see GIST_MIN_VOCAB).
function gistExercise(entry) {
  return {
    type: "gist",
    keys: [],
    prompt: "Get the gist of their reply.",
    ask: entry.ask || "",
    reply: entry.reply,
    tts: entry.reply,
    english: entry.english || "",
    comprehension: true,
  };
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

// A grammar rung as a teaching note the lesson renderer shows before practice:
// the rule text plus a couple of worked examples.
function rungNote(rung) {
  // The rung's teach text already carries its worked examples inline; don't
  // repeat them. (Rich, listenable, colour-coded examples come as their own step.)
  return { title: rung.title, body: rung.teach };
}

// Foundational reading rules as a teaching note: the intro plus each symbol,
// its sound, and an example.
function foundationNote(fnd) {
  const lines = (fnd.symbols || [])
    .map((s) => `**${s.sym}** — ${s.sound}${s.example ? `  (${s.example})` : ""}`)
    .join("\n");
  return { title: fnd.title, body: `${fnd.intro}\n\n${lines}` };
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

  // Step 0 — foundations: the unskippable "how to read this" beat, shown up
  // front until the learner has answered it once (so it lands on day one).
  const fnd = opts.foundations;
  const foundations = [];
  const foundationEx = [];
  if (fnd && !(records.get(fnd.key)?.reps > 0)) {
    foundations.push(foundationNote(fnd));
    for (const q of fnd.quiz || []) {
      foundationEx.push({ type: "mc", keys: [fnd.key], prompt: q.prompt, choices: q.choices, answer: q.answer, foundation: true });
    }
  }

  // Step 2 — teach: the day's new items + one grammar rung.
  const teach = plan.todayNew.map((it) => teachCard(it, scriptMode));

  // Grammar: introduce the next sequenced rung (unless we're tapering — no new
  // material in the final days), plus drills for any earlier rungs now due.
  const sequence = opts.sequence || [];
  const now = opts.now ?? Date.now();
  const departure = opts.departure ?? Infinity;
  const grammar = [];
  const newRungExercises = [];
  const reviewRungExercises = [];
  let newRung = null;
  if (sequence.length && plan.phase !== "taper" && !opts.noNewGrammar) {
    newRung = nextRung(sequence, records);
    if (newRung) {
      grammar.push(rungNote(newRung));
      newRungExercises.push(...rungExercises(newRung, { limit: 2 }));
    }
  }
  for (const r of dueRungs(sequence, records, now, departure)) {
    if (newRung && r.id === newRung.id) continue;
    const ex = rungExercises(r, { limit: 1 })[0];
    if (ex) reviewRungExercises.push({ ...ex, review: true });
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
  // The just-taught rung is drilled right after its note; word practice and
  // due-rung review shuffle together after it.
  const interleaved = [...newRungExercises, ...shuffled([...exercises, ...reviewRungExercises])];

  // Pull a comprehension entry from the day's module (or any in-scope module
  // that has one) and place it near the end — the rehearsal of the real moment.
  // Only ever quiz comprehension for a module the learner has actually STARTED —
  // otherwise you get a reply built from words never taught (the day-1 trap).
  const startedInModule = (mid) =>
    (moduleItems.get(mid)?.items || []).some((it) => (records.get(it.roman || it.target)?.reps || 0) > 0);
  const compModuleId = (plan.module && plan.module.id) || (plan.todayNew[0] || {}).moduleId;
  const compMod = moduleItems.get(compModuleId);
  let comps = [];
  if (compMod && compMod.comprehension?.length && startedInModule(compModuleId)) {
    comps = compMod.comprehension;
  } else {
    for (const mid of [...new Set(plan.scope.map((i) => i.moduleId))]) {
      const mod = moduleItems.get(mid);
      if (mod?.comprehension?.length && startedInModule(mid)) { comps = mod.comprehension; break; }
    }
  }
  if (comps.length) {
    const entry = comps[Math.floor(Math.random() * comps.length)];
    // Once the learner has enough vocabulary to actually parse a reply, upgrade
    // the comprehension slot from multiple-choice to an open gist (harder, and
    // the realistic version of understanding a stranger).
    let startedVocab = 0;
    for (const [k, r] of records) if ((r?.reps || 0) > 0 && !String(k).startsWith("g:")) startedVocab++;
    const useGist = startedVocab >= GIST_MIN_VOCAB && entry.reply && entry.english;
    interleaved.push(useGist ? gistExercise(entry) : comprehensionExercise(entry));
  }

  const allExercises = [...foundationEx, ...interleaved];
  return {
    id: `trip-${Date.now()}`,
    title: plan.module ? plan.module.title : "Today",
    foundations,
    teach,
    grammar,
    culture: [],
    warmup,
    exercises: allExercises,
    newCount: teach.length,
    reviewCount: warmup.length + interleaved.filter((e) => e.review).length,
    empty: !foundations.length && !teach.length && !warmup.length && !interleaved.length,
  };
}
