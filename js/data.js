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

// Load every module of a pack concurrently → Map(moduleId -> items[]).
export async function loadPackModules(code, pack) {
  const entries = await Promise.all(
    (pack.modules || []).map(async (m) => {
      try { return [m.id, (await loadModule(code, m.file)).items || []]; }
      catch { return [m.id, []]; }
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
