// Trip app shell. No Duolingo path: you log on, and there's one thing to do —
// today's lesson. Three tabs across the bottom:
//   • Today   — countdown, readiness (words + grammar), one "start" button
//   • Review  — self-serve flashcards + grammar quizzes
//   • Account — who you are, sign out, and manage/delete courses
import { loadPack, loadPackModules, loadGrammar, loadFoundations } from "./data.js";
import {
  getItems, getAbility, learnerSnapshot, listTrips, getActiveTrip, setActiveTrip, addTrip, updateTrip, deleteTrip, completeLesson,
} from "./storage.js";
import { buildDailyPlan, syllabus } from "./trip.js";
import { buildTripSession } from "./trip-session.js";
import { sequenceRungs, grammarReadiness, introducedRungIds, isRungKey, nextRung, rungKey } from "./grammar.js";
import { nextMove, todayConfidence, weakKeys } from "./day-engine.js";
import { renderLessonSession } from "./lesson.js";
import { renderReview } from "./trip-review.js";
import { renderScenario } from "./trip-scenario.js";
import { generateScenario, generatePractice, evaluateAnswer, isSignedIn, scenarioUnlocked, scenarioProgress } from "./ai.js";
import { initSync, getUser, signOut, renderSyncCard } from "./sync.js";
import { primeTTS } from "./tts.js";

const app = document.getElementById("app");

// The pack catalog. Adding a language = adding a code here + a data/<code> pack.
const CATALOG = ["es", "ary"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const departureTs = (iso) => new Date(`${iso}T12:00:00`).getTime();

const loaded = new Map(); // code -> { pack, moduleItems, grammar, sequence, course }
const catalogPacks = new Map(); // code -> pack.json (for the picker)
const reviewCtx = { reviewMode: "cards" };

async function ensureLoaded(code) {
  if (loaded.has(code)) return loaded.get(code);
  const [pack, grammar, foundations] = await Promise.all([loadPack(code), loadGrammar(code), loadFoundations(code)]);
  const moduleItems = await loadPackModules(code, pack);
  const sequence = sequenceRungs(grammar.rungs || []);
  // Each pack carries its own TTS config; fall back to a plain eSpeak voice
  // named after the code (fine for Latin-script languages like Spanish).
  const course = {
    code, name: pack.name,
    tts: pack.tts || { engine: "espeak", voice: code, preferredLangs: [code], substitutions: [] },
  };
  const entry = { pack, moduleItems, grammar, sequence, foundations, course };
  loaded.set(code, entry);
  return entry;
}

const recordsFor = (code) => new Map(getItems(code).map((i) => [i.key, i]));

async function boot() {
  await Promise.all(CATALOG.map(async (c) => catalogPacks.set(c, await loadPack(c))));
  initSync().catch(() => {});
  window.addEventListener("hashchange", route);
  route();
}

function currentTab() {
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "review") return "review";
  if (h === "account") return "account";
  return "today";
}

async function route() {
  const tab = currentTab();
  if (tab === "review") return renderReviewTab();
  if (tab === "account") return renderAccount();
  return renderToday();
}

function tabbar(active) {
  const tab = (id, icon, label) =>
    `<a class="tabx ${active === id ? "on" : ""}" href="#${id === "today" ? "" : id}">
       <span class="tabx-i">${icon}</span><span class="tabx-l">${label}</span></a>`;
  return `<nav class="tabbar">
    ${tab("today", "📅", "Today")}
    ${tab("review", "🔁", "Review")}
    ${tab("account", "👤", "Account")}
  </nav>`;
}

// ---------- Today ----------

