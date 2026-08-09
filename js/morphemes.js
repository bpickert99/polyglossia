// Morpheme-first teaching support (see docs/teaching-principles.md).
//
// Colour is a decoding KEY, not decoration: every meaning-class wears one stable
// colour, the same everywhere in the app, so a word's colours read as
// grammar-at-a-glance and a learner can gist an unheard word from its coloured
// segments. This module owns that class→colour mapping and the role→class
// inference used to colour AI-generated segments consistently with authored ones.
// The colours themselves live as --mph-* CSS tokens (theme-aware) in trip.css.

export const MPH_CLASSES = ["tense", "person", "neg", "q", "poss", "root"];

const CLASS_VAR = {
  tense: "--mph-tense",
  person: "--mph-person",
  neg: "--mph-neg",
  q: "--mph-q",
  poss: "--mph-poss",
  root: "--mph-root",
};
export const classColorVar = (cls) => CLASS_VAR[cls] || CLASS_VAR.root;

// Map a free-text morpheme role (authored, or whatever the AI labelled a segment)
// onto one of the stable classes, so every source colours the same way.
const ROLE_RULES = [
  [/pres|fut|tense|will|going|aspect/i, "tense"],
  [/\b(i|you|he|she|we|they|it)\b|person|subject|1st|2nd|3rd|pronoun/i, "person"],
  [/neg|not|n['’]?t|without/i, "neg"],
  [/quest|ask|wh-|yes.?no|interrog/i, "q"],
  [/poss|genitive|belong|\bof\b|\bmy\b|\byour\b|mine|yours/i, "poss"],
];
export function classForRole(label) {
  const s = String(label || "");
  for (const [re, cls] of ROLE_RULES) if (re.test(s)) return cls;
  return "root";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Render a word's morphemes as coloured segments. segs: [{ seg, cls?, role?, gloss? }].
// When a segment has no explicit class, infer it from its role label so AI output
// and authored data land on the same colours. `gloss` shows the role/meaning
// beneath each segment (used in the teaching key; off in tight inline contexts).
export function morphemeChips(segs, { gloss = false } = {}) {
  const inner = (segs || []).map((m) => {
    const cls = m.cls || classForRole(m.role);
    const label = gloss ? (m.gloss || m.role || "") : "";
    return `<span class="mph-seg">
      <span class="mph-t" style="color:var(${classColorVar(cls)})">${esc(m.seg)}</span>
      ${label ? `<span class="mph-g">${esc(label)}</span>` : ""}
    </span>`;
  }).join('<span class="mph-plus">+</span>');
  return `<span class="mph">${inner}</span>`;
}
