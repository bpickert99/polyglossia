// The trip planner (onboarding): build an itinerary, see every language on your
// route on a world atlas, and get a coverage score for each — how much of YOUR
// trip it covers (time-in-region × how little English saves you there) and how
// far a focused month realistically gets you (from linguistic distance). You pick
// what's worth learning; available languages become real courses.
//
// See the concept and the scoring rationale in docs/teaching-principles.md and
// the catalog in data/world-languages.json.
import { addTrip } from "./storage.js";
import { loadWorldLanguages } from "./data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NS = "http://www.w3.org/2000/svg";
const W = 720, H = 360;
const px = (lng) => (lng + 180) / 360 * W;
const py = (lat) => (90 - lat) / 180 * H;
const DVAR = { 1: "--d2", 2: "--d2", 3: "--d3", 4: "--d4", 5: "--d5" };
const distColor = (d) => `var(${DVAR[d] || "--d3"})`;
const reachFor = (d) => (d <= 2 ? "conversational" : d === 3 ? "strong survival" : "survival level");
const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDaysISO = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Render the planner into `app`. opts: { catalogPacks (Map code->pack.json for
// available courses), onDone (called after a plan is created) }.
export async function renderPlanner(app, opts = {}) {
  const catalog = opts.catalogPacks || new Map();
  const data = await loadWorldLanguages();
  const atlas = (data.languages || []).map((l) => ({ ...l, available: catalog.has(l.code) }));
  const byCode = new Map(atlas.map((l) => [l.code, l]));

  // The itinerary being built: one stop per language leg.
  const itinerary = []; // { code, place, date, days }
  const learn = new Set(); // codes the user has chosen to actually learn

  app.innerHTML = `
    <div class="plan">
      <p class="plan-kicker">Plan your trip</p>
      <h1 class="plan-h1">Plan the trip,<br>then the languages.</h1>
      <p class="plan-lede">Add where you're going. We'll place every language on your route and work out
        which ones are worth learning for <em>your</em> days there.</p>

      <div class="plan-card">
        <div class="plan-card-h"><h2>Languages on your route</h2><span class="plan-sub">${atlas.length} in the atlas · by difficulty</span></div>
        <div class="plan-mapwrap"><svg class="plan-map" id="plan-map" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="World map of languages"></svg><div class="plan-tip" id="plan-tip"></div></div>
        <div class="plan-legend">
          <span><i style="background:var(--d2)"></i>close</span>
          <span><i style="background:var(--d3)"></i>moderate</span>
          <span><i style="background:var(--d4)"></i>far</span>
          <span><i style="background:var(--d5)"></i>very far</span>
          <span><i style="background:var(--ink)"></i>on your route</span>
        </div>
      </div>

      <div class="plan-card">
        <div class="plan-card-h"><h2>Your itinerary</h2><span class="plan-sub" id="plan-itin-sub"></span></div>
        <div class="plan-itin" id="plan-itin"></div>
        <div class="plan-add-row">
          <select id="plan-pick" class="trip-input plan-pick">
            <option value="">+ Add a destination…</option>
            <optgroup label="Courses ready">${atlas.filter((l) => l.available).map((l) => `<option value="${l.code}">${esc(l.flag)} ${esc(l.name)}</option>`).join("")}</optgroup>
            <optgroup label="Coming soon (map only)">${atlas.filter((l) => !l.available).map((l) => `<option value="${l.code}">${esc(l.flag)} ${esc(l.name)}</option>`).join("")}</optgroup>
          </select>
        </div>
      </div>

      <div class="plan-card" id="plan-reco-card" hidden>
        <div class="plan-card-h"><h2>Worth learning?</h2><span class="plan-sub" id="plan-reco-sub"></span></div>
        <div class="plan-langs" id="plan-langs"></div>
        <div class="plan-method"><b>Coverage</b> = your trip-days in that region × how little English saves you there. <b>Reach</b> = how far a focused month gets you, from its distance to English. A hard language you'll use a lot is still worth a survival level.</div>
      </div>

      <button class="btn wide big" id="plan-go" disabled>Start my plan</button>
      <p class="plan-fine" id="plan-fine">Add a destination to begin.</p>
    </div>`;

  const planRoot = app.querySelector(".plan"); // stable for this planner session
  const svg = app.querySelector("#plan-map");
  const tip = app.querySelector("#plan-tip");
  const mapwrap = app.querySelector(".plan-mapwrap");

  const elNS = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

  function drawMap() {
    svg.innerHTML = "";
    for (let lng = -150; lng <= 150; lng += 30) svg.appendChild(elNS("line", { x1: px(lng), y1: 0, x2: px(lng), y2: H, class: "plan-grat" }));
    for (let lat = -60; lat <= 60; lat += 30) svg.appendChild(elNS("line", { x1: 0, y1: py(lat), x2: W, y2: py(lat), class: lat === 0 ? "plan-grat eq" : "plan-grat" }));
    const routeCodes = new Set(itinerary.map((s) => s.code));
    for (const l of atlas) {
      const on = routeCodes.has(l.code);
      const g = elNS("g", { class: "plan-dot" });
      if (on) g.appendChild(elNS("circle", { cx: px(l.lng), cy: py(l.lat), r: 9, class: "plan-halo" }));
      g.appendChild(elNS("circle", { cx: px(l.lng), cy: py(l.lat), r: l.available ? 4.2 : 3, fill: distColor(l.distance), stroke: l.available ? "var(--board-ink)" : "none", "stroke-width": l.available ? 1.4 : 0 }));
      g.addEventListener("mousemove", (ev) => { const b = mapwrap.getBoundingClientRect(); tip.style.left = (ev.clientX - b.left) + "px"; tip.style.top = (ev.clientY - b.top) + "px"; tip.innerHTML = `<b>${esc(l.name)}</b>${l.available ? " ✓" : ""}`; tip.style.opacity = 1; });
      g.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
      svg.appendChild(g);
    }
    // route line between stops in itinerary order
    if (itinerary.length > 1) {
      const d = "M" + itinerary.map((s) => `${px(byCode.get(s.code).lng)} ${py(byCode.get(s.code).lat)}`).join(" L ");
      svg.appendChild(elNS("path", { d, class: "plan-route" }));
    }
    for (const s of itinerary) svg.appendChild(elNS("circle", { cx: px(byCode.get(s.code).lng), cy: py(byCode.get(s.code).lat), r: 3.4, class: "plan-route-pin" }));
  }

  function coverageOf(stop, totalDays) {
    const l = byCode.get(stop.code);
    const share = totalDays ? stop.days / totalDays : 0;
    return share * (1 - (l.nativeAccess ?? 0.4));
  }

  function draw() {
    const totalDays = itinerary.reduce((a, s) => a + (s.days || 0), 0);
    // itinerary rows
    const itinEl = app.querySelector("#plan-itin");
    itinEl.innerHTML = itinerary.length ? itinerary.map((s, i) => {
      const l = byCode.get(s.code);
      return `<div class="plan-stop">
        <span class="plan-stop-flag">${esc(l.flag)}</span>
        <div class="plan-stop-main">
          <div class="plan-stop-name">${esc(l.name)}${l.available ? "" : ` <span class="plan-soon">course soon</span>`}</div>
          <div class="plan-stop-fields">
            <label>Arrive <input type="date" data-i="${i}" data-f="date" value="${esc(s.date)}" min="${todayISO()}" class="plan-date"></label>
            <label>Days <input type="number" data-i="${i}" data-f="days" value="${s.days}" min="1" max="60" class="plan-days"></label>
          </div>
        </div>
        <button class="plan-stop-x" data-remove="${i}" title="Remove">✕</button>
      </div>`;
    }).join("") : `<p class="plan-empty">No destinations yet — add one below.</p>`;
    app.querySelector("#plan-itin-sub").textContent = itinerary.length ? `${itinerary.length} ${itinerary.length === 1 ? "stop" : "stops"} · ${totalDays} days` : "";

    // recommendation cards
    const recoCard = app.querySelector("#plan-reco-card");
    const langsEl = app.querySelector("#plan-langs");
    recoCard.hidden = itinerary.length === 0;
    if (itinerary.length) {
      app.querySelector("#plan-reco-sub").textContent = "for " + itinerary.map((s) => byCode.get(s.code).name.split(" ")[0]).join(" · ");
      const scored = itinerary.map((s) => ({ s, l: byCode.get(s.code), cov: coverageOf(s, totalDays) })).sort((a, b) => b.cov - a.cov);
      langsEl.innerHTML = scored.map(({ s, l, cov }) => {
        const pct = Math.round(cov * 100);
        const verdict = cov >= 0.3 ? ["v-rec", "Recommended"] : cov >= 0.12 ? ["v-worth", "Worth it"] : ["v-opt", "Optional"];
        const on = learn.has(l.code);
        return `<div class="plan-lang ${on ? "on" : ""}" style="--mc:${distColor(l.distance)}">
          <div class="plan-lang-top">
            <span class="plan-lang-flag">${esc(l.flag)}</span>
            <div><div class="plan-lang-name">${esc(l.name)}</div><div class="plan-lang-native">${esc(l.native || "")}</div></div>
            <span class="plan-verdict ${verdict[0]}">${verdict[1]}</span>
          </div>
          <div class="plan-cov">
            <span class="plan-cov-lab">Trip coverage</span>
            <span class="plan-cov-bar"><i style="width:${Math.max(pct, 2)}%"></i></span>
            <span class="plan-cov-pct">${pct}%</span>
          </div>
          <div class="plan-reach">Reach in 30 days: <b>${reachFor(l.distance)}</b> · ${s.days} of ${totalDays} days in-region</div>
          <div class="plan-lang-intro">${esc(l.intro || "")}</div>
          ${l.available
            ? `<div class="plan-lang-add"><input type="checkbox" class="plan-toggle" data-learn="${l.code}" ${on ? "checked" : ""} aria-label="Learn ${esc(l.name)}"><label>Learn this before I go</label></div>`
            : `<div class="plan-lang-add plan-unavail">Course in the works — on the map, not yet teachable.</div>`}
        </div>`;
      }).join("");
    }

    drawMap();
    updateGo();
  }

  function updateGo() {
    const chosen = [...learn].filter((c) => byCode.get(c)?.available && itinerary.some((s) => s.code === c));
    const go = app.querySelector("#plan-go");
    const fine = app.querySelector("#plan-fine");
    go.disabled = chosen.length === 0;
    go.textContent = chosen.length > 1 ? `Start my plan · ${chosen.length} languages` : "Start my plan";
    fine.textContent = itinerary.length === 0 ? "Add a destination to begin."
      : chosen.length === 0 ? "Toggle on a language you'll learn."
      : "One short lesson a day, timed to each destination.";
  }

  // ---- interactions ----
  app.querySelector("#plan-pick").addEventListener("change", (e) => {
    const code = e.target.value;
    e.target.value = "";
    if (!code || itinerary.some((s) => s.code === code)) return;
    const l = byCode.get(code);
    itinerary.push({ code, place: l.name, date: plusDaysISO(21 + itinerary.length * 5), days: 5 });
    if (l.available) learn.add(code); // default recommended on
    draw();
  });

  planRoot.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.f) {
      const s = itinerary[Number(t.dataset.i)];
      if (!s) return;
      if (t.dataset.f === "days") s.days = Math.max(1, Math.min(60, Number(t.value) || 1));
      else s.date = t.value;
      draw();
    }
  });

  planRoot.addEventListener("click", (e) => {
    const rm = e.target.dataset.remove;
    if (rm !== undefined) {
      const [removed] = itinerary.splice(Number(rm), 1);
      if (removed) learn.delete(removed.code);
      draw();
    }
  });

  planRoot.addEventListener("change", (e) => {
    const code = e.target.dataset.learn;
    if (code) { if (e.target.checked) learn.add(code); else learn.delete(code); draw(); }
  });

  app.querySelector("#plan-go").addEventListener("click", () => {
    const chosen = itinerary.filter((s) => learn.has(s.code) && byCode.get(s.code).available);
    let firstTrip = null;
    for (const s of chosen) {
      const l = byCode.get(s.code);
      const pack = catalog.get(s.code);
      const t = addTrip({
        packCode: s.code,
        packName: pack?.name || l.name,
        flag: pack?.flag || l.flag,
        destination: pack?.destination || l.name,
        departureDate: s.date,
        scriptMode: pack?.scripts?.default || "latin",
        helper: (pack?.scripts?.default || "latin") === "arabic",
      });
      firstTrip = firstTrip || t;
    }
    if (opts.onDone) opts.onDone(firstTrip);
  });

  draw();
}