async function renderToday() {
  const trip = getActiveTrip();
  if (!trip) return renderStart();
  const { pack, moduleItems, grammar, sequence, foundations, course } = await ensureLoaded(trip.packCode);

  const departure = departureTs(trip.departureDate);
  const now = Date.now();
  const records = recordsFor(trip.packCode);
  const plan = buildDailyPlan(pack, moduleItems, records, { departure, now, ability: getAbility(trip.packCode) });
  const wordsPct = Math.round(plan.readiness.overall * 100);
  const gram = grammarReadiness(sequence, records, now);
  const gramPct = Math.round(gram.overall * 100);
  const doneToday = trip.lastLesson === today();

  const phaseNote = {
    ramp: "Learning new words and grammar, and locking them in.",
    taper: "Final days — no new material, just making everything stick.",
    panic: "Not much time — drilling the essentials hard.",
  }[plan.phase] || "";

  const inScope = pack.modules.filter((m) => plan.scope.some((i) => i.moduleId === m.id));
  const bars = inScope.map((m) => {
    const frac = plan.readiness.byModule[m.id] || 0;
    return `<div class="mod-row">
      <span class="mod-name">${esc(m.icon)} ${esc(m.title)}</span>
      <span class="mod-bar"><span style="width:${Math.round(frac * 100)}%"></span></span>
    </div>`;
  }).join("");

  // Can-do checklist: every capability in scope, checked once that module is
  // solid (readiness past a threshold) — the motivating "am I trip-ready?" view.
  const canDoItems = [];
  for (const m of inScope) {
    const done = (plan.readiness.byModule[m.id] || 0) >= 0.6;
    for (const c of (moduleItems.get(m.id)?.canDo || [])) canDoItems.push({ text: c, done });
  }
  canDoItems.sort((a, b) => (b.done - a.done)); // achieved first
  const canDoDone = canDoItems.filter((c) => c.done).length;

  app.innerHTML = `
    <div class="trip-dash">
      <div class="trip-top">
        <span class="trip-topleft"><span class="trip-flag-sm">${pack.flag || "🌍"}</span> <span class="trip-dest">${esc(pack.destination)}</span></span>
        ${trip.streak ? `<span class="trip-streak" title="${trip.streak}-day streak">🔥 ${trip.streak}</span>` : ""}
      </div>

      <div class="countdown">
        <div class="count-num">${plan.daysLeft}</div>
        <div class="count-label">${plan.daysLeft === 1 ? "day" : "days"} to go</div>
      </div>

      <div class="rings">
        ${ring(wordsPct, "Words", "#2e9e5b")}
        ${ring(gramPct, "Grammar", "#3a7bd5")}
      </div>
      <p class="phase-note">${esc(phaseNote)}</p>

      ${doneToday
        ? `<div class="done-today">✅ Today's lesson done — come back tomorrow.</div>
           <button class="btn wide ghost" id="again">Practice again anyway</button>`
        : `<button class="btn wide big" id="start">Start today's lesson</button>
           <button class="btn wide ghost" id="express">⏱️ Short on time? Quick 10 min</button>
           <p class="trip-fine">${plan.newCount} new · ${plan.reviewCount} to review</p>`}

      ${canDoItems.length ? `<div class="cando">
        <h3>Trip checklist <span class="cando-count">${canDoDone} / ${canDoItems.length}</span></h3>
        <ul>${canDoItems.map((c) => `<li class="${c.done ? "done" : "pending"}">${c.done ? "✓" : "○"} ${esc(c.text)}</li>`).join("")}</ul>
      </div>` : ""}

      ${scenarioUnlocked(records)
        ? `<div class="scn-lock">🎬 In-the-wild practice is on — finish today's lesson to rehearse a real scene. Sign in on <b>Account</b> to enable it.</div>`
        : `<div class="scn-lock">🎬 In-the-wild scenarios unlock as you learn — <b>${Math.round(scenarioProgress(records) * 100)}%</b> of the way there.</div>`}

      <div class="mod-list">${bars || ""}</div>
    </div>
    ${tabbar("today")}`;

  const ld = { pack, moduleItems, grammar, sequence, foundations, course };
  app.querySelector("#start")?.addEventListener("click", () => startLesson(trip, ld));
  app.querySelector("#again")?.addEventListener("click", () => startLesson(trip, ld));
  app.querySelector("#express")?.addEventListener("click", () => startLesson(trip, ld, { express: true }));
}

function ring(pct, label, color) {
  return `<div class="ring-wrap">
    <div class="ready-ring" style="--pct:${pct};--ring:${color}"><span>${pct}%</span></div>
    <div class="ring-label">${esc(label)}</div>
  </div>`;
}

const EXPRESS_NEW = 2; // new words in a quick lesson

async function startLesson(trip, ld, opts = {}) {
  const express = !!opts.express;
  const departure = departureTs(trip.departureDate);
  const records = recordsFor(trip.packCode);
  let plan = buildDailyPlan(ld.pack, ld.moduleItems, records, { departure, now: Date.now(), ability: getAbility(trip.packCode) });
  // Express: keep the deadline scope intact, just cap what's introduced today so
  // it fits ~10 minutes (fewer new words → fewer new-word drills).
  if (express) plan = { ...plan, todayNew: plan.todayNew.slice(0, EXPRESS_NEW) };

  const session = buildTripSession(ld.pack, plan, ld.moduleItems, records, {
    scriptMode: trip.scriptMode, grammar: ld.grammar, sequence: ld.sequence, foundations: ld.foundations,
  });
  if (session.empty) return renderCaughtUp();
  if (express) session.exercises = session.exercises.slice(0, 12); // trim practice to keep it short
  primeTTS();

  const finishToday = () => { location.hash = ""; renderToday(); };
  const markDone = () => completeLesson(trip.id);

  // Express skips the AI steps entirely — no spinner, no scenario — for speed.
  if (express) {
    return renderLessonSession(app, ld.course, "trip-day", session, () => {}, {
      backHref: "#", isPractice: false, noAutoplay: true, onComplete: markDone, onDone: finishToday,
    });
  }

  // Full lesson: kick off the AI in-the-wild scenario in the background, and
  // enrich practice with a few fresh AI drills (brief spinner, silent fallback).
  const scenarioP = maybeScenario(trip, ld, records, plan);
  app.innerHTML = `<div class="scn-prep">Preparing today's lesson…</div>`;
  await injectPractice(session, ld, records, plan);

  renderLessonSession(app, ld.course, "trip-day", session, () => {}, {
    backHref: "#", isPractice: false, noAutoplay: true,
    onComplete: markDone,
    onExhausted: dayExtender(trip, ld, plan),
    onDone: async () => {
      app.innerHTML = `<div class="scn-prep">Setting the scene…</div>`;
      const scenario = await scenarioP;
      if (scenario) {
        renderScenario(app, scenario, {
          course: ld.course,
          onEvaluate: async (text) => evaluateAnswer({
            destination: ld.pack.destination, task: scenario.task, userText: text,
            known: knownWords(records), rungs: knownRungs(records, ld),
          }),
          onDone: finishToday,
        });
      } else finishToday();
    },
  });
}

