import { getItems, getDays, getXP, getStreak, getDailyGoal, todayXP, getAbility } from "./storage.js";
import { isDue, isMastered, strength, accuracy } from "./srs.js";
import { abilityBand, predictP, seedDifficulty } from "./birdbrain.js";
import { renderSyncCard } from "./sync.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const DAY = 86400000;

export function renderStats(app, course) {
  const items = course ? getItems(course.code).filter((i) => i.target && i.english) : [];
  const tracked = items.filter((i) => i.reps);
  const now = Date.now();

  const due = tracked.filter((i) => isDue(i, now));
  const mastered = tracked.filter(isMastered);
  const attempts = tracked.reduce((n, i) => n + (i.correct || 0) + (i.wrong || 0), 0);
  const rights = tracked.reduce((n, i) => n + (i.correct || 0), 0);
  const dueTomorrow = tracked.filter((i) => !isDue(i, now) && i.due <= now + DAY);
  const dueWeek = tracked.filter((i) => !isDue(i, now) && i.due <= now + 7 * DAY);

  const weakest = [...tracked]
    .sort((a, b) => strength(a, now) - strength(b, now))
    .slice(0, 6);

  // Last 7 days of XP for the mini bar chart.
  const days = getDays();
  const week = [...Array(7)].map((_, k) => {
    const d = new Date(now - (6 - k) * DAY);
    const key = d.toISOString().slice(0, 10);
    return { label: "SMTWTFS"[d.getDay()], xp: days[key] || 0, isToday: k === 6 };
  });
  const maxXP = Math.max(getDailyGoal(), ...week.map((w) => w.xp));

  const goalPct = Math.min(100, Math.round((todayXP() / getDailyGoal()) * 100));

  const ability = course ? getAbility(course.code) : 0;
  const band = abilityBand(ability);
  // Predicted success on a fresh average word at this ability, for display.
  const predPct = Math.round(predictP(ability, seedDifficulty("A2")) * 100);
  const abilityPct = Math.max(4, Math.min(100, Math.round(((ability + 2) / 4) * 100)));

  app.innerHTML = `
    <div class="lang-hero">
      <h1>📊 Your learning${course ? ` — ${esc(course.name)}` : ""}</h1>
      <p>The engine tracks your ability and each word's difficulty (Birdbrain-style), schedules
      reviews with spaced repetition (FSRS), and aims every exercise near an 80% success rate.</p>
    </div>

    <div class="article">
      <h2>Estimated ability</h2>
      <p><b>${esc(band.label)}</b> · around CEFR <b>${esc(band.cefr)}</b></p>
      <div class="goalbar"><div style="width:${abilityPct}%;background:var(--blue)"></div></div>
      <p class="muted">${tracked.length ? `On a typical A2 word you'd get about ${predPct}% right. As this rises, lessons introduce harder words and tougher exercises.` : "Complete a few exercises and your ability estimate will appear here."}</p>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><b>${tracked.length}</b><span>words tracked</span></div>
      <div class="stat-card"><b>${mastered.length}</b><span>mastered</span></div>
      <div class="stat-card ${due.length ? "hot" : ""}"><b>${due.length}</b><span>due now</span></div>
      <div class="stat-card"><b>${attempts ? Math.round((rights / attempts) * 100) + "%" : "—"}</b><span>accuracy</span></div>
      <div class="stat-card"><b>${getStreak()} 🔥</b><span>day streak</span></div>
      <div class="stat-card"><b>${getXP()} ⭐</b><span>total XP</span></div>
    </div>

    <div class="article">
      <h2>Daily goal</h2>
      <div class="goalbar"><div style="width:${goalPct}%"></div></div>
      <p class="muted">${todayXP()} / ${getDailyGoal()} XP today${goalPct >= 100 ? " — goal met! 🎉" : ""}</p>
      <div class="weekchart">
        ${week.map((w) => `
          <div class="wc-col">
            <div class="wc-bar ${w.isToday ? "today" : ""}" style="height:${Math.max(4, Math.round((w.xp / maxXP) * 72))}px" title="${w.xp} XP"></div>
            <span>${w.label}</span>
          </div>`).join("")}
      </div>
    </div>

    <div class="article">
      <h2>Review forecast</h2>
      <p><b>${due.length}</b> due now · <b>${dueTomorrow.length}</b> in the next day · <b>${dueWeek.length}</b> within a week</p>
      ${due.length ? `<a class="btn blue" href="#/practice">Practice now (${due.length})</a>` : `<p class="muted">Nothing due — come back later, or learn something new.</p>`}
    </div>

    ${weakest.length ? `
    <div class="article">
      <h2>Needs attention</h2>
      ${weakest.map((i) => `
        <div class="word-row">
          <span class="target">${esc(i.target)}</span>
          <span class="muted">${esc(i.english)}</span>
          <span class="strengthbar"><i style="width:${Math.round(strength(i, now) * 100)}%"></i></span>
          <span class="muted">${Math.round(accuracy(i) * 100)}%</span>
        </div>`).join("")}
      <p class="muted" style="margin-top:8px">These words get boosted to the front of your practice queue.</p>
    </div>` : `
    <div class="article"><h2>Needs attention</h2>
      <p class="muted">Complete some lessons and this section will show the words you struggle with.</p>
    </div>`}

    <div id="sync-card"></div>`;

  renderSyncCard(document.getElementById("sync-card"));
}
