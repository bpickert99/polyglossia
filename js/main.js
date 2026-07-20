import { loadLanguages, loadCourse, loadUnit, findUnit } from "./data.js";
import { getXP, getStreak, getLang, setLang, getItems } from "./storage.js";
import { renderLessonSession } from "./lesson.js";
import { renderScriptPractice } from "./script-practice.js";
import { renderCulture } from "./culture.js";
import { renderStats } from "./stats.js";
import { buildPracticeSession, dueCount } from "./practice.js";
import { buildLesson, unitMastery, poolFromUnit } from "./lesson-builder.js";
import { strength } from "./srs.js";
import { initSync } from "./sync.js";
import { ttsMode, primeTTS } from "./tts.js";

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
  const ttsNote = mode === "accurate"
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
  const pool = poolFromUnit(data);
  const records = new Map(getItems(course.code).map((i) => [i.key, i]));
  const mastered = pool.filter((i) => { const r = records.get(i.key); return r && strength(r) >= 0.85; }).length;
  const started = pool.filter((i) => records.get(i.key)?.reps).length;
  const label = started === 0 ? "Start lesson" : "Continue — new lesson";

  app.innerHTML = `
    <div class="lang-hero">
      <h1>${esc(found.unit.icon || "")} ${esc(data.title)}</h1>
      <p><b>${esc(found.section.level)}</b> · ${esc(data.summary || "")}</p>
      <p class="muted">${mastered} of ${pool.length} words mastered · ${started} started</p>
    </div>
    <a class="btn wide" href="#/lesson/${esc(unitId)}">${label}</a>
    <p class="muted" style="text-align:center;margin:10px 0 4px">Each lesson is built fresh: new words, plus review of what you're about to forget.</p>
    <div class="word-pool">
      ${pool.map((i) => {
        const r = records.get(i.key);
        const s = r ? strength(r) : 0;
        return `<div class="word-row">
          <span class="target">${esc(i.target)}</span>
          <span class="muted">${esc(i.english)}</span>
          <span class="strengthbar"><i style="width:${Math.round(s * 100)}%"></i></span>
        </div>`;
      }).join("")}
    </div>
    <div style="margin-top:18px"><a class="btn ghost wide" href="#/">← Back to course</a></div>`;
}

async function viewLesson(unitId) {
  const course = await currentCourse();
  const found = findUnit(course, unitId);
  if (!found) { location.hash = "#/"; return; }
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
  const hash = location.hash || "#/";
  const parts = hash.slice(2).split("/").filter(Boolean);
  updateStats();
  try {
    if (parts[0] === "languages") return await viewLanguagePicker();
    if (parts[0] === "unit") return await viewUnit(parts[1]);
    if (parts[0] === "lesson") return await viewLesson(parts[1]);
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