// ---- AI payload helpers ----
function knownWords(records) {
  const out = [];
  for (const [k, rec] of records) {
    if (rec?.reps > 0 && !isRungKey(k)) out.push({ roman: rec.roman || rec.target || k, english: rec.english || "" });
  }
  return out;
}
function knownRungs(records, ld) {
  const done = introducedRungIds(records);
  return (ld.grammar.rungs || []).filter((r) => done.has(r.id)).map((r) => ({ title: r.title, teach: r.teach }));
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);

async function injectPractice(session, ld, records, plan) {
  try {
    if (!(await isSignedIn())) return;
    const known = knownWords(records);
    if (known.length < 6) return; // too little to recombine meaningfully
    // Hand the AI the learner's weak spots so it aims practice at what's shaky,
    // not at random known words. The drills come back keyed to the word they
    // train, so answering them updates the same FSRS confidence the gate reads.
    const snap = learnerSnapshot(ld.pack.code);
    const items = await withTimeout(generatePractice({
      destination: ld.pack.destination, moduleTitle: plan.module?.title || "",
      known, rungs: knownRungs(records, ld), weak: snap.weak, ability: snap.ability, count: 3,
    }), 9000);
    if (Array.isArray(items) && items.length) session.exercises.push(...items);
  } catch { /* silent fallback to the static lesson */ }
}

