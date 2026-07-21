// Reading comprehension: one authored passage per unit, unlocked once the
// learner knows enough of that unit's vocabulary to actually read it. Not
// tied to the per-word SRS/Birdbrain model for the comprehension check itself
// — that's a one-off check, not a recall drill (see js/practice.js for why:
// comprehension of connected text doesn't map onto a single vocabulary key).
// Individual words in the passage ARE tappable though (LingQ-style): tap any
// word you already know for its gloss, with an option to explicitly enroll
// it in spaced repetition — reading becomes a source of review, not a dead end.
import { addXP, markLessonComplete, isLessonComplete, getItems, recordResult } from "./storage.js";
import { loadUnit } from "./data.js";
import { poolFromUnit } from "./lesson-builder.js";

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

// Every single-word item taught up to and including this unit (course order),
// keyed both by its own item key and by lowercased surface token, so passage
// words can be matched and glossed regardless of how they're capitalized.
async function buildKnownIndex(course, unitId) {
  const byKey = new Map();
  const tokenToKey = new Map();
  outer:
  for (const section of course.sections) {
    for (const u of section.units || []) {
      let data;
      try { data = await loadUnit(course.code, u.file); } catch { continue; }
      for (const item of poolFromUnit(data)) {
        const tokens = (item.roman || item.target).split(/\s+/);
        if (tokens.length !== 1) continue; // only single words are glossable in place
        byKey.set(item.key, item);
        const tok = tokens[0].toLowerCase();
        if (!tokenToKey.has(tok)) tokenToKey.set(tok, item.key);
      }
      if (u.id === unitId) break outer;
    }
  }
  return { byKey, tokenToKey };
}

function renderParagraph(text, tokenToKey) {
  return esc(text).replace(/[A-Za-zÀ-ÿ'’-]+/g, (word) => {
    const key = tokenToKey.get(word.toLowerCase());
    return key ? `<span class="tap-word" data-key="${esc(key)}">${word}</span>` : word;
  });
}

export async function renderReadingSession(app, course, unitId, reading, onStatsChanged, backHref) {
  let qIndex = -1; // -1 = showing the passage, before questions start
  let correct = 0;
  const { byKey, tokenToKey } = await buildKnownIndex(course, unitId);

  function frame(inner, footer) {
    app.innerHTML = `
      <div class="session-top">
        <a class="session-quit" href="${backHref}" title="Quit">✕</a>
      </div>
      ${inner}
      <div class="session-footer">${footer || ""}</div>`;
  }

  let openGloss = null;
  function closeGloss() {
    if (!openGloss) return;
    openGloss.remove();
    openGloss = null;
    document.removeEventListener("click", onGlossDocClick, true);
  }
  function onGlossDocClick(e) {
    if (openGloss && !openGloss.contains(e.target) && !e.target.classList.contains("tap-word")) closeGloss();
  }
  function openGlossFor(el, item) {
    closeGloss();
    const tracked = getItems(course.code).some((i) => i.key === item.key);
    const pop = document.createElement("div");
    pop.className = "gloss-popover";
    pop.innerHTML = `
      <div class="gloss-word">${esc(item.roman || item.target)}</div>
      <div class="gloss-eng">${esc(item.english)}</div>
      ${tracked
        ? `<span class="gloss-tracked">🔁 In review</span>`
        : `<button class="btn blue" id="gloss-add">+ Add to review</button>`}`;
    document.body.appendChild(pop);
    const rect = el.getBoundingClientRect();
    pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
    let left = rect.left + window.scrollX;
    left = Math.max(8, Math.min(left, window.innerWidth - pop.offsetWidth - 8));
    pop.style.left = `${left}px`;
    openGloss = pop;
    const addBtn = pop.querySelector("#gloss-add");
    if (addBtn) addBtn.addEventListener("click", () => {
      recordResult(course.code, item.key, true, {
        target: item.target, roman: item.roman, english: item.english,
        level: item.level, ipa: item.ipa, audio: item.audio, note: item.note,
      });
      openGlossFor(el, item);
    });
    setTimeout(() => document.addEventListener("click", onGlossDocClick, true), 0);
  }

  function wireTapWords() {
    app.querySelectorAll(".tap-word").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = byKey.get(el.dataset.key);
        if (item) openGlossFor(el, item);
      });
    });
  }

  function showPassage() {
    frame(`
      <div class="reading-card">
        <span class="reading-tag">📖 Reading</span>
        <h1>${esc(reading.title)}</h1>
        ${reading.passage.map((p) => `<p>${renderParagraph(p, tokenToKey)}</p>`).join("")}
        <p class="muted" style="margin-top:10px">Tap any underlined word for its meaning.</p>
      </div>`,
      `<button class="btn wide" id="continue">${reading.questions?.length ? "Answer questions" : "Done"}</button>`);
    wireTapWords();
    app.querySelector("#continue").addEventListener("click", () => { closeGloss(); qIndex = 0; showQuestion(); });
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
