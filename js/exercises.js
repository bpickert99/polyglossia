// Exercise generation, shared by the lesson builder and practice mode.
//
// The KIND of exercise for an item is chosen by Birdbrain's predicted success:
// a shaky item gets gentle recognition (multiple choice with easy distractors),
// a solid one gets production (type it from memory). Distractor similarity also
// scales with predicted success, so strong learners face trickier choices. This
// keeps each rendered exercise near the ~80% success sweet spot.
import { exerciseDemand, distractorHardness } from "./birdbrain.js";

export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const hasWord = (i) => i && i.target && i.english;
const spoken = (i) => i.roman || i.target; // what TTS should say

// crude orthographic similarity, for picking "hard" distractors
function similarity(a, b) {
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();
  if (!a || !b) return 0;
  const setA = new Set(a);
  let shared = 0;
  for (const ch of new Set(b)) if (setA.has(ch)) shared++;
  const lenScore = 1 - Math.abs(a.length - b.length) / Math.max(a.length, b.length);
  return shared / Math.max(setA.size, 1) * 0.6 + lenScore * 0.4;
}

function distractors(pool, item, field, hardness, n = 3) {
  const others = pool.filter((p) => p.key !== item.key && p[field] && p[field] !== item[field]);
  // Rank by similarity to the correct answer; blend toward random by hardness.
  const ranked = others
    .map((p) => ({ v: p[field], s: similarity(p[field], item[field]) }))
    .sort((a, b) => b.s - a.s);
  const hardPool = ranked.slice(0, Math.max(n + 1, Math.ceil(ranked.length * 0.5))).map((x) => x.v);
  const easyPool = shuffled(ranked.map((x) => x.v));
  const src = hardness > 0.55 ? hardPool : easyPool;
  return shuffled(src).slice(0, n);
}

function mc(item, pool, direction, hardness) {
  const field = direction === "t2e" ? "english" : "target";
  const opts = distractors(pool, item, field, hardness);
  if (opts.length < 2) return null;
  const choices = shuffled([item[field], ...opts]);
  return {
    type: "mc",
    key: item.key,
    prompt: direction === "t2e"
      ? `What does ${item.target}${item.roman && item.roman !== item.target ? ` (${item.roman})` : ""} mean?`
      : `Which one means "${item.english}"?`,
    choices,
    answer: choices.indexOf(item[field]),
    tts: direction === "t2e" ? spoken(item) : undefined,
    audio: direction === "t2e" ? item.audio : undefined,
    ipa: direction === "t2e" ? item.ipa : undefined,
    note: item.note,
  };
}

function listen(item, pool, hardness) {
  const opts = distractors(pool, item, "target", hardness);
  if (opts.length < 2) return null;
  const choices = shuffled([item.target, ...opts]);
  return {
    type: "listen",
    key: item.key,
    prompt: "Which one did you hear?",
    ttsText: spoken(item),
    audio: item.audio,
    choices,
    answer: choices.indexOf(item.target),
    note: item.note,
  };
}

function produce(item) {
  const answer = item.target;
  const accept = [item.roman].filter((x) => x && x !== answer);
  return {
    type: "type",
    key: item.key,
    prompt: `Type "${item.english}" in the target language`,
    answer,
    accept,
    tts: spoken(item),
    audio: item.audio,
    ipa: item.ipa,
    note: item.note,
  };
}

// Dictation: play audio, type the whole sentence from what you hear. Only
// eligible for phrase items (a single word is just produce() by ear) — this
// is the harder, "spelling from listening" rung research consistently backs
// for listening comprehension, one step up from listen()'s multiple choice.
function dictate(item) {
  if (tokensOf(item).length < 2) return null;
  const answer = item.roman || item.target;
  const accept = [item.target].filter((x) => x && x !== answer);
  return {
    type: "dictation",
    key: item.key,
    prompt: "Type what you hear",
    answer,
    accept,
    tts: spoken(item),
    audio: item.audio,
    ipa: item.ipa,
    note: item.note,
  };
}

// Sentence word-order: build a multi-word target from a shuffled tile bank.
// Only eligible for phrase/sentence items (skip single words — nothing to order).
const tokensOf = (item) => (item.roman || item.target).replace(/[.!?]+$/, "").split(/\s+/);

function order(item, pool, hardness = 0.5) {
  const tokens = tokensOf(item);
  if (tokens.length < 3) return null;
  // Red herrings: single words pulled from OTHER pool items, so the bank has
  // a few tiles that don't belong in this sentence. Harder sessions get more.
  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));
  const candidates = [];
  for (const p of pool || []) {
    if (p.key === item.key) continue;
    for (const w of tokensOf(p)) {
      if (w.length < 2 || tokenSet.has(w.toLowerCase())) continue;
      candidates.push(w);
    }
  }
  const herrings = shuffled(candidates).slice(0, Math.min(candidates.length, hardness > 0.55 ? 3 : 2));
  return {
    type: "order",
    key: item.key,
    prompt: `Build the sentence: "${item.english}"`,
    tokens: shuffled([...tokens, ...herrings]),
    answer: tokens,
    tts: spoken(item),
    audio: item.audio,
    ipa: item.ipa,
    note: item.note,
  };
}

// Generate one exercise for an item, aimed by predicted success pCorrect.
export function generateExercise(item, pool, pCorrect) {
  const demand = exerciseDemand(pCorrect);
  const hardness = distractorHardness(pCorrect);
  const ladder = {
    recognize: [() => mc(item, pool, "t2e", hardness), () => mc(item, pool, "e2t", hardness), () => listen(item, pool, hardness)],
    listen: [() => listen(item, pool, hardness), () => mc(item, pool, "e2t", hardness), () => order(item, pool, hardness), () => produce(item)],
    produce: [() => order(item, pool, hardness), () => dictate(item), () => produce(item), () => mc(item, pool, "e2t", hardness), () => listen(item, pool, hardness)],
  }[demand];
  for (const make of ladder) {
    const ex = make();
    if (ex) return ex;
  }
  return mc(item, pool, "t2e", 0) || produce(item);
}

// One shadow-and-compare speaking rep per session: listen, record yourself,
// play both back to back, self-rate. No ASR — Interlingua isn't a language
// the Web Speech API recognizes, and even where it is, real pronunciation
// scoring is a different (harder) problem than this app takes on. Self-
// comparison is the low-tech version of the same shadowing-technique research.
// Needs real pre-rendered audio: there's nothing worth mimicking in a live
// eSpeak fallback voice.
export function shadowExercise(items) {
  const candidates = shuffled(items.filter((i) => hasWord(i) && i.audio && tokensOf(i).length >= 2));
  const item = candidates[0];
  if (!item) return null;
  return {
    type: "shadow",
    key: item.key,
    prompt: "Shadow it: listen, then record yourself saying it",
    english: item.english,
    tts: spoken(item),
    audio: item.audio,
    ipa: item.ipa,
  };
}

// A matching block over several items (forces discrimination between them).
export function matchExercise(items) {
  const picked = shuffled(items.filter(hasWord)).slice(0, 5);
  if (picked.length < 3) return null;
  return {
    type: "match",
    keys: picked.map((i) => i.key),
    prompt: "Match the pairs",
    pairs: picked.map((i) => [i.target, i.english]),
  };
}