async function maybeScenario(trip, ld, records, plan) {
  try {
    if (!scenarioUnlocked(records)) return null;
    if (!(await isSignedIn())) return null;
    return await generateScenario({
      destination: ld.pack.destination,
      moduleTitle: plan.module?.title || "",
      scriptMode: trip.scriptMode,
      known: knownWords(records), rungs: knownRungs(records, ld),
    });
  } catch {
    return null;
  }
}

// The time-budgeted day (see docs/learning-loop.md). Returns an onExhausted
// callback for the lesson renderer: when the planned steps run out, the
// BirdBrain gate (day-engine.js) reads time-spent + confidence in today's
// material and decides to EXTEND (teach the next increment), CONSOLIDATE
// (reinforce today's weak items), or wrap (return null). Pure scheduling — no
// AI is involved in this decision.
function dayExtender(trip, ld, plan) {
  const syl = syllabus(ld.pack, ld.moduleItems);
  const todayKeys = new Set(plan.todayNew.map((i) => i.key)); // grows as we extend
  const departure = departureTs(trip.departureDate);

  return async (stats) => {
    const fresh = recordsFor(trip.packCode);
    const isStarted = (k) => (fresh.get(k)?.reps || 0) > 0;
    const startedRungKeys = [...introducedRungIds(fresh)].map(rungKey);
    const confKeys = [...todayKeys, ...startedRungKeys];
    const confidence = todayConfidence(fresh, confKeys);

    const nextNew = syl.filter((i) => !isStarted(i.key));
    const hasMore = nextNew.length > 0 || !!nextRung(ld.sequence, fresh);
    const move = nextMove({
      elapsedMs: stats.elapsedMs, confidence, hasMore, consolidations: stats.consolidations,
    });
    if (move === "wrap") return null;

    const sessOpts = {
      scriptMode: trip.scriptMode, grammar: ld.grammar, sequence: ld.sequence,
      foundations: ld.foundations, now: Date.now(), departure,
    };
    const startedScope = syl.filter((i) => isStarted(i.key));

    if (move === "extend") {
      const add = nextNew.slice(0, 3);
      const plan2 = {
        phase: "ramp", daysLeft: plan.daysLeft, todayNew: add, todayReview: [],
        scope: [...startedScope, ...add],
        module: (ld.pack.modules || []).find((m) => m.id === (add[0] || {}).moduleId) || plan.module,
        readiness: { overall: 0, byModule: {} },
      };
      const seg = buildTripSession(ld.pack, plan2, ld.moduleItems, fresh, sessOpts);
      if (seg.empty) return null;
      add.forEach((i) => todayKeys.add(i.key));
      seg.banner = {
        tag: "🚀 Bonus", title: "You're ahead — one more",
        body: "You've got today's material down, so let's use the time to push a little further.",
        section: "Bonus",
      };
      return { move, parts: seg };
    }

    // consolidate: reinforce today's weakest items only — no new words, no new rung.
    const weak = weakKeys(fresh, confKeys).filter((k) => !isRungKey(k));
    const reviewItems = startedScope.filter((i) => weak.includes(i.key));
    if (!reviewItems.length) return null;
    const plan2 = {
      phase: "ramp", daysLeft: plan.daysLeft, todayNew: [], todayReview: reviewItems,
      scope: startedScope, module: plan.module, readiness: { overall: 0, byModule: {} },
    };
    const seg = buildTripSession(ld.pack, plan2, ld.moduleItems, fresh, { ...sessOpts, noNewGrammar: true });
    if (seg.empty) return null;
    seg.banner = {
      tag: "🔁 Lock it in", title: "A little more on today's tricky bits",
      body: "Before we stop, a quick pass over the pieces that aren't quite solid yet.",
      section: "Reinforce",
    };
    return { move, parts: seg };
  };
}

