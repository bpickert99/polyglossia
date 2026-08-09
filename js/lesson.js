import { speak, ttsMode, ipaFor, primeTTS } from "./tts.js";
import { addXP, recordResult, touchItem, resetLapseStreak } from "./storage.js";

const XP_PER_EXERCISE = 10;
const XP_LESSON_BONUS = 20;

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

// Very small markdown-ish renderer for grammar/culture bodies:
// paragraphs, **bold**, *italic*, and | tables |.
function renderBody(text) {
  const lines = String(text || "").split("\n");
  let html = "", table = [];
  const flushTable = () => {
    if (!table.length) return;
    html += "<table>" + table.map((row) =>
      "<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</table>";
    table = [];
  };
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>");
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|")) {
      const cells = t.split("|").slice(1, -1).map((c) => c.trim());
      if (!cells.every((c) => /^-+$/.test(c))) table.push(cells);
    } else {
      flushTable();
      if (t) html += `<p>${inline(t)}</p>`;
    }
  }
  flushTable();
  return html;
}

// Figure out which vocabulary item(s) an exercise is testing so results feed
// the learner model. Practice-generated exercises carry explicit keys; for
// authored lessons we match against the lesson's teach items.
function makeKeyResolver(teach) {
  const items = (teach || []).map((t) => ({ ...t, key: t.roman || t.target }));
  const byRoman = new Map(items.map((i) => [i.roman, i]));
  const find = (pred) => items.find(pred);
  return (ex) => {
    if (ex.keys) return ex.keys;
    if (ex.key) return [ex.key];
    if (ex.type === "match") {
      return (ex.pairs || [])
        .map(([a, b]) => find((i) => i.target === a || i.english === b || i.roman === a))
        .filter(Boolean)
        .map((i) => i.key);
    }
    const spoken = ex.tts || ex.ttsText;
    if (spoken && byRoman.has(spoken)) return [byRoman.get(spoken).key];
    if (typeof ex.answer === "string") {
      const m = find((i) => i.roman === ex.answer);
      if (m) return [m.key];
    }
    if (Number.isInteger(ex.answer) && ex.choices) {
      const winner = ex.choices[ex.answer];
      const m = find((i) => winner.includes(i.target) || winner === i.english || winner.includes(i.roman || " "));
      if (m) return [m.key];
    }
    const m = find((i) => (ex.prompt || "").includes(i.target));
    return m ? [m.key] : [];
  };
}

