import { loadScript } from "./data.js";
import { speak } from "./tts.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderScriptPractice(app, course) {
  const script = course ? await loadScript(course.code) : null;

  if (!script || !script.groups?.length) {
    app.innerHTML = `
      <div class="lang-hero"><h1>✍️ Script practice</h1>
      <p>${course?.script?.nonLatin === false || !course
        ? "This course uses the Latin alphabet, so there's no separate script to practice."
        : "No script data has been generated for this course yet."}</p></div>`;
    return;
  }

  const allGlyphs = script.groups.flatMap((g) => g.glyphs);

  app.innerHTML = `
    <div class="lang-hero">
      <h1>✍️ ${esc(script.name)}</h1>
      <p class="script-intro">${esc(script.description || "")}</p>
    </div>
    <div id="practice-area"></div>
    <div class="glyph-groups" id="glyph-groups">
      ${script.groups.map((g) => `
        <h3>${esc(g.title)}</h3>
        <div class="glyph-grid">
          ${g.glyphs.map((gl) => `
            <button class="glyph-cell" data-glyph="${esc(gl.glyph)}" data-roman="${esc(gl.roman)}">
              <span class="g target">${esc(gl.glyph)}</span><span class="r">${esc(gl.roman)}</span>
            </button>`).join("")}
        </div>`).join("")}
    </div>`;

  const area = app.querySelector("#practice-area");
  let current = allGlyphs[0];

  function openPractice(glyph, roman) {
    current = { glyph, roman };
    area.innerHTML = `
      <div class="lang-hero draw-wrap">
        <div class="draw-head">
          <span class="cur"><span class="g target">${esc(glyph)}</span> ${esc(roman)}</span>
          <button class="speak-btn" id="say">🔊</button>
        </div>
        <canvas id="draw-canvas" width="340" height="340"></canvas>
        <div class="draw-tools">
          <button class="btn ghost" id="hint">Toggle trace</button>
          <button class="btn ghost" id="clear">Clear</button>
          <button class="btn blue" id="check">Check</button>
          <button class="btn" id="next">Next ▶</button>
        </div>
        <div class="draw-score" id="score"></div>
      </div>`;
    area.scrollIntoView({ behavior: "smooth", block: "start" });
    setupCanvas(glyph);
    area.querySelector("#say").addEventListener("click", () => speak(roman, course));
    area.querySelector("#next").addEventListener("click", () => {
      const idx = allGlyphs.findIndex((g) => g.glyph === current.glyph);
      const n = allGlyphs[(idx + 1) % allGlyphs.length];
      openPractice(n.glyph, n.roman);
    });
  }

  function setupCanvas(glyph) {
    const canvas = area.querySelector("#draw-canvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = area.querySelector("#score");
    let showHint = true;
    let drawing = false;
    const strokes = []; // array of point arrays

    const ink = getComputedStyle(document.body).color;

    function drawTemplate(target, alpha) {
      target.save();
      target.globalAlpha = alpha;
      target.fillStyle = ink;
      target.font = `240px "Noto Sans Cherokee", "Plantagenet Cherokee", sans-serif`;
      target.textAlign = "center";
      target.textBaseline = "middle";
      target.fillText(glyph, canvas.width / 2, canvas.height / 2 + 10);
      target.restore();
    }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (showHint) drawTemplate(ctx, 0.14);
      ctx.strokeStyle = "#1cb0f6";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const pts of strokes) {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    }

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
      };
    }

    canvas.addEventListener("pointerdown", (e) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      strokes.push([pos(e)]);
      redraw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      strokes[strokes.length - 1].push(pos(e));
      redraw();
    });
    canvas.addEventListener("pointerup", () => { drawing = false; scoreEl.textContent = ""; });

    area.querySelector("#hint").addEventListener("click", () => { showHint = !showHint; redraw(); });
    area.querySelector("#clear").addEventListener("click", () => { strokes.length = 0; scoreEl.textContent = ""; redraw(); });
    area.querySelector("#check").addEventListener("click", () => {
      scoreEl.textContent = scoreDrawing() + "";
    });

    // Compare drawn pixels against the rendered glyph on a coarse grid:
    // coverage = how much of the glyph you traced; precision = how much of
    // your ink landed on the glyph. Both matter for a fair score.
    function scoreDrawing() {
      if (!strokes.length) return "Draw the character first ✏️";
      const off = document.createElement("canvas");
      off.width = canvas.width; off.height = canvas.height;
      const octx = off.getContext("2d");
      drawTemplate(octx, 1);
      const glyphData = octx.getImageData(0, 0, off.width, off.height).data;

      const drawn = document.createElement("canvas");
      drawn.width = canvas.width; drawn.height = canvas.height;
      const dctx = drawn.getContext("2d");
      dctx.strokeStyle = "#000"; dctx.lineWidth = 22; dctx.lineCap = "round"; dctx.lineJoin = "round";
      for (const pts of strokes) {
        dctx.beginPath();
        pts.forEach((p, i) => (i ? dctx.lineTo(p.x, p.y) : dctx.moveTo(p.x, p.y)));
        dctx.stroke();
      }
      const drawnData = dctx.getImageData(0, 0, drawn.width, drawn.height).data;

      let glyphPx = 0, drawnPx = 0, overlap = 0;
      for (let i = 3; i < glyphData.length; i += 16) { // sample every 4th pixel
        const g = glyphData[i] > 40, d = drawnData[i] > 40;
        if (g) glyphPx++;
        if (d) drawnPx++;
        if (g && d) overlap++;
      }
      if (!glyphPx || !drawnPx) return "Draw the character first ✏️";
      const coverage = overlap / glyphPx;
      const precision = overlap / drawnPx;
      const score = Math.round(100 * Math.min(1, (coverage * 0.65 + precision * 0.35) * 1.25));
      const msg = score >= 85 ? "🌟 Beautiful!" : score >= 60 ? "👍 Good — keep practicing" : "✏️ Trace the faint outline and try again";
      return `Score: ${score}/100 — ${msg}`;
    }

    redraw();
  }

  app.querySelectorAll(".glyph-cell").forEach((b) =>
    b.addEventListener("click", () => openPractice(b.dataset.glyph, b.dataset.roman)));

  openPractice(current.glyph, current.roman);
}
