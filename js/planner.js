// The trip planner (onboarding). You type the CITIES you're travelling to and the
// dates you'll be there; the app recognizes each place, works out which
// language(s) you'll meet, and scores how much of your trip each one covers
// (time-in-region × how little English saves you there) alongside its 30-day
// reach (from linguistic distance). You pick what's worth learning; available
// languages become real courses.
//
// Data: data/world-languages.json (catalog + scoring), data/world-map.json
// (country outlines), data/places.json (recognized cities), data/country-
// languages.json (which language(s) to learn per country).
import { addTrip } from "./storage.js";
import { loadWorldLanguages, loadWorldMap, loadPlaces, loadCountryLanguages } from "./data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NS = "http://www.w3.org/2000/svg";
const W = 720, H = 360;
const px = (lng) => (lng + 180) / 360 * W;
const py = (lat) => (90 - lat) / 180 * H;
const DVAR = { 1: "--d2", 2: "--d2", 3: "--d3", 4: "--d4", 5: "--d5" };
const distColor = (d) => `var(${DVAR[d] || "--d3"})`;
const reachFor = (d) => (d <= 2 ? "conversational" : d === 3 ? "strong survival" : "survival level");
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayISO = () => iso(Date.now());
const daysBetween = (from, to) => Math.max(1, Math.round((new Date(to + "T12:00") - new Date(from + "T12:00")) / DAY) || 1);

