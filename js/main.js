import { loadLanguages, loadCourse, loadUnit, findUnit } from "./data.js";
import { getXP, getStreak, getLang, setLang, getItems } from "./storage.js";
import { renderLessonSession } from "./lesson.js";
import { renderScriptPractice } from "./script-practice.js";
import { renderCulture } from "./culture.js";
import { renderStats } from "./stats.js";
import { buildPracticeSession, dueCount } from "./practice.js";
import { buildLesson, unitMastery, poolFromUnit, isUnitDone, readingUnlocked } from "./lesson-builder.js";
import { progress } from "./srs.js";
import { initSync } from "./sync.js";
import { ttsMode, primeTTS } from "./tts.js";
import { renderReadingSession, isReadingComplete } from "./reading.js";

const app = document.getElementById("app");

export function updateStats() {
  document.querySelector("#stat-xp b").textContent = getXP();
  document.querySelector("#stat-streak b").textContent = getStreak();
}

function setNav(name) {
  document.querySelectorAll("#bottomnav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === name);
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function currentCourse() {
  const langs = await loadLanguages();
  let code = getLang();
  if (!code || !langs.languages.some((l) => l.code === code)) {
    code = langs.languages[0]?.code;
    if (code) setLang(code);
  }
  return code ? loadCourse(code) : null;
}

// Progression gating: a unit unlocks once the previous one is done (see
// lesson-builder.js's isUnitDone). Returns the set of unit ids still locked.
async function computeLocked(course) {
  const locked = new Set();
  let prevDone = true;
  for (const section of course.sections) {
    if (section.locked) continue;
    for (const u of section.units || []) {
      let data = null;
      try { data = await loadUnit(course.code, u.file); } catch { /* missing */ }
      if (!data) continue;
      if (!prevDone) locked.add(u.id);
      prevDone = isUnitDone(course.code, data);
    }
  }
  return locked;
}

// ---------- unit box (popup on the course map, or a small page when linked directly) ----------

function unitStats(course, data) {
  const pool = poolFromUnit(data);
  const records = new Map(getItems(course.code).map((i) => [i.key, i]));
  // progress() (reps + accuracy) rather than strength() — strength() is
  // time-gated by FSRS design and won't move within a single sitting no
  // matter how many times you answer correctly, since real stability growth
  // requires some elapsed time between reviews. See srs.js.
  const mastered = pool.filter((i) => { const r = records.get(i.key); return r && progress(r) >= 0.7; }).length;
  const started = pool.filter((i) => records.get(i.key)?.reps).length;
  return { pool, mastered, started };
}

function unitBoxHtml(course, section, data, unitId) {
  const { pool, mastered, started } = unitStats(course, data);
  const label = started === 0 ? "START" : "CONTINUE";
  const hasReading = !!data.reading;
  const readingReady = hasReading && readingUnlocked(course.code, data);
  const readingDone = hasReading && isReadingComplete(course.code, unitId);
  return `
    <div class="popup-stats">
      <div class="popup-stat"><span>Level</span><b>${esc(section.level)}</b></div>
      <div class="popup-stat"><span>Completed</span><b>${mastered}/${pool.length}</b></div>
    </div>
    <div class="popup-actions">
      <a class="btn wide" href="#/lesson/${esc(unitId)}">${label}</a>
      ${!hasReading ? "" : readingReady
        ? `<a class="popup-icon-btn" href="#/reading/${esc(unitId)}" title="${readingDone ? "Read again" : "Reading practice"}">📖</a>`
        : `<span class="popup-icon-btn disabled" title="Learn a few more words first">📖</span>`}
    </div>`;
}

let openPopup = null;
function closePopup() {
  if (!openPopup) return;
  openPopup.remove();
  openPopup = null;
  document.removeEventListener("click", onDocClick, true);
}
function onDocClick(e) {
  if (openPopup && !openPopup.contains(e.target) && !e.target.closest(".unit-node")) closePopup();
}
function openUnitPopup(nodeEl, course, section, data, unitId) {
  if (openPopup && openPopup.dataset.for === unitId) { closePopup(); return; }
  closePopup();
  const pop = document.createElement("div");
  pop.className = "unit-popup";
  pop.dataset.for = unitId;
  pop.innerHTML = unitBoxHtml(course, section, data, unitId);
  document.body.appendChild(pop);
  const rect = nodeEl.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 14;
  let left = rect.left + window.scrollX + rect.width / 2 - pop.offsetWidth / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - pop.offsetWidth - 12));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
  openPopup = pop;
  setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
}

// ---------- views ----------

async function viewLanguagePicker() {
  const langs = await loadLanguages();
  app.innerHTML = `
    <div class="lang-hero"><h1>Choose a language</h1>
    <p>Courses for languages the big apps overlook. New courses are authored with Claude
    and added to the tree.</p></div>
    <div class="lang-picker">
      ${langs.languages.map((l) => `
        <a class="lesson-card" href="#/" data-pick="${esc(l.code)}">
          <span class="lc-ico">🌍</span>
          <span>${esc(l.name)} <span class="lc-sub">${esc(l.nativeName || "")}</span></span>
        </a>`).join("")}
    </div>`;
  app.querySelectorAll("[data-pick]").forEach((a) => {
    a.addEventListener("click", () => setLang(a.dataset.pick));
  });
}

