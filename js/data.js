// Loads course data generated into /data by the course builder.
const cache = new Map();

async function fetchJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  const json = await res.json();
  cache.set(path, json);
  return json;
}

export function loadLanguages() {
  return fetchJSON("data/languages.json");
}

export function loadCourse(code) {
  return fetchJSON(`data/${code}/course.json`);
}

export function loadUnit(code, unitFile) {
  return fetchJSON(`data/${code}/${unitFile}`);
}

export function loadCulture(code) {
  return fetchJSON(`data/${code}/culture.json`).catch(() => ({ articles: [] }));
}

export function loadScript(code) {
  return fetchJSON(`data/${code}/script.json`).catch(() => null);
}

// ---------- travel packs (the trip-tool redesign) ----------

export function loadPack(code) {
  return fetchJSON(`data/${code}/pack.json`);
}

export function loadModule(code, file) {
  return fetchJSON(`data/${code}/${file}`);
}

// The grammar spine (rungs). Optional — packs without one just teach vocab.
export function loadGrammar(code) {
  return fetchJSON(`data/${code}/grammar.json`).catch(() => ({ rungs: [], structures: {} }));
}

// Foundational reading rules (e.g. Arabizi number-letters). Optional.
export function loadFoundations(code) {
  return fetchJSON(`data/${code}/foundations.json`).catch(() => null);
}

// The morpheme inventory — the decoders + their colour classes. Optional.
export function loadMorphemes(code) {
  return fetchJSON(`data/${code}/morphemes.json`).catch(() => null);
}

// Get-by challenges — strategic-competence tasks. Optional.
export function loadChallenges(code) {
  return fetchJSON(`data/${code}/challenges.json`).catch(() => null);
}

// The traveler-facing world atlas — 50 languages with map + scoring metadata.
export function loadWorldLanguages() {
  return fetchJSON("data/world-languages.json").catch(() => ({ languages: [] }));
}

// Load every module of a pack concurrently → Map(moduleId -> full module).
export async function loadPackModules(code, pack) {
  const entries = await Promise.all(
    (pack.modules || []).map(async (m) => {
      try { return [m.id, await loadModule(code, m.file)]; }
      catch { return [m.id, { id: m.id, items: [] }]; }
    })
  );
  return new Map(entries);
}

export function findUnit(course, unitId) {
  for (const section of course.sections) {
    const unit = (section.units || []).find((u) => u.id === unitId);
    if (unit) return { unit, section };
  }
  return null;
}
