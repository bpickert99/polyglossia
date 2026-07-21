// Unit writing checkpoint: an open, ungraded production task using this
// unit's vocabulary. Task-based teaching's output half to reading's input
// half — not tied to the SRS/Birdbrain model, just a nudge to actively
// produce the language instead of only ever recognizing it. Doesn't need an
// authored passage (unlike reading), so it's available for every unit.
import { addXP, markLessonComplete, isLessonComplete } from "./storage.js";
import { poolFromUnit } from "./lesson-builder.js";

const WRITING_LESSON_ID = "writing";

export function isWritingComplete(lang, unitId) {
  return isLessonComplete(lang, unitId, WRITING_LESSON_ID);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function renderWritingSession(app, course, unitId, unitData, onStatsChanged, backHref) {
  const pool = poolFromUnit(unitData).filter((i) => i.target && i.english);
  const prompts = shuffled(pool).slice(0, 5);

  app.innerHTML = `
    <div class="session-top">
      <a class="session-quit" href="${backHref}" title="Quit">✕</a>
    </div>
    <div class="reading-card">
      <span class="reading-tag">📝 Writing</span>
      <h1>Say it yourself</h1>
      <p>Write 2–3 sentences in Interlingua using at least two of these:</p>
      <div class="writing-words">
        ${prompts.map((p) => `<span class="tag">${esc(p.roman || p.target)}</span>`).join("")}
      </div>
      <textarea class="writing-input type-input" id="writing-answer" rows="5" placeholder="Scribe hic..."></textarea>
      <p class="muted" style="margin-top:8px">Ungraded — this is for you. There's no wrong answer, just practice putting words together.</p>
    </div>
    <div class="session-footer">
      <button class="btn wide" id="finish" disabled>Done</button>
    </div>`;

  const input = app.querySelector("#writing-answer");
  const finishBtn = app.querySelector("#finish");
  input.addEventListener("input", () => { finishBtn.disabled = input.value.trim().length < 4; });
  finishBtn.addEventListener("click", () => {
    markLessonComplete(course.code, unitId, WRITING_LESSON_ID);
    addXP(15);
    onStatsChanged();
    app.innerHTML = `
      <div class="complete">
        <div class="big-emoji">📝</div>
        <h1>Nice work!</h1>
        <p>Producing the language — not just recognizing it — is where it really sticks.</p>
        <div class="xp-chip">+15 XP</div>
        <div><a class="btn wide" href="${backHref}">Continue</a></div>
      </div>`;
  });
}
