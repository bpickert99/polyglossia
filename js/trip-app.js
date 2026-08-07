// Trip app shell: onboarding (destination + departure date + script) → the
// trip dashboard (countdown, readiness, one "start today's lesson" button) →
// the daily 3-step lesson, rendered by the existing lesson engine.
import { loadPack, loadPackModules } from "./data.js";
import { getItems, getTrip, setTrip } from "./storage.js";
import { buildDailyPlan } from "./trip.js";
import { buildTripSession } from "./trip-session.js";
import { renderLessonSession } from "./lesson.js";
import { primeTTS } from "./tts.js";

const app = document.getElementById("app");
const PACK = "ary";
let pack = null, moduleItems = null, course = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const departureTs = (iso) => new Date(`${iso}T12:00:00`).getTime();
const records = () => new Map(getItems(PACK).map((i) => [i.key, i]));

async function boot() {
  pack = await loadPack(PACK);
  moduleItems = await loadPackModules(PACK, pack);
  course = {
    code: PACK, name: pack.name,
    tts: { engine: "piper", voice: "ar", piperVoice: "ar_JO-kareem-medium", preferredLangs: ["ar"], substitutions: [] },
  };
  route();
  window.addEventListener("hashchange", route);
}

function route() {
  const trip = getTrip();
  if (!trip.departureDate) return renderOnboarding();
  renderDashboard();
}

// ---------- onboarding ----------

function renderOnboarding() {
  const min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const def = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  app.innerHTML = `
    <div class="trip-onboard">
      <div class="trip-flag">${pack.flag || "🌍"}</div>
      <h1>${esc(pack.name)}</h1>
      <p class="trip-sub">${esc(pack.description)}</p>

      <label class="trip-label">When do you leave?</label>
      <input type="date" id="depart" min="${min}" value="${def}" class="trip-input">

      <label class="trip-label">How do you want to read Darija?</label>
      <div class="trip-choices">
        <label class="trip-choice"><input type="radio" name="script" value="arabizi" checked>
          <b>Latin letters</b><span>salam, shukran — how Moroccans text</span></label>
        <label class="trip-choice"><input type="radio" name="script" value="arabic">
          <b>Arabic script</b><span>سلام, شكرا — with Latin helper</span></label>
      </div>

      <button class="btn wide" id="go">Start my countdown</button>
      <p class="trip-fine">A short lesson each day, timed to peak the day you land.</p>
    </div>`;
  app.querySelector("#go").addEventListener("click", () => {
    const departureDate = app.querySelector("#depart").value;
    if (!departureDate) return;
    const scriptMode = app.querySelector('input[name="script"]:checked').value;
    setTrip({ packCode: PACK, departureDate, scriptMode, helper: scriptMode === "arabic" });
    route();
  });
}

// ---------- dashboard ----------

function renderDashboard() {
  const trip = getTrip();
  const departure = departureTs(trip.departureDate);
  const now = Date.now();
  const plan = buildDailyPlan(pack, moduleItems, records(), { departure, now });
  const ready = Math.round(plan.readiness.overall * 100);
  const doneToday = trip.lastLesson === today();

  const phaseNote = {
    ramp: "Learning new phrases and locking them in.",
    taper: "Final days — no new words, just making everything stick.",
    panic: "Not much time — drilling the essentials hard.",
  }[plan.phase] || "";

  const inScopeModules = pack.modules.filter((m) => plan.scope.some((i) => i.moduleId === m.id));
  const bars = inScopeModules.map((m) => {
    const frac = plan.readiness.byModule[m.id] || 0;
    return `
      <div class="mod-row">
        <span class="mod-name">${esc(m.icon)} ${esc(m.title)}</span>
        <span class="mod-bar"><span style="width:${Math.round(frac * 100)}%"></span></span>
      </div>`;
  }).join("");

  app.innerHTML = `
    <div class="trip-dash">
      <div class="trip-top">
        <span class="trip-flag-sm">${pack.flag || "🌍"}</span>
        <button class="trip-settings" id="settings" title="Change date">⚙️</button>
      </div>

      <div class="countdown">
        <div class="count-num">${plan.daysLeft}</div>
        <div class="count-label">${plan.daysLeft === 1 ? "day" : "days"} until ${esc(pack.destination)}</div>
      </div>

      <div class="ready-card">
        <div class="ready-ring" style="--pct:${ready}">
          <span>${ready}%</span>
        </div>
        <div class="ready-text">
          <b>Trip readiness</b>
          <p>What you'd remember if you left today.</p>
          <p class="phase">${esc(phaseNote)}</p>
        </div>
      </div>

      ${doneToday
        ? `<div class="done-today">✅ Today's lesson done — come back tomorrow.</div>
           <button class="btn wide ghost" id="again">Practice again anyway</button>`
        : `<button class="btn wide big" id="start">${plan.scopeCount ? "Start today's lesson" : "Start"}</button>
           <p class="trip-fine">${plan.newCount} new · ${plan.reviewCount} to review today</p>`}

      <div class="mod-list">${bars || ""}</div>
    </div>`;

  app.querySelector("#settings")?.addEventListener("click", () => {
    if (confirm("Change your departure date? This keeps your progress.")) {
      setTrip({ departureDate: "" });
      route();
    }
  });
  app.querySelector("#start")?.addEventListener("click", startLesson);
  app.querySelector("#again")?.addEventListener("click", startLesson);
}

function startLesson() {
  const trip = getTrip();
  const departure = departureTs(trip.departureDate);
  const plan = buildDailyPlan(pack, moduleItems, records(), { departure, now: Date.now() });
  const session = buildTripSession(pack, plan, moduleItems, records(), { scriptMode: trip.scriptMode });
  if (session.empty) {
    return renderCaughtUp();
  }
  setTrip({ lastLesson: today() });
  primeTTS();
  renderLessonSession(app, course, "trip-day", session, () => {}, { backHref: "#", isPractice: false });
}

function renderCaughtUp() {
  app.innerHTML = `
    <div class="trip-onboard">
      <div class="trip-flag">✅</div>
      <h1>All caught up</h1>
      <p class="trip-sub">Nothing due right now — check back tomorrow for the next step of your countdown.</p>
      <button class="btn wide" id="back">Back</button>
    </div>`;
  app.querySelector("#back").addEventListener("click", route);
}

boot();
