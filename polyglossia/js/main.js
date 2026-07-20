import { loadLanguages, loadCourse, loadUnit, findUnit } from "./data.js";
import { getXP, getStreak, getLang, setLang, unitProgress, isLessonComplete } from "./storage.js";
import { renderLessonSession } from "./lesson.js";
import { renderScriptPractice } from "./script-practice.js";
import { renderCulture } from "./culture.js";
import { renderStats } from "./stats.js";
import { buildPracticeSession, buildWarmup, dueCount } from "./practice.js";
import { initSync } from "./sync.js";
import { ttsMode } from "./tts.js";

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

// ---------- views ----------

async function viewLanguagePicker() {
  const langs = await loadLanguages();
  app.innerHTML = `
    <div class="lang-hero"><h1>Choose a language</h1>
    <p>Courses are generated from documents in this project's <code>sources/</code> folder.</p></div>
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
    app.innerHTML = `<div class="lang-hero"><h1>No courses yet</h1>
      <p>Upload documents to <code>sources/&lt;language&gt;/</code> and the course builder will create one.</p></div>`;
    return;
  }

  const mode = ttsMode(course);
  const ttsNote = mode === "approximate"
    ? `<p>🔊 Audio uses your browser's closest available voice — it is <b>approximate</b>, not a native speaker.</p>`
    : mode === "none" ? `<p>🔇 Your browser has no speech voices available; audio is disabled.</p>` : "";

  const due = dueCount(course.code);
  let html = `
    <div class="lang-hero">
      <h1>${esc(course.name)} <span class="native">${esc(course.nativeName || "")}</span></h1>
      <p>${esc(course.description || "")}</p>
      ${ttsNote}
      <p><a href="#/languages" class="switch-link">🌍 Switch language</a></p>
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
      try { unitsData.set(u.id, await loadUnit(course.code, u.file)); } catch { /* missing unit file */ }
    }
  }

  for (const section of course.sections) {
    const locked = section.locked || !(section.units || []).length;
    html += `
      <div class="section-header sec-${esc(section.level)} ${locked ? "locked" : ""}">
        <span class="lvl">${esc(section.level)}</span>
        <span class="sh-text">${esc(section.title)}<small>${locked ? "Unlocks as more source material is added" : esc(section.description || "")}</small></span>
      </div>`;
    if (locked) continue;
    html += `<div class="unit-path">`;
    for (const u of section.units) {
      const data = unitsData.get(u.id);
      const lessonIds = data ? data.lessons.map((l) => l.id) : [];
      const prog = unitProgress(course.code, u.id, lessonIds);
      const done = prog >= 1;
      const circumference = 2 * Math.PI * 43;
      html += `
        <a class="unit-node" href="#/unit/${esc(u.id)}">
          <span class="unit-bubble ${done ? "done" : ""}">
            ${esc(u.icon || "⭐")}
            <svg class="unit-ring" viewBox="0 0 94 94">
              <circle class="track" cx="47" cy="47" r="43"></circle>
              <circle class="prog" cx="47" cy="47" r="43"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${circumference * (1 - prog)}"></circle>
            </svg>
          </span>
          <span class="unit-label">${esc(u.title)}</span>
        </a>`;
    }
    html += `</div>`;
  }
  app.innerHTML = html;
}

async function viewUnit(unitId) {
  setNav("learn");
  const course = await currentCourse();
  const found = findUnit(course, unitId);
  if (!found) { location.hash = "#/"; return; }
  const data = await loadUnit(course.code, found.unit.file);

  app.innerHTML = `
    <div class="lang-hero">
      <h1>${esc(found.unit.icon || "")} ${esc(data.title)}</h1>
      <p><b>${esc(found.section.level)}</b> · ${esc(data.summary || "")}</p>
    </div>
    <div class="lesson-list">
      ${data.lessons.map((l, i) => {
        const done = isLessonComplete(course.code, unitId, l.id);
        return `
          <a class="lesson-card ${done ? "done" : ""}" href="#/lesson/${esc(unitId)}/${i}">
            <span class="lc-ico">${done ? "🏅" : "📖"}</span>
            <span>${esc(l.title)}
              <span class="lc-sub">${l.grammar ? "grammar · " : ""}${l.teach?.length ? l.teach.length + " new items · " : ""}${l.exercises.length} exercises</span>
            </span>
            ${done ? `<span class="lc-check">✓</span>` : ""}
          </a>`;
      }).join("")}
    </div>
    <div style="margin-top:20px"><a class="btn ghost wide" href="#/">← Back to course</a></div>`;
}

async function viewLesson(unitId, lessonIdx) {
  const course = await currentCourse();
  const found = findUnit(course, unitId);
  if (!found) { location.hash = "#/"; return; }
  const data = await loadUnit(course.code, found.unit.file);
  const lesson = data.lessons[Number(lessonIdx)];
  if (!lesson) { location.hash = `#/unit/${unitId}`; return; }
  // Interleave: lessons open with up to 3 spaced-review exercises.
  const warmup = buildWarmup(course.code, 3);
  renderLessonSession(app, course, unitId, lesson, updateStats, { warmup });
}

async function viewPractice() {
  const course = await currentCourse();
  if (!course) { location.hash = "#/"; return; }
  const session = buildPracticeSession(course.code);
  if (!session) {
    app.innerHTML = `<div class="lang-hero"><h1>🏋️ Practice</h1>
      <p>Nothing to practice yet — complete a lesson or two first, then this becomes a smart
      review session targeting exactly the words you're about to forget.</p>
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
      <p>Polyglossia is an open, Duolingo-style learning platform for languages that mainstream
      apps don't offer. Courses are <b>generated from documents</b>: drop grammars, word lists,
      readers, or lesson notes into the repository's <code>sources/&lt;language&gt;/</code> folder,
      and a Claude-powered build pipeline turns them into a CEFR-aligned course — updating the
      skill tree whenever new documents are added.</p>
      <ul>
        <li><b>CEFR alignment</b> — every unit is placed on the A1–C2 scale; sections unlock as the source material supports them.</li>
        <li><b>Script practice</b> — languages with non-Latin scripts get a drawing tab with tracing and self-scoring.</li>
        <li><b>Cultural notes</b> — courses include cultural context extracted from the source documents.</li>
        <li><b>Audio</b> — sentences can be heard via your browser's speech engine. For languages without
        real TTS voices the audio is a clearly-labeled <b>approximation</b>, not a native speaker.</li>
        <li><b>Private</b> — progress is stored only in your browser (localStorage). No accounts, no tracking.</li>
      </ul>
      <p><b>A note on accuracy:</b> the bundled starter course was seeded from public reference
      material and is illustrative. Spelling, dialect, and usage vary between communities —
      always prefer materials from language keepers and replace the seed course by uploading
      authoritative documents.</p>
    </div>`;
}

// ---------- router ----------

async function route() {
  const hash = location.hash || "#/";
  const parts = hash.slice(2).split("/").filter(Boolean);
  updateStats();
  try {
    if (parts[0] === "languages") return await viewLanguagePicker();
    if (parts[0] === "unit") return await viewUnit(parts[1]);
    if (parts[0] === "lesson") return await viewLesson(parts[1], parts[2]);
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