async function viewCourseMap() {
  setNav("learn");
  const course = await currentCourse();
  if (!course) {
    app.innerHTML = `<div class="lang-hero"><h1>No course selected</h1>
      <p><a href="#/languages">Choose a language</a> to begin.</p></div>`;
    return;
  }
  primeTTS(); // warm up the audio engine while the map renders

  const mode = ttsMode(course);
  const ttsNote = mode === "natural"
    ? `<p>🔊 Audio is a natural neural voice (Piper), driven by real phonemic transcription — words without pre-rendered audio fall back to phonemic (robotic but correct) speech. Every word shows its IPA.</p>`
    : mode === "accurate"
    ? `<p>🔊 Audio is phonemic (eSpeak) — it sounds robotic but pronounces the actual sounds, and every word shows its IPA.</p>`
    : mode === "approximate"
    ? `<p>🔊 Audio uses your browser's closest available voice — approximate pronunciation.</p>`
    : "";

  const multiLang = (await loadLanguages()).languages.length > 1;
  const due = dueCount(course.code);
  let html = `
    <div class="lang-hero">
      <h1>${esc(course.name)} <span class="native">${esc(course.nativeName || "")}</span></h1>
      <p>${esc(course.description || "")}</p>
      ${ttsNote}
      ${multiLang ? `<p><a href="#/languages" class="switch-link">🌍 Switch language</a></p>` : ""}
    </div>
    <a class="practice-banner ${due ? "hot" : ""}" href="#/practice">
      <span class="pb-ico">🏋️</span>
      <span><b>Practice</b>
        <span class="lc-sub">${due
          ? `${due} word${due === 1 ? "" : "s"} due for review — the algorithm says now is the time`
          : "Smart review of your weakest words"}</span>
      </span>
      ${due ? `<span class="due-badge">${due}</span>` : ""}
    </a>`;

  const unitsData = new Map();
  for (const section of course.sections) {
    for (const u of section.units || []) {
      try { unitsData.set(u.id, await loadUnit(course.code, u.file)); } catch { /* missing */ }
    }
  }
  const lockedUnits = await computeLocked(course);

  for (const section of course.sections) {
    const locked = section.locked || !(section.units || []).length;
    html += `
      <div class="section-header sec-${esc(section.level)} ${locked ? "locked" : ""}">
        <span class="lvl">${esc(section.level)}</span>
        <span class="sh-text">${esc(section.title)}<small>${locked ? "Unlocks as the course grows" : esc(section.description || "")}</small></span>
      </div>`;
    if (locked) continue;
    html += `<div class="unit-path">`;
    for (const u of section.units) {
      const data = unitsData.get(u.id);
      const prog = data ? unitMastery(course.code, data) : 0;
      const done = prog >= 0.95;
      const isLocked = lockedUnits.has(u.id);
      const circumference = 2 * Math.PI * 43;
      html += `
        <button type="button" class="unit-node ${isLocked ? "locked" : ""}" data-unit="${esc(u.id)}" ${isLocked ? "disabled" : ""}>
          <span class="unit-bubble ${done ? "done" : ""}">
            ${isLocked ? "🔒" : esc(u.icon || "⭐")}
            <svg class="unit-ring" viewBox="0 0 94 94">
              <circle class="track" cx="47" cy="47" r="43"></circle>
              <circle class="prog" cx="47" cy="47" r="43"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${circumference * (1 - prog)}"></circle>
            </svg>
          </span>
          <span class="unit-label">${esc(u.title)}${isLocked ? ' <small class="lock-hint">finish the previous unit</small>' : ""}</span>
        </button>`;
    }
    html += `</div>`;
  }
  app.innerHTML = html;

  app.querySelectorAll(".unit-node:not(.locked)").forEach((btn) => {
    btn.addEventListener("click", () => {
      const unitId = btn.dataset.unit;
      const found = findUnit(course, unitId);
      const data = unitsData.get(unitId);
      if (found && data) openUnitPopup(btn, course, found.section, data, unitId);
    });
  });
}

async function viewUnit(unitId) {
  setNav("learn");
  const course = await currentCourse();
  const found = findUnit(course, unitId);
  if (!found) { location.hash = "#/"; return; }
  if ((await computeLocked(course)).has(unitId)) { location.hash = "#/"; return; }
  const data = await loadUnit(course.code, found.unit.file);

  app.innerHTML = `
    <div class="lang-hero">
      <h1>${esc(found.unit.icon || "")} ${esc(data.title)}</h1>
      <p><b>${esc(found.section.level)}</b> · ${esc(data.summary || "")}</p>
    </div>
    <div class="unit-box">${unitBoxHtml(course, found.section, data, unitId)}</div>
    <p class="muted" style="text-align:center;margin:14px 0 4px">Each lesson is built fresh: new words and sentences, plus review of what you're about to forget.</p>
    <div style="margin-top:18px"><a class="btn ghost wide" href="#/">← Back to course</a></div>`;
}

