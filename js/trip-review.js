// The Review tab — self-serve practice, separate from the prescribed daily
// lesson. Two modes: word flashcards (flip + self-rate) and grammar quizzes
// (MC over the rungs you've climbed). Both write to the same FSRS memory model,
// so a review session here lightens tomorrow's warm-up automatically.
import { getItems, recordResult } from "./storage.js";
import { retrievability } from "./srs.js";
import { speak, primeTTS } from "./tts.js";
import { renderLessonSession } from "./lesson.js";
import { isRungKey, introducedRungIds, rungExercises } from "./grammar.js";
import { shuffled } from "./exercises.js";
import { generatePractice, isSignedIn } from "./ai.js";
import { classColorVar } from "./morphemes.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Started vocabulary for this pack (grammar-rung records excluded), most-faded
// first so review time lands where memory is weakest.
function reviewWords(code) {
  const now = Date.now();
  return getItems(code)
    .filter((i) => i.reps > 0 && !isRungKey(i.key))
    .map((i) => ({ ...i, ret: i.S ? retrievability(i, now) : 0 }))
    .sort((a, b) => a.ret - b.ret);
}

export function renderReview(ctx) {
  const { app } = ctx;
  const mode = ctx.reviewMode || "cards";
  const words = reviewWords(ctx.code);
  const introduced = introducedRungIds(new Map(getItems(ctx.code).map((i) => [i.key, i])));

  app.innerHTML = `
    <div class="trip-review">
      <h1 class="rv-title">Practice</h1>
      <div class="rv-seg">
        <button class="rv-tab ${mode === "cards" ? "on" : ""}" data-mode="cards">Words</button>
        <button class="rv-tab ${mode === "grammar" ? "on" : ""}" data-mode="grammar">Grammar</button>
        ${ctx.morphemes ? `<button class="rv-tab ${mode === "build" ? "on" : ""}" data-mode="build">Build</button>` : ""}
        <button class="rv-tab ${mode === "ai" ? "on" : ""}" data-mode="ai">AI</button>
      </div>
      <div id="rv-body"></div>
    </div>
    ${ctx.tabbar || ""}`;

  app.querySelectorAll(".rv-tab").forEach((b) =>
    b.addEventListener("click", () => { ctx.reviewMode = b.dataset.mode; renderReview(ctx); }));

  if (mode === "cards") renderFlashcards(ctx, words);
  else if (mode === "ai") renderAIPractice(ctx);
  else if (mode === "build") renderMorphemeKey(ctx);
  else renderGrammar(ctx, introduced);
}

// ---------- the morpheme colour key (how words are built) ----------

const CLASS_LABEL = { tense: "time", person: "who", neg: "not", q: "question", poss: "whose", root: "meaning" };

function renderMorphemeKey(ctx) {
  const body = ctx.app.querySelector("#rv-body");
  const inv = ctx.morphemes;
  const list = inv?.morphemes || [];
  if (!list.length) {
    body.innerHTML = `<p class="rv-empty">No decoder key for this course yet.</p>`;
    return;
  }
  // Legend: which colour means what — the key the learner internalizes.
  const usedClasses = [...new Set(list.map((m) => m.cls || "root"))];
  const legend = usedClasses.map((c) =>
    `<span><i style="background:var(${classColorVar(c)})"></i>${esc(CLASS_LABEL[c] || c)}</span>`).join("");

  const cards = list.map((m) => {
    const cls = m.cls || "root";
    const egs = (m.examples || []).map((e) =>
      `<span class="mph-eg"><b>${esc(e.w)}</b> <span>${esc(e.m)}</span></span>`).join("");
    return `<div class="mph-card" style="--mc:var(${classColorVar(cls)})">
      <div class="mph-card-top">
        <span class="mph-surface">${esc(m.surface)}</span>
        <span class="mph-role ${m.role === "produce" ? "produce" : ""}">${m.role === "produce" ? "use it" : "spot it"}</span>
      </div>
      <div class="mph-gloss">${esc(m.gloss)}</div>
      ${egs ? `<div class="mph-egs">${egs}</div>` : ""}
    </div>`;
  }).join("");

  body.innerHTML = `
    <p class="mph-intro">${esc(inv.note || "Learn these decoders and you can gist words you were never taught.")}</p>
    <div class="mph-legend">${legend}</div>
    <div class="mph-list">${cards}</div>`;
}

// ---------- AI practice (fresh recombinant drills, on demand) ----------

