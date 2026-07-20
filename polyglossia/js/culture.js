import { loadCulture } from "./data.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n+/)
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`)
    .join("");
}

export async function renderCulture(app, course) {
  const culture = course ? await loadCulture(course.code) : { articles: [] };

  if (!culture.articles.length) {
    app.innerHTML = `<div class="lang-hero"><h1>🏛️ Culture</h1>
      <p>No cultural notes have been generated for this course yet. They'll appear here once
      source documents containing cultural material are added.</p></div>`;
    return;
  }

  app.innerHTML = `
    <div class="lang-hero"><h1>🏛️ Culture</h1>
    <p>Context and background for ${esc(course.name)} — generated from the course's source materials.</p></div>
    ${culture.articles.map((a) => `
      <article class="article">
        <h2>${esc(a.title)}</h2>
        ${paragraphs(a.body)}
        ${a.tags?.length ? `<div class="tags">${a.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      </article>`).join("")}`;
}
