// The "In the wild" step — an AI-built scenario, rendered Mango-style: each
// line shows the target phrase and its English with matching chunks in the same
// colour, and tapping a chunk breaks the word into its morphemes (ka·n·akol →
// present·I·eat). This is the rehearsal of the real moment, built from only what
// you've been taught.
import { speak, primeTTS } from "./tts.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Colour-links matching chunks. Distinct, readable in light and dark.
const PALETTE = ["#c0392b", "#2e7d32", "#1565c0", "#8e44ad", "#b8860b", "#00838f", "#d81b60", "#5d4037"];
const colorFor = (group) => PALETTE[((group % PALETTE.length) + PALETTE.length) % PALETTE.length];

function chunkRow(chunks, which) {
  return chunks.map((c, i) => {
    const text = which === "en" ? c.en : c.roman;
    if (!text) return "";
    return `<button class="scn-chunk" data-ci="${i}" style="color:${colorFor(c.group)}">${esc(text)}</button>`;
  }).join(which === "en" ? " " : " ");
}

function lineHtml(line, li) {
  const who = line.speaker === "you" ? "You" : "Them";
  return `
    <div class="scn-line ${line.speaker === "you" ? "you" : "them"}" data-li="${li}">
      <div class="scn-who">${who}</div>
      <div class="scn-bubble">
        <div class="scn-target">${chunkRow(line.chunks, "roman")}</div>
        <div class="scn-english">${chunkRow(line.chunks, "en")}</div>
        <button class="scn-say" title="Listen">🔊</button>
      </div>
      <div class="scn-morph" hidden></div>
    </div>`;
}

export function renderScenario(app, scenario, opts = {}) {
  primeTTS();
  const course = opts.course;

  app.innerHTML = `
    <div class="scn">
      <div class="scn-head">🎬 In the wild</div>
      ${scenario.setting ? `<p class="scn-setting">${esc(scenario.setting)}</p>` : ""}
      <div class="scn-lines">${scenario.lines.map(lineHtml).join("")}</div>
      ${scenario.task ? `<div class="scn-task"><b>Your turn:</b> ${esc(scenario.task)}</div>` : ""}
      <p class="scn-fine">Tap any coloured word to see how it's built.</p>
    </div>
    <div class="session-footer"><button class="btn wide" id="scn-done">Done</button></div>`;

  // Listen buttons play the line.
  app.querySelectorAll(".scn-line").forEach((el) => {
    const line = scenario.lines[+el.dataset.li];
    el.querySelector(".scn-say")?.addEventListener("click", () => speak(line.roman, course));
    // Tap a chunk → reveal its morpheme breakdown for that line.
    el.querySelectorAll(".scn-chunk").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chunk = line.chunks[+btn.dataset.ci];
        const morph = el.querySelector(".scn-morph");
        const parts = (chunk.morphemes || []).map((m) =>
          `<span class="scn-seg">${esc(m.seg)}<em>${esc(m.role)}</em></span>`).join(`<span class="scn-plus">+</span>`);
        morph.innerHTML = parts
          ? `<div class="scn-morph-word" style="color:${colorFor(chunk.group)}">${esc(chunk.roman)} — ${esc(chunk.en)}</div><div class="scn-segs">${parts}</div>`
          : `<div class="scn-morph-word">${esc(chunk.roman)} — ${esc(chunk.en)}</div>`;
        morph.hidden = false;
      });
    });
  });

  app.querySelector("#scn-done").addEventListener("click", () => opts.onDone?.());
}
