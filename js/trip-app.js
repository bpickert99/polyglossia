// Trip app shell. No Duolingo path: you log on, and there's one thing to do —
// today's lesson. Three tabs across the bottom:
//   • Today   — countdown, readiness (words + grammar), one "start" button
//   • Review  — self-serve flashcards + grammar quizzes
//   • Account — who you are, sign out, and manage/delete courses
import { loadPack, loadPackModules, loadGrammar } from "./data.js";
import {
  getItems, listTrips, getActiveTrip, setActiveTrip, addTrip, updateTrip, deleteTrip,
} from "./storage.js";
import { buildDailyPlan } from "./trip.js";
import { buildTripSession } from "./trip-session.js";
import { sequenceRungs, grammarReadiness, introducedRungIds, isRungKey } from "./grammar.js";
import { renderLessonSession } from "./lesson.js";
import { renderReview } from "./trip-review.js";
import { renderScenario } from "./trip-scenario.js";
import { generateScenario, isSignedIn, scenarioUnlocked, scenarioProgress } from "./ai.js";
import { initSync, getUser, signOut, renderSyncCard } from "./sync.js";
import { primeTTS } from "./tts.js";

const app = document.getElementById("app");

// The pack catalog. One for now; adding a language = adding a code here + data.
const CATALOG = ["ary"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const departureTs = (iso) => new Date(`${iso}T12:00:00`).getTime();

const loaded = new Map(); // code -> { pack, moduleItems, grammar, sequence, course }
const catalogPacks = new Map(); // code -> pack.json (for the picker)
const reviewCtx = { reviewMode: "cards" };

async function ensureLoaded(code) {
  if (loaded.has(code)) return loaded.get(code);
  const [pack, grammar] = await Promise.all([loadPack(code), loadGrammar(code)]);
  const moduleItems = await loadPackModules(code, pack);
  const sequence = sequenceRungs(grammar.rungs || []);
  const course = {
    code, name: pack.name,
    tts: { engine: "piper", voice: "ar", piperVoice: "ar_JO-kareem-medium", preferredLangs: ["ar"], substitutions: [] },
  };
  const entry = { pack, moduleItems, grammar, sequence, course };
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
  const { pack, moduleItems, grammar, sequence, course } = await ensureLoaded(trip.packCode);

  const departure = departureTs(trip.departureDate);
  const now = Date.now();
  const records = recordsFor(trip.packCode);
  const plan = buildDailyPlan(pack, moduleItems, records, { departure, now });
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

  // Can-do: what a learner can now claim (module readiness past a threshold).
  const canDos = inScope
    .filter((m) => (plan.readiness.byModule[m.id] || 0) >= 0.6)
    .flatMap((m) => (moduleItems.get(m.id)?.canDo || []).slice(0, 1));

  app.innerHTML = `
    <div class="trip-dash">
      <div class="trip-top">
        <span class="trip-flag-sm">${pack.flag || "🌍"}</span>
        <span class="trip-dest">${esc(pack.destination)}</span>
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
           <p class="trip-fine">${plan.newCount} new · ${plan.reviewCount} to review</p>`}

      ${canDos.length ? `<div class="cando">
        <h3>You can now</h3>
        <ul>${canDos.map((c) => `<li>✓ ${esc(c)}</li>`).join("")}</ul>
      </div>` : ""}

      ${scenarioUnlocked(records)
        ? `<div class="scn-lock">🎬 In-the-wild practice is on — finish today's lesson to rehearse a real scene. Sign in on <b>Account</b> to enable it.</div>`
        : `<div class="scn-lock">🎬 In-the-wild scenarios unlock as you learn — <b>${Math.round(scenarioProgress(records) * 100)}%</b> of the way there.</div>`}

      <div class="mod-list">${bars || ""}</div>
    </div>
    ${tabbar("today")}`;

  app.querySelector("#start")?.addEventListener("click", () => startLesson(trip, { pack, moduleItems, grammar, sequence, course }));
  app.querySelector("#again")?.addEventListener("click", () => startLesson(trip, { pack, moduleItems, grammar, sequence, course }));
}

function ring(pct, label, color) {
  return `<div class="ring-wrap">
    <div class="ready-ring" style="--pct:${pct};--ring:${color}"><span>${pct}%</span></div>
    <div class="ring-label">${esc(label)}</div>
  </div>`;
}

function startLesson(trip, ld) {
  const departure = departureTs(trip.departureDate);
  const records = recordsFor(trip.packCode);
  const plan = buildDailyPlan(ld.pack, ld.moduleItems, records, { departure, now: Date.now() });
  const session = buildTripSession(ld.pack, plan, ld.moduleItems, records, {
    scriptMode: trip.scriptMode, grammar: ld.grammar, sequence: ld.sequence,
  });
  if (session.empty) return renderCaughtUp();
  primeTTS();

  // Kick off the AI in-the-wild scenario in the background while the learner
  // works through the graded lesson. Resolves to null (→ static finish) if it's
  // locked, the learner isn't signed in, or the call fails.
  const scenarioP = maybeScenario(trip, ld, records, plan);

  const finishToday = () => { location.hash = ""; renderToday(); };
  renderLessonSession(app, ld.course, "trip-day", session, () => {}, {
    backHref: "#", isPractice: false, noAutoplay: true,
    onComplete: () => updateTrip(trip.id, { lastLesson: today() }),
    onDone: async () => {
      app.innerHTML = `<div class="scn-prep">Setting the scene…</div>`;
      const scenario = await scenarioP;
      if (scenario) renderScenario(app, scenario, { course: ld.course, onDone: finishToday });
      else finishToday();
    },
  });
}

// Build the payload from what the learner actually knows and ask the model for
// a scenario. Every failure path returns null so the caller falls back cleanly.
async function maybeScenario(trip, ld, records, plan) {
  try {
    if (!scenarioUnlocked(records)) return null;
    if (!(await isSignedIn())) return null;
    const known = [];
    for (const [k, rec] of records) {
      if (rec?.reps > 0 && !isRungKey(k)) known.push({ roman: rec.roman || rec.target || k, english: rec.english || "" });
    }
    const done = introducedRungIds(records);
    const rungs = (ld.grammar.rungs || []).filter((r) => done.has(r.id)).map((r) => ({ title: r.title, teach: r.teach }));
    return await generateScenario({
      destination: ld.pack.destination,
      moduleTitle: plan.module?.title || "",
      scriptMode: trip.scriptMode,
      known, rungs,
    });
  } catch {
    return null;
  }
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

      <label class="trip-label">How do you want to read it?</label>
      <div class="trip-choices">
        <label class="trip-choice"><input type="radio" name="script" value="arabizi" checked>
          <b>Latin letters</b><span>salam, shukran — how locals text</span></label>
        <label class="trip-choice"><input type="radio" name="script" value="arabic">
          <b>Native script</b><span>with a Latin helper line</span></label>
      </div>

      <button class="btn wide big" id="go">Start my countdown</button>
    </div>
    ${listTrips().length ? tabbar("today") : ""}`;

  app.querySelector("#go").addEventListener("click", async () => {
    const packCode = app.querySelector("#pack").value;
    const departureDate = app.querySelector("#depart").value;
    if (!departureDate) return;
    const scriptMode = app.querySelector('input[name="script"]:checked').value;
    const p = catalogPacks.get(packCode);
    addTrip({
      packCode, packName: p.name, flag: p.flag, destination: p.destination,
      departureDate, scriptMode, helper: scriptMode === "arabic",
    });
    location.hash = "";
    route();
  });
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