function renderCaughtUp() {
  app.innerHTML = `
    <div class="trip-onboard">
      <div class="trip-flag">✅</div>
      <h1>All caught up</h1>
      <p class="trip-sub">Nothing due right now — check back tomorrow for the next step of your countdown.</p>
      <a class="btn wide" href="#">Back</a>
    </div>
    ${tabbar("today")}`;
}

// ---------- Start / onboarding ----------

// Script picker for the selected pack. A single-script (Latin) language needs
// no choice; a pack with options (Darija: Arabizi vs Arabic) renders radios.
function scriptChoices(code) {
  const opts = catalogPacks.get(code)?.scripts?.options || [];
  if (opts.length <= 1) return "";
  const desc = { arabizi: "how locals text", arabic: "with a Latin helper line" };
  return `<label class="trip-label">How do you want to read it?</label>
    <div class="trip-choices">${opts.map((o, i) => `
      <label class="trip-choice"><input type="radio" name="script" value="${esc(o.id)}" ${i === 0 ? "checked" : ""}>
        <b>${esc(o.name)}</b>${desc[o.id] ? `<span>${esc(desc[o.id])}</span>` : ""}</label>`).join("")}</div>`;
}

function renderStart() {
  const min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const def = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const options = CATALOG.map((c) => {
    const p = catalogPacks.get(c);
    return `<option value="${c}">${esc(p.flag || "")} ${esc(p.name)}</option>`;
  }).join("");

  app.innerHTML = `
    <div class="trip-onboard">
      <div class="trip-flag">🧳</div>
      <h1>Plan a trip</h1>
      <p class="trip-sub">Pick where you're going and when you leave — we'll build a daily plan that peaks the day you land.</p>

      <label class="trip-label">Destination</label>
      <select id="pack" class="trip-input">${options}</select>

      <label class="trip-label">When do you leave?</label>
      <input type="date" id="depart" min="${min}" value="${def}" class="trip-input">

      <div id="script-slot">${scriptChoices(CATALOG[0])}</div>

      <button class="btn wide big" id="go">Start my countdown</button>
    </div>
    ${listTrips().length ? tabbar("today") : ""}`;

  // Script options depend on the destination — a Latin-script language (Spanish)
  // has nothing to choose; Darija offers Arabizi vs Arabic script.
  const slot = app.querySelector("#script-slot");
  app.querySelector("#pack").addEventListener("change", (e) => { slot.innerHTML = scriptChoices(e.target.value); });

  app.querySelector("#go").addEventListener("click", async () => {
    const packCode = app.querySelector("#pack").value;
    const departureDate = app.querySelector("#depart").value;
    if (!departureDate) return;
    const picked = app.querySelector('input[name="script"]:checked');
    const p = catalogPacks.get(packCode);
    const scriptMode = picked ? picked.value : (p.scripts?.default || "latin");
    const t = addTrip({
      packCode, packName: p.name, flag: p.flag, destination: p.destination,
      departureDate, scriptMode, helper: scriptMode === "arabic",
    });
    renderPlanSummary(t);
  });
}

