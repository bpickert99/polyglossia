// Reading comprehension: one authored passage per unit, unlocked once the
// learner knows enough of that unit's vocabulary to actually read it. Not
// tied to the per-word SRS/Birdbrain model — it's a one-off comprehension
// check, not a recall drill (see js/practice.js for why: comprehension of
// connected text doesn't map onto a single vocabulary key).
import { addXP, markLessonComplete, isLessonComplete } from "./storage.js";

const READING_LESSON_ID = "reading";

export function isReadingComplete(lang, unitId) {
  return isLessonComplete(lang, unitId, READING_LESSON_ID);
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

export function renderReadingSession(app, course, unitId, reading, onStatsChanged, backHref) {
  let qIndex = -1; // -1 = showing the passage, before questions start
  let correct = 0;

  function frame(inner, footer) {
    app.innerHTML = `
      <div class="session-top">
        <a class="session-quit" href="${backHref}" title="Quit">✕</a>
      </div>
      ${inner}
      <div class="session-footer">${footer || ""}</div>`;
  }

  function showPassage() {
    frame(`
      <div class="reading-card">
        <span class="reading-tag">📖 Reading</span>
        <h1>${esc(reading.title)}</h1>
        ${reading.passage.map((p) => `<p>${esc(p)}</p>`).join("")}
      </div>`,
      `<button class="btn wide" id="continue">${reading.questions?.length ? "Answer questions" : "Done"}</button>`);
    app.querySelector("#continue").addEventListener("click", () => { qIndex = 0; showQuestion(); });
  }

  function feedback(good, message, onNext) {
    const el = document.createElement("div");
    el.className = `feedback ${good ? "good" : "bad"}`;
    el.innerHTML = `
      <div class="fb-inner">
        <h3>${good ? "Nicely done!" : "Not quite."}</h3>
        <p>${esc(message || "")}</p>
        <button class="btn wide ${good ? "" : "red"}" id="fb-next">Continue</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#fb-next").addEventListener("click", () => {
      el.remove();
      onNext();
    });
  }

  function showQuestion() {
    const questions = reading.questions || [];
    if (qIndex >= questions.length) return finish();
    const q = questions[qIndex];
    const order = shuffled(q.choices.map((c, i) => ({ c, i })));
    frame(`
      <div class="exercise">
        <span class="review-chip">Question ${qIndex + 1} of ${questions.length}</span>
        <h2>${esc(q.prompt)}</h2>
        <div class="choices" style="margin-top:14px">
          ${order.map((o) => `<button class="choice target" data-i="${o.i}">${esc(o.c)}</button>`).join("")}
        </div>
      </div>`);
    app.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      const good = Number(b.dataset.i) === q.answer;
      b.classList.add(good ? "correct" : "wrong");
      app.querySelectorAll(".choice").forEach((x) => (x.disabled = true));
      if (good) correct++;
      feedback(good, good ? "" : `Correct answer: ${q.choices[q.answer]}`, () => { qIndex++; showQuestion(); });
    }));
  }

  function finish() {
    markLessonComplete(course.code, unitId, READING_LESSON_ID);
    addXP(20);
    onStatsChanged();
    const total = reading.questions?.length || 0;
    const acc = total ? Math.round((correct / total) * 100) : 100;
    app.innerHTML = `
      <div class="complete">
        <div class="big-emoji">📖</div>
        <h1>Reading complete!</h1>
        <p>${total ? `${acc}% comprehension` : "Nice reading!"}</p>
        <div class="xp-chip">+20 XP</div>
        <div><a class="btn wide" href="${backHref}">Continue</a></div>
      </div>`;
  }

  showPassage();
}