// opts: { isPractice: bool, backHref: string }
export function renderLessonSession(app, course, unitId, lesson, onStatsChanged, opts = {}) {
  const approx = ttsMode(course) === "approximate";
  const ttsBadge = approx ? `<span class="tts-badge">≈ approx.</span>` : "";
  const backHref = opts.backHref || `#/unit/${esc(unitId)}`;
  // teachAll accumulates every taught item — the initial lesson plus anything an
  // extension segment adds mid-session — so the key resolver keeps mapping
  // exercises to items after the day is lengthened. Rebound by pushParts().
  const teachAll = [...(lesson.teach || [])];
  let resolveKeys = makeKeyResolver(teachAll);
  const startedAt = Date.now(); // for the time-budgeted day (see day-engine.js)
  let extendRounds = 0, consolidations = 0;
  primeTTS(); // start loading the phonemic engine so the first word is ready (fallback path)

  // A pre-rendered natural-audio path, resolved relative to the course's data dir.
  const resolveAudio = (rel) => (rel ? `data/${course.code}/${rel}` : "");

  // IPA markup: instant if already computed (from scripts/gen-audio.py), else a
  // placeholder that fillIPA() fills in asynchronously from the live engine.
  function ipaHtml(item) {
    if (item.ipa) return `<div class="ipa">/${esc(item.ipa)}/</div>`;
    return `<div class="ipa" data-ipa-for="${esc(item.roman || item.target)}"></div>`;
  }

  function fillIPA() {
    app.querySelectorAll("[data-ipa-for]").forEach(async (el) => {
      if (el.dataset.done) return;
      el.dataset.done = "1";
      const ipa = await ipaFor(el.dataset.ipaFor, course);
      if (ipa) el.textContent = `/${ipa}/`;
    });
  }

  // Step queue: a couple of urgent review items first (so the session opens
  // with something familiar, not a wall of new material), then teach cards,
  // notes, and the rest of the lesson's exercises.
  const steps = [];
  let sections = [];
  let stepIndex = 0;
  let correctCount = 0;
  let exercisesDone = 0;

  // Turn a lesson (or an extension segment with the same shape) into steps and
  // append them. Used for the initial lesson and again each time the day is
  // lengthened, so one code path builds every segment. An optional banner note
  // leads the segment to explain why the lesson kept going.
  function pushParts(parts) {
    const before = steps.length;
    if (parts.banner) steps.push({ kind: "note", note: parts.banner, section: parts.banner.section || "More" });
    for (const note of parts.foundations || []) steps.push({ kind: "foundations", note, section: "Read" });
    for (const ex of parts.warmup || []) steps.push({ kind: "exercise", ex, section: "Warm-up" });
    for (const item of parts.teach || []) { steps.push({ kind: "teach", item, section: "Words" }); teachAll.push(item); }
    for (const note of parts.grammar || []) steps.push({ kind: "grammar", note, section: "Grammar" });
    for (const note of parts.culture || []) steps.push({ kind: "culture", note, section: "Culture" });
    for (const ex of parts.exercises || []) steps.push({ kind: "exercise", ex, section: "Practice" });
    resolveKeys = makeKeyResolver(teachAll);
    rebuildSections();
    return steps.length - before;
  }

  function progressPct() {
    return Math.min(100, Math.round((stepIndex / Math.max(1, steps.length)) * 100));
  }

  // The named sections in order, each with its step range — for the segmented
  // progress rail (a learner sees where they are across the whole lesson, and
  // how far in overall, not just one anonymous bar). Recomputed whenever steps
  // change (a missed-item requeue, or a mid-session extension).
  function rebuildSections() {
    sections = [];
    steps.forEach((s, i) => {
      const last = sections[sections.length - 1];
      if (last && last.name === s.section) last.end = i + 1;
      else sections.push({ name: s.section, start: i, end: i + 1 });
    });
  }

  pushParts(lesson);

  function railHtml() {
    if (sections.length < 2) return `<div class="progressbar"><div style="width:${progressPct()}%"></div></div>`;
    const segs = sections.map((sec) => {
      const span = Math.max(1, sec.end - sec.start);
      const fill = Math.max(0, Math.min(1, (stepIndex - sec.start) / span));
      const active = stepIndex >= sec.start && stepIndex < sec.end;
      return `<div class="rail-seg ${active ? "active" : ""}" title="${esc(sec.name)}">
        <span class="rail-fill" style="width:${Math.round(fill * 100)}%"></span></div>`;
    }).join("");
    return `<div class="section-rail">${segs}</div>`;
  }

  function railLabel() {
    if (sections.length < 2) return "";
    const current = sections.find((s) => stepIndex >= s.start && stepIndex < s.end) || sections[sections.length - 1];
    return `<div class="rail-label"><span>${esc(current.name)}</span><span>${progressPct()}%</span></div>`;
  }

  // "5 new · 7 review" — shown once, up front, so the session's shape isn't a
  // surprise. Only meaningful for real lessons; practice sessions are all review.
  const sessionShape = opts.isPractice
    ? ""
    : `<div class="session-shape">${[
        lesson.newCount ? `${lesson.newCount} new` : null,
        lesson.reviewCount ? `${lesson.reviewCount} review` : null,
      ].filter(Boolean).join(" · ")}</div>`;

  function frame(inner, footer) {
    app.innerHTML = `
      <div class="session-top">
        <div class="session-top-row">
          <a class="session-quit" href="${backHref}" title="Quit">✕</a>
          ${railHtml()}
        </div>
        ${railLabel()}
      </div>
      ${stepIndex === 0 ? sessionShape : ""}
      ${inner}
      <div class="session-footer">${footer || ""}</div>`;
  }

  function speakBtn(text, audio, label = "🔊 Listen") {
    const badge = audio ? "" : ttsBadge; // pre-rendered audio needs no caveat badge
    return `<button class="speak-btn" data-say="${esc(text)}" data-audio="${esc(audio || "")}">${label}${badge}</button>`;
  }

  function wireSpeech() {
    app.querySelectorAll("[data-say]").forEach((b) =>
      b.addEventListener("click", () => speak(b.dataset.say, course, b.dataset.audio || undefined)));
  }

  async function next() {
    stepIndex++;
    if (stepIndex >= steps.length) return maybeExtendOrFinish();
    show(steps[stepIndex]);
  }

  // When the planned steps run out, ask the caller (which owns the BirdBrain
  // gate — see day-engine.js) whether to lengthen the day. It returns a segment
  // of the same shape as a lesson, or null to finish. lesson.js stays dumb about
  // the decision: it just renders whatever comes back and keeps time.
  async function maybeExtendOrFinish() {
    if (!opts.onExhausted) return finish();
    let seg = null;
    try {
      seg = await opts.onExhausted({
        elapsedMs: Date.now() - startedAt,
        exercisesDone, correctCount, extendRounds, consolidations,
      });
    } catch { seg = null; }
    if (!seg || !seg.parts) return finish();
    if (seg.move === "consolidate") consolidations++;
    else if (seg.move === "extend") extendRounds++;
    const added = pushParts(seg.parts);
    if (added <= 0 || stepIndex >= steps.length) return finish();
    return show(steps[stepIndex]);
  }

  function show(step) {
    if (step.kind === "teach") return showTeach(step.item);
    if (step.kind === "note") return showNote(step.note, step.note.cls || "grammar-box", step.note.tag || "");
    if (step.kind === "foundations") return showNote(step.note, "grammar-box", "📖 How to read this");
    if (step.kind === "grammar") return showNote(step.note, "grammar-box", "📐 Grammar");
    if (step.kind === "culture") return showNote(step.note, "culture-box", "🏛️ Culture note");
    return showExercise(step.ex);
  }

  function showTeach(item) {
    // Register the word with the learner model as soon as it's introduced.
    touchItem(course.code, item.roman || item.target, {
      target: item.target, roman: item.roman, english: item.english, unitId, level: item.level,
      ipa: item.ipa, audio: item.audio, note: item.note,
    });
    const showRoman = item.roman && item.roman !== item.target;
    const audio = resolveAudio(item.audio);
    frame(`
      <div class="teach-card">
        <div class="big target">${esc(item.target)}</div>
        ${ipaHtml(item)}
        ${showRoman ? `<div class="roman">${esc(item.roman)}</div>` : ""}
        <div class="eng">${esc(item.english)}</div>
        ${item.note ? `<div class="note">${esc(item.note)}</div>` : ""}
        ${speakBtn(item.roman || item.target, audio)}
      </div>`,
      `<button class="btn wide" id="continue">Continue</button>`);
    wireSpeech();
    fillIPA();
    if (!opts.noAutoplay) speak(item.roman || item.target, course, audio);
    app.querySelector("#continue").addEventListener("click", next);
  }

  function showNote(note, cls, tag) {
    frame(`
      <div class="${cls}">
        <h3>${tag}${note.title ? ` — ${esc(note.title)}` : ""}</h3>
        ${renderBody(note.body)}
      </div>`,
      `<button class="btn wide" id="continue">Continue</button>`);
    app.querySelector("#continue").addEventListener("click", next);
  }

  // Grades the exercise and turns the same bottom button into "Continue" in
  // place — no separate slide-up panel. Bookkeeping happens immediately;
  // Continue just advances.
  // Hard-case tutoring: ask the caller's AI (if wired) to diagnose a miss and
  // inject the answer above Continue when it arrives — best-effort, non-blocking,
  // and discarded if the learner has already advanced. lesson.js stays decoupled:
  // it only calls opts.explain, which the trip app points at the AI proxy.
  function requestExplanation(ctx, footer, beforeSel) {
    if (!opts.explain || !footer) return;
    Promise.resolve(opts.explain(ctx)).then((r) => {
      if (!r || (!r.why && !r.tip) || !footer.isConnected) return;
      const p = document.createElement("p");
      p.className = "check-note ai-explain";
      p.innerHTML = `💡 ${esc(r.why || "")}${r.tip ? ` ${esc(r.tip)}` : ""}${r.example ? ` <b>${esc(r.example)}</b>` : ""}`;
      footer.insertBefore(p, footer.querySelector(beforeSel));
    }).catch(() => {});
  }

  function showResult(ex, good, message, info = {}) {
    exercisesDone++;
    // Feed the learner model — this drives spacing and error targeting.
    for (const key of resolveKeys(ex)) {
      recordResult(course.code, key, good);
    }
    if (good) {
      correctCount++;
      addXP(XP_PER_EXERCISE);
      onStatsChanged();
    } else if (!ex.retry) {
      // A first miss comes back once, at the end of the session, for a second
      // try. The retry flag lives on the exercise itself (not just the step
      // wrapper) so the renderers below can actually see it. A miss on that
      // second try does NOT requeue again — without this cap, a learner (or
      // exercise) that keeps missing the same item could keep the session
      // growing forever with no guaranteed end.
      steps.push({ kind: "exercise", ex: { ...ex, retry: true }, section: "Practice" });
      rebuildSections();
    }
    // A wrong answer is exactly when the item's authored note (why this word
    // works the way it does) is worth showing — not at teach time, when the
    // learner hasn't yet made the mistake it explains.
    const note = !good ? ex.note : undefined;
    const footer = app.querySelector(".session-footer");
    footer.innerHTML = `
      ${message ? `<p class="check-msg ${good ? "good" : "bad"}">${esc(message)}</p>` : ""}
      ${note ? `<p class="check-note">${esc(note)}</p>` : ""}
      <button class="btn wide ${good ? "" : "red"}" id="main-action">Continue</button>`;
    footer.querySelector("#main-action").addEventListener("click", next);
    // Grammar is where a "why" pays off most; routine vocab slips stay the
    // scheduler's job (no AI call) — this keeps the tutor to the hard cases.
    if (!good && ex.grammar) {
      requestExplanation({
        kind: "grammar", prompt: ex.prompt,
        correct: info.correct ?? (ex.choices ? ex.choices[ex.answer] : ex.answer),
        chosen: info.chosen, rung: ex.rungId,
      }, footer, "#main-action");
    }
  }

  function reviewChip(ex) {
    return ex.review ? `<span class="review-chip">🔁 Review</span>` : "";
  }

  function compositeChip(ex) {
    return ex.composite ? `<span class="review-chip composite-chip">🔗 Combines two things you know</span>` : "";
  }

  function retryChip(ex) {
    return ex.retry ? `<span class="retry-chip">↻ Second try</span>` : "";
  }

  function showExercise(ex) {
    if (ex.type === "reteach") return showReteachCard(ex);
    if (ex.type === "gist") return showGist(ex);
    if (ex.type === "shadow") return showShadow(ex);
    if (ex.type === "match") return showMatch(ex);
    if (ex.type === "type") return showType(ex);
    if (ex.type === "dictation") return showDictation(ex);
    if (ex.type === "listen") return showListen(ex);
    if (ex.type === "order") return showOrder(ex);
    return showMC(ex);
  }

  // Gist comprehension: hear a reply in the target language and say what it
  // MEANS in English — the gist, not a literal translation. This trains the
  // receptive half of travel (understanding what comes back). Ungraded against
  // vocabulary (keys:[]), like the MC comprehension. When the caller wires an AI
  // scorer it judges the gist; otherwise the true meaning is revealed and the
  // learner self-assesses. Deliberately sidesteps ASR — the answer is in English.
  function recordGist(good) {
    exercisesDone++;
    if (good) { correctCount++; addXP(XP_PER_EXERCISE); onStatsChanged(); }
  }

  function showGist(ex) {
    const audio = resolveAudio(ex.audio);
    frame(`
      <div class="exercise">
        <span class="eyebrow">Listen · get the gist</span>
        <h2>${esc(ex.prompt || "What are they telling you?")}</h2>
        ${ex.ask ? `<p class="gist-ask">You ask: “${esc(ex.ask)}”</p>` : ""}
        <div class="gist-reply">
          <div class="gist-target">${esc(ex.reply)}</div>
          ${speakBtn(ex.tts || ex.reply, audio, "🔊 Hear it")}
        </div>
        <textarea class="type-input gist-input" id="gist" rows="2" autocomplete="off"
          placeholder="In English — what do they mean? Just the gist, not every word."></textarea>
      </div>`,
      `<button class="btn wide" id="check" disabled>Check</button>`);
    wireSpeech();
    speak(ex.tts || ex.reply, course, audio);
    const input = app.querySelector("#gist");
    const check = app.querySelector("#check");
    input.focus();
    input.addEventListener("input", () => { check.disabled = !input.value.trim(); });
    const run = async () => {
      if (check.disabled) return;
      check.disabled = true;
      input.disabled = true;
      const text = input.value.trim();
      let scored = null;
      if (opts.gistEval) {
        check.textContent = "Checking…";
        try { scored = await opts.gistEval({ reply: ex.reply, meaning: ex.english, userText: text }); } catch { scored = null; }
      }
      const footer = app.querySelector(".session-footer");
      if (scored && scored.verdict) {
        const good = scored.verdict === "good" || scored.verdict === "close";
        recordGist(good);
        footer.innerHTML = `
          <div class="scn-fb v-${scored.verdict}">
            <div class="scn-fb-line">${esc(scored.feedback || "")}</div>
            <div class="scn-fb-better">It means: <b>${esc(scored.better || ex.english || "")}</b></div>
          </div>
          <button class="btn wide ${good ? "" : "red"}" id="main-action">Continue</button>`;
        footer.querySelector("#main-action").addEventListener("click", next);
      } else {
        // No AI (or it failed): reveal the meaning and let the learner self-assess.
        footer.innerHTML = `
          <p class="check-note">It means: <b>${esc(ex.english || "")}</b></p>
          <p class="gist-self">Did you catch the gist?</p>
          <div class="gist-rate">
            <button class="btn" id="g-yes">I got it</button>
            <button class="btn ghost" id="g-no">Missed it</button>
          </div>`;
        footer.querySelector("#g-yes").addEventListener("click", () => { recordGist(true); next(); });
        footer.querySelector("#g-no").addEventListener("click", () => { recordGist(false); next(); });
      }
    };
    check.addEventListener("click", run);
  }

  // Shadowing: listen, record yourself, play both back to back, self-rate.
  // No speech recognition (Interlingua isn't in the Web Speech API's
  // language list) — this is deliberately low-tech, the self-comparison
  // version of the same technique.
  function showShadow(ex) {
    const audio = resolveAudio(ex.audio);
    let recorder = null, chunks = [], recordedUrl = null, recording = false, activeStream = null;
    frame(`
      <div class="exercise">
        ${reviewChip(ex)}${retryChip(ex)}${compositeChip(ex)}
        <h2>${esc(ex.prompt)}</h2>
        <div class="eng">${esc(ex.english)}</div>
        ${speakBtn(ex.tts, audio, "🔊 Listen")}
        <div class="shadow-controls">
          <button class="btn wide" id="rec-btn" type="button">🎙️ Record yourself</button>
          <button class="btn wide ghost" id="play-mine" type="button" disabled>▶️ Play mine</button>
        </div>
        <p class="muted" style="margin-top:10px">No scoring — just compare and judge for yourself.</p>
        <div id="shadow-rate" style="display:none;margin-top:16px">
          <p class="muted" style="text-align:center;margin-bottom:10px">How close was it?</p>
          <button class="btn wide" id="rate-good" type="button">🎯 Nailed it</button>
          <button class="btn wide ghost" id="rate-close" type="button">🙂 Close enough</button>
          <button class="btn wide red" id="rate-off" type="button">😅 Way off</button>
        </div>
      </div>`,
      `<button class="btn wide ghost" id="skip-shadow" type="button">⏭️ Skip — no mic right now</button>`);
    wireSpeech();
    speak(ex.tts, course, audio);

    const recBtn = app.querySelector("#rec-btn");
    const playBtn = app.querySelector("#play-mine");
    const rateBox = app.querySelector("#shadow-rate");
    const skipBtn = app.querySelector("#skip-shadow");

    recBtn.addEventListener("click", async () => {
      if (!recording) {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
          recBtn.textContent = "🎙️ Recording not supported in this browser";
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          activeStream = stream;
          chunks = [];
          recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = () => {
            recordedUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
            playBtn.disabled = false;
            rateBox.style.display = "block";
            stream.getTracks().forEach((t) => t.stop());
            activeStream = null;
          };
          recorder.start();
          recording = true;
          recBtn.textContent = "⏺️ Recording… tap to stop";
        } catch {
          recBtn.textContent = "🎙️ Microphone unavailable — check permissions";
        }
      } else {
        recorder.stop();
        recording = false;
        recBtn.textContent = "🎙️ Record again";
      }
    });
    playBtn.addEventListener("click", () => {
      if (recordedUrl) new Audio(recordedUrl).play();
    });
    app.querySelector("#rate-good").addEventListener("click", () => showResult(ex, true, ""));
    app.querySelector("#rate-close").addEventListener("click", () =>
      showResult(ex, true, "Good — keep an ear on the details next time."));
    app.querySelector("#rate-off").addEventListener("click", () =>
      showResult(ex, false, `Listen again a couple more times: ${ex.tts}`));

    // Never leave the learner stuck here — no mic, denied permission, or just
    // not in the mood to record. Ungraded: doesn't touch XP, accuracy, or the
    // FSRS schedule (same pattern as the leech reteach card's "Got it").
    skipBtn.addEventListener("click", () => {
      if (recording && recorder) {
        try { recorder.stop(); } catch { /* already stopped */ }
      }
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
      }
      next();
    });
  }

  // Sentence word-order: tap tiles from a shuffled bank (which includes a few
  // red-herring words from elsewhere in the pool) to build the target
  // sentence; tap a placed tile to send it back. "Check" appears once enough
  // tiles are placed to match the real answer length — herrings don't count
  // toward or against that, they're just there to be left unused. Tapping any
  // tile also speaks that single word (live phonemic synthesis — only whole
  // sentences get pre-rendered natural audio, not individual tokens).
  function showOrder(ex) {
    const items = ex.tokens.map((text, i) => ({ text, i, used: false }));
    const slots = [];
    let checked = false;

    function render() {
      if (checked) return;
      const done = slots.length === ex.answer.length;
      frame(`
        <div class="exercise">
          ${reviewChip(ex)}${retryChip(ex)}${compositeChip(ex)}
          <h2>${esc(ex.prompt)}</h2>
          ${ex.tts ? speakBtn(ex.tts, resolveAudio(ex.audio), "🔊 Hint") : ""}
          <div class="order-slots">
            ${slots.length
              ? slots.map((s) => `<button class="tile placed" data-i="${s.i}">${esc(s.text)}</button>`).join("")
              : `<span class="order-placeholder">Tap words below to build the sentence</span>`}
          </div>
          <div class="order-bank">
            ${items.filter((it) => !it.used).map((it) => `<button class="tile" data-i="${it.i}">${esc(it.text)}</button>`).join("")}
          </div>
        </div>`,
        `<button class="btn wide" id="check" ${done ? "" : "disabled"}>Check</button>`);
      wireSpeech();
      app.querySelectorAll(".order-bank .tile").forEach((b) => b.addEventListener("click", () => {
        const it = items[Number(b.dataset.i)];
        speak(it.text, course);
        it.used = true;
        slots.push(it);
        render();
      }));
      app.querySelectorAll(".order-slots .tile").forEach((b) => b.addEventListener("click", () => {
        const idx = Number(b.dataset.i);
        speak(items[idx].text, course);
        items[idx].used = false;
        const pos = slots.findIndex((s) => s.i === idx);
        if (pos >= 0) slots.splice(pos, 1);
        render();
      }));
      const check = app.querySelector("#check");
      if (done) check.addEventListener("click", () => {
        checked = true;
        const built = slots.map((s) => s.text);
        const good = built.length === ex.answer.length &&
          built.every((w, i) => w.toLowerCase() === ex.answer[i].toLowerCase());
        app.querySelectorAll(".order-slots .tile").forEach((b) => {
          b.disabled = true;
          b.classList.add(good ? "correct" : "wrong");
        });
        app.querySelectorAll(".order-bank .tile").forEach((b) => (b.disabled = true));
        showResult(ex, good, good ? "" : `Correct order: ${ex.answer.join(" ")}`);
      });
    }
    render();
    if (ex.tts) speak(ex.tts, course, resolveAudio(ex.audio));
  }

  // Shared choice-list wiring: tap to select (just highlights), bottom
  // "Check" button grades once a choice is picked, then turns into Continue.
  function wireChoices(ex, wrongMessage) {
    let selected = null;
    const checkBtn = app.querySelector("#check");
    app.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      app.querySelectorAll(".choice").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      selected = Number(b.dataset.i);
      checkBtn.disabled = false;
    }));
    checkBtn.addEventListener("click", () => {
      if (selected === null) return;
      const good = selected === ex.answer;
      app.querySelectorAll(".choice").forEach((b) => {
        b.disabled = true;
        const i = Number(b.dataset.i);
        if (i === ex.answer) b.classList.add("correct");
        else if (i === selected) b.classList.add("wrong");
      });
      showResult(ex, good, good ? "" : wrongMessage,
        { correct: ex.choices[ex.answer], chosen: ex.choices[selected] });
    });
  }

  function showMC(ex) {
    const order = shuffled(ex.choices.map((c, i) => ({ c, i })));
    frame(`
      <div class="exercise">
        ${reviewChip(ex)}${retryChip(ex)}${compositeChip(ex)}
        <h2>${esc(ex.prompt)}</h2>
        ${ex.tts ? speakBtn(ex.tts, resolveAudio(ex.audio)) : ""}
        <div class="choices" style="margin-top:14px">
          ${order.map((o) => `<button class="choice target" data-i="${o.i}">${esc(o.c)}</button>`).join("")}
        </div>
      </div>`,
      `<button class="btn wide" id="check" disabled>Check</button>`);
    wireSpeech();
    if (ex.tts) speak(ex.tts, course, resolveAudio(ex.audio));
    wireChoices(ex, `Correct answer: ${ex.choices[ex.answer]}`);
  }

  function showListen(ex) {
    const order = shuffled(ex.choices.map((c, i) => ({ c, i })));
    const audio = resolveAudio(ex.audio);
    frame(`
      <div class="exercise">
        ${reviewChip(ex)}${retryChip(ex)}${compositeChip(ex)}
        <h2>${esc(ex.prompt || "Which one did you hear?")}</h2>
        ${speakBtn(ex.ttsText, audio, "🔊 Play audio")}
        <div class="choices" style="margin-top:14px">
          ${order.map((o) => `<button class="choice target" data-i="${o.i}">${esc(o.c)}</button>`).join("")}
        </div>
      </div>`,
      `<button class="btn wide" id="check" disabled>Check</button>`);
    wireSpeech();
    speak(ex.ttsText, course, audio);
    wireChoices(ex, `It was: ${ex.choices[ex.answer]}`);
  }

  function normalize(s) {
    return String(s || "").toLowerCase().normalize("NFC").replace(/[\s'’-]+/g, "");
  }

  // Iterative edit distance, used to tell a genuine typo from a genuinely
  // wrong answer.
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const row = new Array(n + 1);
    for (let j = 0; j <= n; j++) row[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = row[j];
        row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
        prev = tmp;
      }
    }
    return row[n];
  }

  // A typo shouldn't fail a word the learner actually knows. Require an
  // exact match on short answers though — on a 3-letter word "one character
  // off" is often a real, different word, not a slip.
  function closeMatch(input, answer) {
    const a = normalize(input), b = normalize(answer);
    if (!a || a === b) return a === b;
    if (b.length <= 3) return false;
    const tolerance = b.length <= 6 ? 1 : 2;
    return levenshtein(a, b) <= tolerance;
  }

  // Grades free-typed input against an exercise's answer (+ accepted
  // alternates). Returns { good, typo } — typo is true for a near-miss that
  // still counts as correct but is worth a gentle spelling nudge.
  function gradeTyped(value, ex) {
    const accepted = [ex.answer, ...(ex.accept || [])];
    if (accepted.some((a) => normalize(a) === normalize(value))) return { good: true, typo: false };
    if (accepted.some((a) => closeMatch(value, a))) return { good: true, typo: true };
    return { good: false, typo: false };
  }

  // Shared typed-answer wiring: bottom "Check" button, disabled until there's
  // something to grade, then locks the input and grades in place.
  function wireTypedAnswer(ex) {
    const input = app.querySelector("#answer");
    const check = app.querySelector("#check");
    input.focus();
    input.addEventListener("input", () => { check.disabled = !input.value.trim(); });
    const run = () => {
      if (check.disabled) return;
      const { good, typo } = gradeTyped(input.value, ex);
      const message = !good ? `Correct answer: ${ex.answer}`
        : typo ? `Close! Watch the spelling: ${ex.answer}` : "";
      input.disabled = true;
      input.classList.add(good ? "correct" : "wrong");
      showResult(ex, good, message);
    };
    check.addEventListener("click", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  }

  function showType(ex) {
    frame(`
      <div class="exercise">
        ${reviewChip(ex)}${retryChip(ex)}${compositeChip(ex)}
        <h2>${esc(ex.prompt)}</h2>
        ${ex.tts ? speakBtn(ex.tts, resolveAudio(ex.audio)) : ""}
        <input class="type-input" id="answer" autocomplete="off" autocapitalize="off"
               spellcheck="false" placeholder="Type your answer">
      </div>`,
      `<button class="btn wide" id="check" disabled>Check</button>`);
    wireSpeech();
    if (ex.tts) speak(ex.tts, course, resolveAudio(ex.audio));
    wireTypedAnswer(ex);
  }

  // Dictation: audio plays automatically (replayable), type the whole thing.
  // Same typo tolerance as showType — this is testing listening + recall,
  // not keyboard precision.
  function showDictation(ex) {
    const audio = resolveAudio(ex.audio);
    frame(`
      <div class="exercise">
        ${reviewChip(ex)}${retryChip(ex)}${compositeChip(ex)}
        <h2>${esc(ex.prompt)}</h2>
        ${speakBtn(ex.tts, audio, "🔊 Replay")}
        <input class="type-input" id="answer" autocomplete="off" autocapitalize="off"
               spellcheck="false" placeholder="Type what you hear">
      </div>`,
      `<button class="btn wide" id="check" disabled>Check</button>`);
    wireSpeech();
    speak(ex.tts, course, audio);
    wireTypedAnswer(ex);
  }

  // Leech intervention: an item that's been wrong several reviews in a row
  // (see srs.js isLeech) gets re-taught instead of quizzed again the same
  // way — breaking the fail-the-same-quiz loop. Ungraded: it doesn't touch
  // accuracy or the FSRS schedule, it just resets the lapse streak so the
  // item gets a normal graded rep next time it's due.
  function showReteachCard(ex) {
    const showRoman = ex.roman && ex.roman !== ex.target;
    const audio = resolveAudio(ex.audio);
    frame(`
      <div class="teach-card">
        <span class="review-chip leech-chip">↻ Let's slow down on this one</span>
        <div class="big target">${esc(ex.target)}</div>
        ${ex.ipa ? `<div class="ipa">/${esc(ex.ipa)}/</div>` : ""}
        ${showRoman ? `<div class="roman">${esc(ex.roman)}</div>` : ""}
        <div class="eng">${esc(ex.english)}</div>
        ${ex.note ? `<div class="note">${esc(ex.note)}</div>` : ""}
        ${speakBtn(ex.roman || ex.target, audio)}
      </div>`,
      `<button class="btn wide" id="continue">Got it</button>`);
    wireSpeech();
    speak(ex.roman || ex.target, course, audio);
    app.querySelector("#continue").addEventListener("click", () => {
      resetLapseStreak(course.code, ex.key);
      next();
    });
    // This card only appears for a genuine leech (missed several times running),
    // so it's the right, rare moment to spend an AI call diagnosing why it won't
    // stick and re-teaching it. Best-effort; the static card stands on its own.
    if (opts.explain) {
      const card = app.querySelector(".teach-card");
      Promise.resolve(opts.explain({
        kind: "leech", target: ex.target, roman: ex.roman, english: ex.english, note: ex.note,
      })).then((r) => {
        if (!r || (!r.why && !r.tip) || !card?.isConnected) return;
        const box = document.createElement("div");
        box.className = "ai-explain reteach-ai";
        box.innerHTML = `💡 ${esc(r.why || "")}${r.tip ? ` ${esc(r.tip)}` : ""}${r.example ? `<div class="ai-eg">${esc(r.example)}</div>` : ""}`;
        card.appendChild(box);
      }).catch(() => {});
    }
  }

  function showMatch(ex) {
    const lefts = shuffled(ex.pairs.map((p, i) => ({ text: p[0], i })));
    const rights = shuffled(ex.pairs.map((p, i) => ({ text: p[1], i })));
    let missed = false;
    let sel = null;
    let matched = 0;

    frame(`
      <div class="exercise">
        ${reviewChip(ex)}${retryChip(ex)}${compositeChip(ex)}
        <h2>${esc(ex.prompt || "Match the pairs")}</h2>
        <div class="match-grid">
          ${lefts.map((l) => `<button class="choice target" data-side="L" data-i="${l.i}" data-say-word="${esc(l.text)}">${esc(l.text)}</button>`).join("")}
          ${rights.map((r) => `<button class="choice" data-side="R" data-i="${r.i}">${esc(r.text)}</button>`).join("")}
        </div>
      </div>`);

    const grid = app.querySelector(".match-grid");
    const Ls = [...grid.querySelectorAll('[data-side="L"]')];
    const Rs = [...grid.querySelectorAll('[data-side="R"]')];
    grid.innerHTML = "";
    for (let i = 0; i < Ls.length; i++) { grid.appendChild(Ls[i]); grid.appendChild(Rs[i]); }

    grid.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.side === "L" && b.dataset.sayWord) speak(b.dataset.sayWord, course);
      if (sel && sel !== b && sel.dataset.side !== b.dataset.side) {
        if (sel.dataset.i === b.dataset.i) {
          sel.classList.add("matched"); b.classList.add("matched");
          matched++;
          if (matched === ex.pairs.length) showResult(ex, !missed, missed ? "Watch those pairs — they'll come back for review." : "");
        } else {
          missed = true;
          sel.classList.add("wrong"); b.classList.add("wrong");
          const s = sel, t = b;
          setTimeout(() => { s.classList.remove("wrong", "sel"); t.classList.remove("wrong"); }, 500);
        }
        sel.classList.remove("sel");
        sel = null;
      } else {
        sel?.classList.remove("sel");
        sel = b;
        b.classList.add("sel");
      }
    }));
  }

  function finish() {
    addXP(XP_LESSON_BONUS);
    onStatsChanged();
    opts.onComplete?.(); // mark the day done only on a real finish, never on quit
    const acc = exercisesDone ? Math.round((correctCount / exercisesDone) * 100) : 100;
    const missed = Math.max(0, exercisesDone - correctCount);
    const sub = missed > 0
      ? `${acc}% accuracy — the ${missed === 1 ? "one you missed is" : `${missed} you missed are`} queued for extra review`
      : `${acc}% — no mistakes. Nicely done.`;
    const href = opts.isPractice ? "#/" : backHref;
    // Terminal identity (trip app): the day is stamped cleared — real movement,
    // not confetti and XP. The classic app keeps the celebration screen.
    if (opts.terminal) {
      const moved = missed > 0
        ? `${missed} ${missed === 1 ? "item" : "items"} flagged to revisit tomorrow.`
        : "No mistakes — everything held.";
      app.innerHTML = `
        <div class="complete">
          <span class="eyebrow">Briefing cleared</span>
          <h1>Nicely done.</h1>
          <div class="stamp"><span class="xl">Cleared</span>${esc(opts.stampCode || "")} · ${acc}%</div>
          <p class="delta">${esc(moved)}</p>
          <a class="btn wide ghost" id="lesson-continue" href="${href}">Back to the terminal</a>
        </div>`;
    } else {
      app.innerHTML = `
        <div class="complete">
          <div class="big-emoji">${opts.isPractice ? "💪" : "🎉"}</div>
          <h1>${opts.isPractice ? "Practice complete!" : "Lesson complete!"}</h1>
          <p>${sub}</p>
          <div class="xp-chip">+${correctCount * XP_PER_EXERCISE + XP_LESSON_BONUS} XP</div>
          <div><a class="btn wide" id="lesson-continue" href="${href}">Continue</a></div>
        </div>`;
    }
    // A plain href to "#" doesn't re-route when we're already at "#", so let the
    // caller decide what "done" navigates to.
    app.querySelector("#lesson-continue")?.addEventListener("click", (e) => {
      if (opts.onDone) { e.preventDefault(); opts.onDone(); }
    });
  }

  if (!steps.length) {
    app.innerHTML = `<div class="lang-hero"><h1>Nothing to practice yet</h1>
      <p>Complete a lesson or two first — then practice sessions will target what you're about to forget.</p>
      <a class="btn" href="#/">Back to course</a></div>`;
    return;
  }
  show(steps[0]);
}