// Shown once, right after planning a trip: what the site worked out for you —
// scope, daily load, and the taper — so the plan is visible before day one.
async function renderPlanSummary(trip) {
  const ld = await ensureLoaded(trip.packCode);
  const departure = departureTs(trip.departureDate);
  const plan = buildDailyPlan(ld.pack, ld.moduleItems, recordsFor(trip.packCode), { departure, now: Date.now() });
  const words = plan.scopeCount;
  const total = plan.targetCount;
  const rungs = ld.sequence.length;
  const perDay = plan.newCount || 5;
  const taperDays = 3;
  const triaged = words < total;

  app.innerHTML = `
    <div class="trip-onboard">
      <div class="trip-flag">${ld.pack.flag || "🧳"}</div>
      <h1>Your ${esc(ld.pack.destination)} plan</h1>
      <p class="trip-sub">${plan.daysLeft} days to go. Here's what we'll cover, timed to peak the day you land.</p>

      <div class="plan-card">
        <div class="plan-row"><span class="plan-big">${words}</span><span>essential words${triaged ? ` (the most useful of ${total})` : ""}</span></div>
        <div class="plan-row"><span class="plan-big">${rungs}</span><span>grammar points, one built on the last</span></div>
        <div class="plan-row"><span class="plan-big">~${perDay}</span><span>new words a day — never a wall</span></div>
        <div class="plan-row"><span class="plan-big">${taperDays}</span><span>final days to lock it in (no new material)</span></div>
      </div>

      <p class="trip-fine">One short lesson a day. Miss a day and the plan reflows against the new deadline.</p>
      <button class="btn wide big" id="plan-go">Start day 1</button>
    </div>`;
  app.querySelector("#plan-go").addEventListener("click", () => { location.hash = ""; renderToday(); });
}

// ---------- Review ----------

async function renderReviewTab() {
  const trip = getActiveTrip();
  if (!trip) { location.hash = ""; return route(); }
  const ld = await ensureLoaded(trip.packCode);
  Object.assign(reviewCtx, {
    app, code: trip.packCode, course: ld.course, pack: ld.pack,
    moduleItems: ld.moduleItems, grammar: ld.grammar, sequence: ld.sequence,
    scriptMode: trip.scriptMode, tabbar: tabbar("review"),
  });
  renderReview(reviewCtx);
}

// ---------- Account ----------

function renderAccount() {
  const trips = listTrips();
  const activeId = getActiveTrip()?.id;
  const user = getUser();

  const rows = trips.map((t) => {
    const d = t.departureDate ? Math.max(0, Math.ceil((departureTs(t.departureDate) - Date.now()) / 86400000)) : 0;
    return `<div class="acct-course ${t.id === activeId ? "on" : ""}">
      <div class="acct-course-main" data-activate="${t.id}">
        <span class="acct-flag">${esc(t.flag || "🌍")}</span>
        <span>
          <b>${esc(t.destination || t.packName || t.packCode)}</b>
          <span class="acct-sub">${d} ${d === 1 ? "day" : "days"} to go${t.id === activeId ? " · active" : ""}</span>
        </span>
      </div>
      <button class="acct-del" data-delete="${t.id}" title="Delete course">🗑️</button>
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="trip-account">
      <h1 class="rv-title">Account</h1>

      <div class="acct-section">
        <h3>Your courses</h3>
        ${rows || `<p class="rv-empty">No courses yet.</p>`}
        <a class="btn ghost wide" href="#" id="add">+ Plan another trip</a>
      </div>

      <div class="acct-section" id="sync-card"></div>

      ${user ? "" : `<p class="acct-note">Not signed in — progress is saved on this device only. Sign in above to back it up.</p>`}
    </div>
    ${tabbar("account")}`;

  renderSyncCard(app.querySelector("#sync-card"));

  app.querySelectorAll("[data-activate]").forEach((el) =>
    el.addEventListener("click", () => { setActiveTrip(el.dataset.activate); location.hash = ""; route(); }));

  app.querySelectorAll("[data-delete]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = trips.find((x) => x.id === b.dataset.delete);
      if (confirm(`Delete “${t?.destination || t?.packCode}” and erase its progress? This can't be undone.`)) {
        deleteTrip(b.dataset.delete);
        route();
      }
    }));

  app.querySelector("#add").addEventListener("click", (e) => { e.preventDefault(); renderStart(); });
}

boot();
