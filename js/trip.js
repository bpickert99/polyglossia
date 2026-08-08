// Trip engine — turns a travel pack + a departure date into ONE focused daily
// plan, tuned to the deadline. Core is pure (imports only srs.js) so it can be
// unit-tested headless; the storage-backed convenience wrappers live at the end.
//
// The problem this solves: a fixed departure date + a fixed content pack is a
// curriculum-FITTING problem. Given the days you have, we (a) triage which of
// the pack's priority-tiered modules you can realistically cover, (b) front-load
// new material and then taper — stop introducing new words in the final days so
// nothing's freshly-shaky when you land, and (c) recompute the plan every day,
// so a missed day just reflows against the (now closer) deadline.
import { retrievability } from "./srs.js";
import { newItemBudget } from "./birdbrain.js";

export const DAY = 86400000;
export const DEFAULTS = {
  newPerDay: 5,       // gentle daily intake when there's plenty of runway
  cramPerDay: 8,      // heavier intake when the trip is close
  cramUnderDays: 10,  // "close" threshold
  taperDays: 3,       // final N days: consolidate, no new material...
  panicDays: 2,       // ...unless you started this late, then keep teaching essentials
  reviewCapRamp: 10,
  reviewCapFinal: 16,
  essentialsFrac: 0.9, // tier-0 considered "covered" at this fraction started
};

export function daysUntil(departure, now = Date.now()) {
  return Math.max(0, Math.ceil((departure - now) / DAY));
}

export const keyOf = (item) => item.roman || item.target;

// Flatten a pack's modules into one priority-ordered list of items: tier first
// (0 = always taught), then the module's declared order, then item order. This
// ordering IS the triage priority — the most critical stuff sorts to the front.
export function syllabus(pack, moduleItems) {
  const out = [];
  const mods = [...(pack.modules || [])].sort((a, b) => a.tier - b.tier);
  for (const m of mods) {
    // moduleItems value may be a bare items[] (tests) or a full module {items}.
    const mod = moduleItems.get(m.id);
    const items = Array.isArray(mod) ? mod : (mod && mod.items) || [];
    items.forEach((it, idx) =>
      out.push({ ...it, key: keyOf(it), moduleId: m.id, tier: m.tier, order: idx }));
  }
  return out;
}

// Effective due never lands after departure: every item gets a final touch
// before the trip, and as the date nears, reviews compress into the days left.
export function effectiveDue(record, departure) {
  const due = record && record.due != null ? record.due : Infinity;
  return Math.min(due, departure);
}

const started = (r) => !!(r && r.reps > 0);

// The heart of it: today's plan given where you are and how many days remain.
export function buildDailyPlan(pack, moduleItems, records, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const now = opts.now ?? Date.now();
  const departure = opts.departure;
  const daysLeft = daysUntil(departure, now);
  const rec = (k) => records.get(k);

  // How much NEW material we can still realistically take on before the taper.
  const perDay = daysLeft < cfg.cramUnderDays ? cfg.cramPerDay : cfg.newPerDay;
  const newDays = daysLeft <= cfg.taperDays ? Math.max(1, daysLeft - 1) : daysLeft - cfg.taperDays;
  const remainingCapacity = newDays * perDay;

  const syl = syllabus(pack, moduleItems);
  const notStarted = syl.filter((i) => !started(rec(i.key)));
  // Triage: the highest-priority not-yet-started items that fit the runway.
  const newlyScoped = notStarted.slice(0, remainingCapacity);

  // Scope = everything you've committed to (already started) + the newly-fitted
  // slice. Readiness is measured against this; it only grows.
  const scopeKeys = new Set([
    ...syl.filter((i) => started(rec(i.key))).map((i) => i.key),
    ...newlyScoped.map((i) => i.key),
  ]);
  const scope = syl.filter((i) => scopeKeys.has(i.key));

  // Taper: stop new material in the final days — BUT only once the tier-0
  // essentials are actually covered. A late starter keeps learning essentials
  // even inside the taper window, because they've nothing yet to consolidate.
  const t0scope = scope.filter((i) => i.tier === 0);
  const t0done = t0scope.length
    ? t0scope.filter((i) => started(rec(i.key))).length / t0scope.length
    : 1;
  const essentialsCovered = t0done >= cfg.essentialsFrac;
  const inTaperWindow = daysLeft <= cfg.taperDays;
  const teachNew = newlyScoped.length > 0 && !(inTaperWindow && essentialsCovered);
  const phase = inTaperWindow && essentialsCovered ? "taper"
    : daysLeft <= cfg.panicDays ? "panic" : "ramp";

  // Review: started, in-scope items whose effective-due has arrived, most urgent first.
  const reviewCap = phase === "ramp" ? cfg.reviewCapRamp : cfg.reviewCapFinal;
  const todayReview = scope
    .filter((i) => started(rec(i.key)) && effectiveDue(rec(i.key), departure) <= now)
    .sort((a, b) => effectiveDue(rec(a.key), departure) - effectiveDue(rec(b.key), departure))
    .slice(0, reviewCap);

  // Today's NEW dose: the deadline sets the quota (perDay); BirdBrain then only
  // throttles it DOWN for a shaky learner or a big review backlog. The upside
  // for a confident learner is handled by extending the day (see day-engine.js),
  // so maxNew is pinned to perDay — the planner never pushes past the plan.
  const newBudget = opts.ability != null
    ? newItemBudget({ ability: opts.ability, dueCount: todayReview.length, baseNew: perDay, maxNew: perDay })
    : perDay;
  const todayNew = teachNew ? newlyScoped.slice(0, newBudget) : [];

  const readiness = scopeReadiness(scope, records, now);

  // Which module is "today's" — where the new items come from, or the last
  // one touched — so the UI can frame the teach step and pick its scenario.
  const currentModuleId = (todayNew[0] || todayReview[0] || scope[scope.length - 1] || {}).moduleId;
  const module = (pack.modules || []).find((m) => m.id === currentModuleId) || null;

  return {
    daysLeft, phase,
    todayNew, todayReview,
    newCount: todayNew.length, reviewCount: todayReview.length,
    scope, scopeCount: scope.length, targetCount: syl.length,
    module, readiness,
  };
}

// Readiness = what you'd remember if the trip were TODAY, averaged over scope
// (0 for anything not yet learned). Honest, climbs as you study, and — because
// FSRS models forgetting — reflects fade if you stop. Also broken out per module.
export function scopeReadiness(scope, records, now = Date.now()) {
  if (!scope.length) return { overall: 0, byModule: {} };
  const per = {};
  let sum = 0;
  for (const it of scope) {
    const r = records.get(it.key);
    const ret = r && r.S ? retrievability(r, now) : 0;
    sum += ret;
    (per[it.moduleId] = per[it.moduleId] || []).push(ret);
  }
  const byModule = {};
  for (const m in per) byModule[m] = per[m].reduce((a, b) => a + b, 0) / per[m].length;
  return { overall: sum / scope.length, byModule };
}