function renderAIPractice(ctx) {
  const body = ctx.app.querySelector("#rv-body");
  const records = new Map(getItems(ctx.code).map((i) => [i.key, i]));
  const known = getItems(ctx.code)
    .filter((i) => i.reps > 0 && !isRungKey(i.key))
    .map((i) => ({ roman: i.roman || i.target || i.key, english: i.english || "" }));

  if (known.length < 6) {
    body.innerHTML = `<p class="rv-empty">Learn a few more words first — AI practice needs a small vocabulary to recombine.</p>`;
    return;
  }
  body.innerHTML = `
    <p class="rv-lead">Fresh drills built from the words you know — a new set every time.</p>
    <button class="btn wide" id="rv-ai-go">Generate practice</button>
    <div id="rv-ai-msg"></div>`;

  body.querySelector("#rv-ai-go").addEventListener("click", async () => {
    const msg = body.querySelector("#rv-ai-msg");
    if (!(await isSignedIn())) {
      msg.innerHTML = `<p class="rv-empty">Sign in on the <b>Account</b> tab to use AI practice.</p>`;
      return;
    }
    body.querySelector("#rv-ai-go").disabled = true;
    msg.innerHTML = `<p class="scn-prep">Building fresh practice…</p>`;
    const done = introducedRungIds(records);
    const rungs = (ctx.grammar?.rungs || []).filter((r) => done.has(r.id)).map((r) => ({ title: r.title }));
    const items = await generatePractice({ destination: ctx.pack?.destination || "", moduleTitle: "review", known, rungs, count: 4 });
    if (!items.length) {
      msg.innerHTML = `<p class="rv-empty">Couldn't reach the coach — try again in a moment.</p>`;
      body.querySelector("#rv-ai-go").disabled = false;
      return;
    }
    primeTTS();
    renderLessonSession(ctx.app, ctx.course, "review", {
      id: "review-ai", title: "AI practice", warmup: [], teach: [], grammar: [], culture: [],
      exercises: items, newCount: 0, reviewCount: items.length,
    }, () => {}, { isPractice: true, backHref: "#review", noAutoplay: true });
  });
}

// ---------- word flashcards ----------

function renderFlashcards(ctx, words) {
  const body = ctx.app.querySelector("#rv-body");
  if (!words.length) {
    body.innerHTML = `<p class="rv-empty">No words to review yet — do a daily lesson first, and words you've started will show up here.</p>`;
    return;
  }
  primeTTS();
  let i = 0;
  let flipped = false;

  function draw() {
    const w = words[i];
    body.innerHTML = `
      <div class="rv-count">${i + 1} / ${words.length}</div>
      <div class="rv-card" id="card">
        <div class="rv-front">${esc(w.target || w.roman)}</div>
        ${flipped ? `
          <div class="rv-back">
            <div class="rv-eng">${esc(w.english || "")}</div>
            ${w.note ? `<div class="rv-note">${esc(w.note)}</div>` : ""}
            <button class="speak-btn" id="say">🔊 Listen</button>
          </div>` : `<div class="rv-hint">tap to reveal</div>`}
      </div>
      ${flipped ? `
        <div class="rv-rate">
          <button class="btn ghost rv-miss" id="miss">Missed it</button>
          <button class="btn rv-got" id="got">Got it</button>
        </div>` : ""}`;

    body.querySelector("#card").addEventListener("click", (e) => {
      if (e.target.closest("#say") || e.target.closest(".rv-rate")) return;
      if (!flipped) { flipped = true; draw(); }
    });
    body.querySelector("#say")?.addEventListener("click", () =>
      speak(w.roman || w.target, ctx.course, w.audio ? `data/${ctx.code}/${w.audio}` : undefined));
    body.querySelector("#got")?.addEventListener("click", () => rate(true));
    body.querySelector("#miss")?.addEventListener("click", () => rate(false));
    if (flipped) speak(w.roman || w.target, ctx.course, w.audio ? `data/${ctx.code}/${w.audio}` : undefined);
  }

  function rate(good) {
    const w = words[i];
    recordResult(ctx.code, w.key, good);
    i++;
    flipped = false;
    if (i >= words.length) {
      body.innerHTML = `
        <div class="rv-done">
          <div class="big-emoji">💪</div>
          <p>Reviewed ${words.length} ${words.length === 1 ? "word" : "words"}. Nice.</p>
          <button class="btn wide" id="again">Review again</button>
        </div>`;
      body.querySelector("#again").addEventListener("click", () => renderReview(ctx));
      return;
    }
    draw();
  }

  draw();
}

// ---------- grammar quizzes ----------

function renderGrammar(ctx, introduced) {
  const body = ctx.app.querySelector("#rv-body");
  const rungs = (ctx.grammar.rungs || []).filter((r) => introduced.has(r.id));
  if (!rungs.length) {
    body.innerHTML = `<p class="rv-empty">No grammar to quiz yet — the daily lesson introduces grammar a little at a time. Come back once you've learned a rule or two.</p>`;
    return;
  }
  body.innerHTML = `
    <p class="rv-lead">Test yourself on the grammar you've learned so far.</p>
    <div class="rv-rungs">
      ${rungs.map((r) => `
        <div class="rv-rung">
          <span class="rv-rung-name">${esc(r.title)}</span>
          <button class="btn small" data-rung="${esc(r.id)}">Quiz</button>
        </div>`).join("")}
    </div>
    <button class="btn wide" id="quiz-all">Quiz me on everything</button>`;

  const start = (pool) => {
    const exercises = shuffled(pool.flatMap((r) => rungExercises(r)));
    if (!exercises.length) return;
    const lesson = {
      id: "review-grammar", title: "Grammar review",
      warmup: [], teach: [], grammar: [], culture: [],
      exercises, newCount: 0, reviewCount: exercises.length,
    };
    primeTTS();
    renderLessonSession(ctx.app, ctx.course, "review", lesson, () => {}, { isPractice: true, backHref: "#review" });
  };

  body.querySelectorAll("[data-rung]").forEach((b) =>
    b.addEventListener("click", () => start(rungs.filter((r) => r.id === b.dataset.rung))));
  body.querySelector("#quiz-all").addEventListener("click", () => start(rungs));
}