export async function renderPlanner(app, opts = {}) {
  const catalog = opts.catalogPacks || new Map();
  const [wl, wm, pl, cl] = await Promise.all([loadWorldLanguages(), loadWorldMap(), loadPlaces(), loadCountryLanguages()]);
  const langs = new Map((wl.languages || []).map((l) => [l.code, { ...l, available: catalog.has(l.code) }]));
  const countries = wm.countries || [];
  const places = pl.places || [];
  const ccLangs = cl.map || {};
  const langCCs = {}; // code -> Set(cc), for highlighting a language's whole reach
  for (const [cc, codes] of Object.entries(ccLangs)) for (const c of codes) (langCCs[c] = langCCs[c] || new Set()).add(cc);

  const stops = [];        // { name, cc, country, lat, lng, from, to }
  const choice = new Map(); // code -> explicit user learn choice (overrides default)

  app.innerHTML = `
    <div class="plan">
      <p class="plan-kicker">Plan your trip</p>
      <h1 class="plan-h1">Where are you<br>going?</h1>
      <p class="plan-lede">Add the places you'll visit and when. We'll map your route, work out the languages
        you'll meet, and tell you which are worth learning for <em>your</em> days there.</p>

      <div class="plan-card">
        <div class="plan-search">
          <input id="plan-city" class="trip-input" placeholder="Type a city — e.g. Marrakech, Tokyo, Lima" autocomplete="off" autocapitalize="words" spellcheck="false">
          <div class="plan-suggest" id="plan-suggest" hidden></div>
        </div>
        <div class="plan-itin" id="plan-itin"></div>
      </div>

      <div class="plan-card" id="plan-map-card" hidden>
        <div class="plan-card-h"><h2>Your route</h2><span class="plan-sub" id="plan-map-sub"></span></div>
        <div class="plan-mapwrap"><svg class="plan-map" id="plan-map" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Map of your route"></svg></div>
        <div class="plan-legend">
          <span><i class="lg-visited"></i>where you're going</span>
          <span><i class="lg-soft"></i>your language's wider reach</span>
        </div>
      </div>

      <div class="plan-card" id="plan-reco-card" hidden>
        <div class="plan-card-h"><h2>Worth learning?</h2><span class="plan-sub" id="plan-reco-sub"></span></div>
        <div class="plan-langs" id="plan-langs"></div>
        <div class="plan-method"><b>Coverage</b> = your trip-days in that region × how little English saves you there. <b>Reach</b> = how far a focused month gets you, from its distance to English. Shown separately: a hard language you'll use a lot is still worth a survival level.</div>
      </div>

      <button class="btn wide big" id="plan-go" disabled>Start my plan</button>
      <p class="plan-fine" id="plan-fine">Add a place to begin.</p>
    </div>`;

  const planRoot = app.querySelector(".plan");
  const svg = app.querySelector("#plan-map");
  const cityInput = app.querySelector("#plan-city");
  const suggestEl = app.querySelector("#plan-suggest");
  const elNS = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

  // ---------- derive languages from the itinerary ----------
  function derive() {
    const total = stops.reduce((a, s) => a + daysBetween(s.from, s.to), 0);
    const perLang = {}; // code -> days
    let englishDays = 0;
    for (const s of stops) {
      const codes = ccLangs[s.cc];
      const d = daysBetween(s.from, s.to);
      if (!codes || codes.length === 0) { englishDays += d; continue; }
      for (const c of codes) perLang[c] = (perLang[c] || 0) + d;
    }
    const rows = Object.entries(perLang)
      .map(([code, d]) => { const l = langs.get(code); return l ? { l, days: d, cov: total ? d / total * (1 - (l.nativeAccess ?? 0.4)) : 0 } : null; })
      .filter(Boolean)
      .sort((a, b) => b.cov - a.cov);
    return { rows, total, englishDays };
  }
  const willLearn = (r) => (choice.has(r.l.code) ? choice.get(r.l.code) : (r.l.available && r.cov >= 0.12));

  // ---------- map ----------
  function drawMap() {
    svg.innerHTML = "";
    const visited = new Set(stops.map((s) => s.cc));
    const learnedCodes = derive().rows.filter(willLearn).map((r) => r.l.code);
    const soft = new Set();
    for (const c of learnedCodes) for (const cc of (langCCs[c] || [])) if (!visited.has(cc)) soft.add(cc);
    for (const co of countries) {
      const cls = visited.has(co.cc) ? "wm-visited" : soft.has(co.cc) ? "wm-soft" : "wm-land";
      svg.appendChild(elNS("path", { d: co.d, class: cls }));
    }
    if (stops.length > 1) {
      const d = "M" + stops.map((s) => `${px(s.lng)} ${py(s.lat)}`).join(" L ");
      svg.appendChild(elNS("path", { d, class: "plan-route" }));
    }
    for (const s of stops) {
      svg.appendChild(elNS("circle", { cx: px(s.lng), cy: py(s.lat), r: 4.6, class: "plan-pin" }));
    }
  }

  // ---------- itinerary rows ----------
  function langLabel(cc) {
    const codes = ccLangs[cc];
    if (!codes || !codes.length) return "English gets you by";
    return codes.map((c) => langs.get(c)?.name || c).join(" / ");
  }
  function drawItin() {
    const el = app.querySelector("#plan-itin");
    el.innerHTML = stops.length ? stops.map((s, i) => `
      <div class="plan-stop">
        <div class="plan-stop-main">
          <div class="plan-stop-name">${esc(s.name)}<span class="plan-stop-cc">${esc(s.country)}</span></div>
          <div class="plan-stop-lang">${esc(langLabel(s.cc))}</div>
          <div class="plan-stop-fields">
            <label>From <input type="date" data-i="${i}" data-f="from" value="${esc(s.from)}" min="${todayISO()}" class="plan-date"></label>
            <label>To <input type="date" data-i="${i}" data-f="to" value="${esc(s.to)}" min="${esc(s.from)}" class="plan-date"></label>
            <span class="plan-stop-days">${daysBetween(s.from, s.to)} days</span>
          </div>
        </div>
        <button class="plan-stop-x" data-remove="${i}" title="Remove">✕</button>
      </div>`).join("") : "";
  }

  // ---------- recommendation cards ----------
  function drawCards() {
    const { rows, total, englishDays } = derive();
    const card = app.querySelector("#plan-reco-card");
    const mapCard = app.querySelector("#plan-map-card");
    card.hidden = stops.length === 0;
    mapCard.hidden = stops.length === 0;
    if (!stops.length) return;
    app.querySelector("#plan-map-sub").textContent = `${stops.length} ${stops.length === 1 ? "stop" : "stops"} · ${total} days`;
    app.querySelector("#plan-reco-sub").textContent = "for " + stops.map((s) => s.name).join(" · ");
    const langsEl = app.querySelector("#plan-langs");
    let html = rows.map((r) => {
      const pct = Math.round(r.cov * 100);
      const verdict = r.cov >= 0.3 ? ["v-rec", "Recommended"] : r.cov >= 0.12 ? ["v-worth", "Worth it"] : ["v-opt", "Optional"];
      const on = willLearn(r);
      return `<div class="plan-lang ${on ? "on" : ""}" style="--mc:${distColor(r.l.distance)}">
        <div class="plan-lang-top">
          <span class="plan-lang-flag">${esc(r.l.flag)}</span>
          <div><div class="plan-lang-name">${esc(r.l.name)}</div><div class="plan-lang-native">${esc(r.l.native || "")}</div></div>
          <span class="plan-verdict ${verdict[0]}">${verdict[1]}</span>
        </div>
        <div class="plan-cov">
          <span class="plan-cov-lab">Trip coverage</span>
          <span class="plan-cov-bar"><i style="width:${Math.max(pct, 2)}%"></i></span>
          <span class="plan-cov-pct">${pct}%</span>
        </div>
        <div class="plan-reach">Reach in 30 days: <b>${reachFor(r.l.distance)}</b> · ${r.days} of ${total} days in-region</div>
        <div class="plan-lang-intro">${esc(r.l.intro || "")}</div>
        ${r.l.available
          ? `<div class="plan-lang-add"><input type="checkbox" class="plan-toggle" data-learn="${r.l.code}" ${on ? "checked" : ""} aria-label="Learn ${esc(r.l.name)}"><label>Learn this before I go</label></div>`
          : `<div class="plan-lang-add plan-unavail">Course in the works — on the map, not yet teachable.</div>`}
      </div>`;
    }).join("");
    if (englishDays) html += `<div class="plan-english">✓ ${englishDays} of your ${total} days are somewhere English is widely spoken — you'll be fine there.</div>`;
    if (!rows.length && englishDays) html = `<div class="plan-english">English is widely spoken across your whole route — no course needed. Add a stop somewhere it isn't, and we'll build you one.</div>`;
    langsEl.innerHTML = html;
  }

  function updateGo() {
    const chosen = derive().rows.filter((r) => willLearn(r) && r.l.available);
    const go = app.querySelector("#plan-go");
    go.disabled = chosen.length === 0;
    go.textContent = chosen.length > 1 ? `Start my plan · ${chosen.length} languages` : "Start my plan";
    app.querySelector("#plan-fine").textContent = !stops.length ? "Add a place to begin."
      : chosen.length === 0 ? "No teachable language on this route yet — try another stop."
      : "One short lesson a day, timed to each destination.";
  }

  function redraw() { drawItin(); drawCards(); drawMap(); updateGo(); }

  // ---------- typeahead ----------
  function showSuggest(q) {
    const s = q.trim().toLowerCase();
    if (s.length < 1) { suggestEl.hidden = true; return; }
    const m = places.filter((p) => p.name.toLowerCase().includes(s) || p.country.toLowerCase().includes(s)).slice(0, 8);
    if (!m.length) { suggestEl.innerHTML = `<div class="plan-suggest-none">No match — try a bigger nearby city.</div>`; suggestEl.hidden = false; return; }
    suggestEl.innerHTML = m.map((p) => `<button class="plan-suggest-i" data-place="${esc(p.name)}|${esc(p.cc)}">
      <span class="plan-suggest-name">${esc(p.name)}</span><span class="plan-suggest-cc">${esc(p.country)}</span></button>`).join("");
    suggestEl.hidden = false;
  }
  function addStop(place) {
    if (stops.some((s) => s.name === place.name && s.cc === place.cc)) return;
    const from = stops.length ? iso(new Date(stops[stops.length - 1].to + "T12:00").getTime() + DAY) : iso(Date.now() + 21 * DAY);
    const to = iso(new Date(from + "T12:00").getTime() + 3 * DAY);
    stops.push({ ...place, from, to });
    redraw();
  }

  cityInput.addEventListener("input", () => showSuggest(cityInput.value));
  cityInput.addEventListener("focus", () => { if (cityInput.value) showSuggest(cityInput.value); });
  suggestEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-place]"); if (!btn) return;
    const [name, cc] = btn.dataset.place.split("|");
    const place = places.find((p) => p.name === name && p.cc === cc);
    if (place) { addStop(place); cityInput.value = ""; suggestEl.hidden = true; cityInput.focus(); }
  });
  document.addEventListener("click", (e) => { if (!planRoot.contains(e.target) || (!suggestEl.contains(e.target) && e.target !== cityInput)) suggestEl.hidden = true; });

  planRoot.addEventListener("input", (e) => {
    const t = e.target; if (!t.dataset.f) return;
    const s = stops[Number(t.dataset.i)]; if (!s) return;
    if (t.dataset.f === "from") { s.from = t.value; if (s.to < s.from) s.to = s.from; }
    else s.to = t.value < s.from ? s.from : t.value;
    redraw();
  });
  planRoot.addEventListener("click", (e) => {
    const rm = e.target.dataset.remove;
    if (rm !== undefined) { stops.splice(Number(rm), 1); redraw(); }
  });
  planRoot.addEventListener("change", (e) => {
    const code = e.target.dataset.learn;
    if (code) { choice.set(code, e.target.checked); redraw(); }
  });

  app.querySelector("#plan-go").addEventListener("click", () => {
    const chosen = derive().rows.filter((r) => willLearn(r) && r.l.available).map((r) => r.l.code);
    let firstTrip = null;
    for (const code of chosen) {
      const l = langs.get(code);
      const pack = catalog.get(code);
      // earliest arrival among stops whose country maps to this language
      const rel = stops.filter((s) => (ccLangs[s.cc] || []).includes(code)).map((s) => s.from).sort();
      const t = addTrip({
        packCode: code, packName: pack?.name || l.name, flag: pack?.flag || l.flag,
        destination: stops.find((s) => (ccLangs[s.cc] || []).includes(code))?.name || pack?.destination || l.name,
        departureDate: rel[0] || iso(Date.now() + 21 * DAY),
        scriptMode: pack?.scripts?.default || "latin",
        helper: (pack?.scripts?.default || "latin") === "arabic",
      });
      firstTrip = firstTrip || t;
    }
    if (opts.onDone) opts.onDone(firstTrip);
  });

  redraw();
}