async function viewReading(unitId) {
  const course = await currentCourse();
  const found = findUnit(course, unitId);
  if (!found) { location.hash = "#/"; return; }
  const data = await loadUnit(course.code, found.unit.file);
  if (!data.reading || !readingUnlocked(course.code, data)) { location.hash = `#/unit/${unitId}`; return; }
  renderReadingSession(app, course, unitId, data.reading, updateStats, `#/unit/${esc(unitId)}`);
}

async function viewLesson(unitId) {
  const course = await currentCourse();
  const found = findUnit(course, unitId);
  if (!found) { location.hash = "#/"; return; }
  if ((await computeLocked(course)).has(unitId)) { location.hash = "#/"; return; }
  const data = await loadUnit(course.code, found.unit.file);
  const lesson = buildLesson(course, data);
  if (lesson.empty) {
    app.innerHTML = `<div class="lang-hero"><h1>🏅 ${esc(data.title)}</h1>
      <p>You've worked through everything in this skill. Keep it fresh from the
      <a href="#/practice">Practice</a> queue, or explore another skill.</p>
      <a class="btn wide" href="#/unit/${esc(unitId)}">Back</a></div>`;
    return;
  }
  renderLessonSession(app, course, unitId, lesson, updateStats, { backHref: `#/unit/${esc(unitId)}` });
}

async function viewPractice() {
  const course = await currentCourse();
  if (!course) { location.hash = "#/"; return; }
  const session = buildPracticeSession(course.code);
  if (!session) {
    app.innerHTML = `<div class="lang-hero"><h1>🏋️ Practice</h1>
      <p>Nothing to practice yet — start a lesson first, then this becomes a smart review
      session targeting exactly the words you're about to forget.</p>
      <a class="btn" href="#/">Back to course</a></div>`;
    return;
  }
  renderLessonSession(app, course, "practice", session, updateStats, {
    isPractice: true,
    backHref: "#/",
  });
}

async function viewStats() {
  setNav("stats");
  const course = await currentCourse();
  renderStats(app, course);
}

async function viewScript() {
  setNav("script");
  const course = await currentCourse();
  await renderScriptPractice(app, course);
}

async function viewCulture() {
  setNav("culture");
  const course = await currentCourse();
  await renderCulture(app, course);
}

function viewAbout() {
  setNav("about");
  app.innerHTML = `
    <div class="lang-hero about">
      <h1>About Polyglossia</h1>
      <p>Polyglossia is an open, Duolingo-style platform for languages the mainstream apps
      overlook. It's built around a genuine adaptive engine rather than fixed lesson scripts.</p>
      <ul>
        <li><b>Lessons built on the fly</b> — nothing is pre-scripted. Each time you start a skill,
        the app assembles a fresh lesson: a few new words (throttled when you're struggling or
        behind), interleaved with review of what you're about to forget.</li>
        <li><b>Adaptive difficulty (Birdbrain-style)</b> — like Duolingo's Birdbrain, the app tracks
        your ability and each word's difficulty, and aims every exercise at roughly an 80% success
        rate — the sweet spot for learning. Weak words get gentle recognition; solid words get
        harder production and trickier choices.</li>
        <li><b>Spaced repetition (FSRS)</b> — every answer reschedules that word for review right
        before you'd forget it.</li>
        <li><b>Accurate pronunciation + IPA</b> — audio comes from a phonemic synthesizer (eSpeak NG)
        that pronounces the actual target sounds, and every word shows its IPA transcription. It
        sounds robotic, but it's correct — accuracy over polish.</li>
        <li><b>Cultural notes</b> and a <b>script-drawing tab</b> for languages with non-Latin writing.</li>
        <li><b>Optional accounts</b> — progress lives in your browser by default; sign in from the
        Stats tab to back it up and sync across devices.</li>
      </ul>
      <p class="muted">Course content is authored with Claude and can be extended at any time.</p>
    </div>`;
}

// ---------- router ----------

async function route() {
  closePopup();
  const hash = location.hash || "#/";
  const parts = hash.slice(2).split("/").filter(Boolean);
  updateStats();
  try {
    if (parts[0] === "languages") return await viewLanguagePicker();
    if (parts[0] === "unit") return await viewUnit(parts[1]);
    if (parts[0] === "lesson") return await viewLesson(parts[1]);
    if (parts[0] === "reading") return await viewReading(parts[1]);
    if (parts[0] === "script") return await viewScript();
    if (parts[0] === "culture") return await viewCulture();
    if (parts[0] === "practice") return await viewPractice();
    if (parts[0] === "stats") return await viewStats();
    if (parts[0] === "about") return viewAbout();
    return await viewCourseMap();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="lang-hero"><h1>Something went wrong</h1><p>${esc(err.message)}</p></div>`;
  }
}

window.addEventListener("hashchange", route);
route();
initSync();
