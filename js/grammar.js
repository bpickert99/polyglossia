// Grammar rung engine — the "critical grammar spine" made schedulable.
//
// A spine structure (e.g. present tense) is NOT taught in a day; it's broken
// into ordered RUNGS, each one day's teaching beat. But rungs aren't a single
// staircase per structure — they're one GLOBAL sequence drawn from across every
// structure, so the learner alternates deepening a paradigm with picking up a
// new structure type (conjugation → gender → word order → back to conjugation).
//
// That order is not hand-written. Three forces produce it:
//   • prereqs        — hard: never introduce a rung before what it depends on
//   • leverage       — pull: front-load what buys the most communication
//   • structure rotation — spacing: penalize repeating a structure just used,
//                          so rungs intersperse instead of grinding one ladder
// Deadline pressure then truncates/compresses the tail (handled by the planner).
//
// Rungs ride the SAME FSRS machinery as vocabulary, keyed `g:<rungId>`, so
// "grammar readiness" is an honest, decaying number and the taper protects
// grammar exactly like it protects words. This module is pure (imports only
// srs.js) so it can be unit-tested headless.
import { retrievability } from "./srs.js";

export const RUNG_PREFIX = "g:";
export const rungKey = (id) => `${RUNG_PREFIX}${id}`;
export const isRungKey = (k) => typeof k === "string" && k.startsWith(RUNG_PREFIX);
export const rungIdFromKey = (k) => (isRungKey(k) ? k.slice(RUNG_PREFIX.length) : null);

// Produce the global rung order. Greedy: at each step, among rungs whose prereqs
// are already placed, take the highest leverage MINUS a penalty for each recent
// pick that shared its structure. Ties break on authored order (stable).
export function sequenceRungs(rungs, opts = {}) {
  const penalty = opts.rotationPenalty ?? 15; // leverage points per recent same-structure pick
  const windowN = opts.rotationWindow ?? 2;   // how many recent picks the penalty looks back over
  const remaining = rungs.map((r, i) => ({ r, i }));
  const placed = new Set();
  const recent = [];
  const order = [];

  while (remaining.length) {
    const eligible = remaining.filter(({ r }) =>
      (r.prereqs || []).every((p) => placed.has(p)));
    // If a prereq is missing/cyclic, don't deadlock — fall back to all remaining.
    const pool = eligible.length ? eligible : remaining;

    let best = null, bestScore = -Infinity;
    for (const cand of pool) {
      const sameStruct = recent.filter((s) => s === cand.r.structure).length;
      const score = (cand.r.leverage ?? 0) - sameStruct * penalty;
      if (score > bestScore) { bestScore = score; best = cand; }
    }

    order.push(best.r);
    placed.add(best.r.id);
    recent.push(best.r.structure);
    if (recent.length > windowN) recent.shift();
    remaining.splice(remaining.indexOf(best), 1);
  }
  return order;
}

// A rung is "introduced" once it has an FSRS record with at least one rep.
const started = (rec) => !!(rec && rec.reps > 0);

export function introducedRungIds(records) {
  const ids = new Set();
  for (const [k, rec] of records) {
    if (isRungKey(k) && started(rec)) ids.add(rungIdFromKey(k));
  }
  return ids;
}

// The next rung to teach: first in sequence not yet introduced whose prereqs are
// all introduced. (Sequence order already respects prereqs, so this is normally
// just "the first not-yet-started rung" — the prereq guard is belt-and-braces.)
export function nextRung(sequence, records) {
  const done = introducedRungIds(records);
  for (const r of sequence) {
    if (done.has(r.id)) continue;
    if ((r.prereqs || []).every((p) => done.has(p))) return r;
  }
  return null;
}

// Introduced rungs whose review has come due (effective-due capped at departure,
// mirroring vocab), most-urgent first.
export function dueRungs(sequence, records, now = Date.now(), departure = Infinity) {
  const done = introducedRungIds(records);
  const due = [];
  for (const r of sequence) {
    if (!done.has(r.id)) continue;
    const rec = records.get(rungKey(r.id));
    const eff = Math.min(rec && rec.due != null ? rec.due : Infinity, departure);
    if (eff <= now) due.push({ rung: r, due: eff });
  }
  due.sort((a, b) => a.due - b.due);
  return due.map((d) => d.rung);
}

// Grammar readiness = what you'd remember of your introduced rungs if the trip
// were today, averaged. 0 when nothing's been taught yet. Mirrors scopeReadiness
// in trip.js so the dashboard can show a second ring next to vocabulary.
export function grammarReadiness(sequence, records, now = Date.now()) {
  const done = [...introducedRungIds(records)];
  if (!done.length) return { overall: 0, introduced: 0, total: sequence.length };
  let sum = 0;
  for (const id of done) {
    const rec = records.get(rungKey(id));
    sum += rec && rec.S ? retrievability(rec, now) : 0;
  }
  return { overall: sum / done.length, introduced: done.length, total: sequence.length };
}

// Turn a rung's authored quiz entries into exercises in the shape the lesson
// renderer consumes. Graded against the rung's own FSRS key so answering moves
// grammar readiness. Choices are plain strings; `answer` is the correct index.
export function rungExercises(rung, opts = {}) {
  const key = rungKey(rung.id);
  const limit = opts.limit ?? rung.quiz?.length ?? 0;
  return (rung.quiz || []).slice(0, limit).map((q) => ({
    type: "mc",
    keys: [key],
    prompt: q.prompt,
    choices: q.choices,
    answer: q.answer,
    grammar: true,
    rungId: rung.id,
    level: rung.role === "recognize" ? "A2" : "A1",
  }));
}
