// Progress persistence — localStorage first, optionally synced to the cloud
// (see sync.js). All reads/writes go through this module; anything that
// changes state notifies subscribers so the sync layer can push.
import { review } from "./srs.js";
import { updateRatings, seedDifficulty } from "./birdbrain.js";

const KEY = "polyglossia.v1";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

let state = load();
state.xp = state.xp || 0;
state.completed = state.completed || {};
state.streak = state.streak || { count: 0, lastDate: null };
state.items = state.items || {};   // "<lang>:<key>" -> FSRS item + display data
state.days = state.days || {};     // "YYYY-MM-DD" -> XP earned that day
state.dailyGoal = state.dailyGoal || 50;
state.ability = state.ability || {}; // "<lang>" -> Birdbrain ability (logits)

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  for (const fn of listeners) fn(state);
}

// ---------- XP / streak ----------

export function getXP() {
  return state.xp;
}

export function addXP(amount) {
  state.xp += amount;
  state.days[today()] = (state.days[today()] || 0) + amount;
  bumpStreak();
  save();
}

function bumpStreak() {
  const t = today();
  const last = state.streak.lastDate;
  if (last === t) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak.count = last === yesterday ? state.streak.count + 1 : 1;
  state.streak.lastDate = t;
}

export function getStreak() {
  const last = state.streak.lastDate;
  if (!last) return 0;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return last === today() || last === yesterday ? state.streak.count : 0;
}

export function getDays() {
  return state.days;
}

export function getDailyGoal() {
  return state.dailyGoal;
}

export function todayXP() {
  return state.days[today()] || 0;
}

// ---------- lessons ----------

export function markLessonComplete(lang, unitId, lessonId) {
  const key = `${lang}/${unitId}/${lessonId}`;
  const rec = state.completed[key] || { times: 0 };
  rec.times += 1;
  rec.lastAt = Date.now();
  state.completed[key] = rec;
  save();
}

export function isLessonComplete(lang, unitId, lessonId) {
  return !!state.completed[`${lang}/${unitId}/${lessonId}`];
}

export function unitProgress(lang, unitId, lessonIds) {
  if (!lessonIds.length) return 0;
  const done = lessonIds.filter((id) => isLessonComplete(lang, unitId, id)).length;
  return done / lessonIds.length;
}

// ---------- SRS item tracking ----------

// Ensure an item record exists (called when a word is first taught/tested).
export function touchItem(lang, key, display = {}) {
  const id = `${lang}:${key}`;
  if (!state.items[id]) {
    state.items[id] = { key, lang, ...display };
  } else {
    Object.assign(state.items[id], display);
  }
  return state.items[id];
}

// Record one exercise result against an item. Updates BOTH the FSRS schedule
// (when to review) and the Birdbrain ratings (learner ability + item difficulty,
// i.e. how hard to pitch the next exercise).
export function recordResult(lang, key, correct, display = {}) {
  const item = touchItem(lang, key, display);
  review(item, correct);
  // Consecutive-wrong streak, independent of srs.js's lapses (which never
  // resets) — this is what marks an item a "leech" worth re-teaching instead
  // of re-quizzing. See srs.js isLeech / resetLapseStreak below.
  item.lapseStreak = correct ? 0 : (item.lapseStreak || 0) + 1;
  // Birdbrain: seed item difficulty from its CEFR level on first sight, then
  // nudge both the item's difficulty and the learner's ability.
  if (item.bd === undefined) item.bd = seedDifficulty(item.level);
  const next = updateRatings(state.ability[lang] ?? 0, item.bd, correct);
  state.ability[lang] = next.ability;
  item.bd = next.difficulty;
  save();
  return item;
}

// Called after a leech has been re-taught (see lesson.js showReteachCard):
// clears the wrong-streak so the item gets a normal graded rep next time
// it's due, instead of an immediate second reteach.
export function resetLapseStreak(lang, key) {
  const item = state.items[`${lang}:${key}`];
  if (item) {
    item.lapseStreak = 0;
    save();
  }
}

export function getItems(lang) {
  return Object.values(state.items).filter((i) => i.lang === lang);
}

// ---------- Birdbrain ability ----------

export function getAbility(lang) {
  return state.ability[lang] ?? 0;
}

// ---------- language selection ----------

export function getLang() {
  return state.lang || null;
}

export function setLang(code) {
  state.lang = code;
  save();
}

// ---------- trips / courses (travel-tool redesign) ----------

// A trip is one course-with-a-deadline the learner is working:
//   { id, packCode, packName, flag, destination,
//     departureDate (ISO yyyy-mm-dd), scriptMode ('arabizi'|'arabic'),
//     helper (bool), createdAt, lastLesson (yyyy-mm-dd) }
// We keep a list (you can plan more than one trip) plus which one is active.
state.trips = state.trips || [];
state.activeTripId = state.activeTripId || null;

// Migrate the old singular state.trip (pre-multi-trip) into the list, once.
if (state.trip && state.trip.departureDate && !state.trips.length) {
  const migrated = { id: genTripId(), createdAt: Date.now(), ...state.trip };
  state.trips.push(migrated);
  state.activeTripId = migrated.id;
  delete state.trip;
  save();
}
if (!state.activeTripId && state.trips.length) state.activeTripId = state.trips[0].id;

function genTripId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function listTrips() {
  return state.trips;
}

export function getActiveTrip() {
  return state.trips.find((t) => t.id === state.activeTripId) || null;
}

export function setActiveTrip(id) {
  if (state.trips.some((t) => t.id === id)) {
    state.activeTripId = id;
    save();
  }
}

export function addTrip(trip) {
  const t = { id: genTripId(), createdAt: Date.now(), lastLesson: null, ...trip };
  state.trips.push(t);
  state.activeTripId = t.id;
  save();
  return t;
}

export function updateTrip(id, patch) {
  const t = state.trips.find((x) => x.id === id);
  if (t) {
    Object.assign(t, patch);
    save();
  }
  return t;
}

// Remove a trip and — unless another trip still uses the same pack — purge all
// of that language's learned progress (words, grammar rungs, ability). Lets you
// wipe a course and start it clean.
export function deleteTrip(id) {
  const t = state.trips.find((x) => x.id === id);
  if (!t) return;
  state.trips = state.trips.filter((x) => x.id !== id);
  const stillUsed = state.trips.some((x) => x.packCode === t.packCode);
  if (!stillUsed) {
    for (const k of Object.keys(state.items)) {
      if (state.items[k].lang === t.packCode) delete state.items[k];
    }
    delete state.ability[t.packCode];
  }
  if (state.activeTripId === id) state.activeTripId = state.trips[0]?.id ?? null;
  save();
}

// Mark today's lesson done for a trip and update its day-streak: +1 if the last
// lesson was yesterday, reset to 1 after a gap, unchanged if already done today.
// Returns the current streak.
export function completeLesson(id) {
  const t = state.trips.find((x) => x.id === id);
  if (!t) return 0;
  const today = new Date().toISOString().slice(0, 10);
  if (t.lastLesson !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    t.streak = t.lastLesson === yesterday ? (t.streak || 0) + 1 : 1;
    t.lastLesson = today;
    save();
  }
  return t.streak || 0;
}

// Back-compat shims: the trip app still reads/writes "the current trip".
export function getTrip() {
  return getActiveTrip() || {};
}

export function setTrip(patch) {
  const t = getActiveTrip();
  return t ? updateTrip(t.id, patch) : null;
}

// ---------- sync support ----------

export function exportState() {
  return structuredClone(state);
}

// Merge a remote copy of the state into the local one (field-aware: newest
// review wins per item, max wins for counters) and persist.
export function mergeRemoteState(remote) {
  if (!remote || typeof remote !== "object") return;
  state.xp = Math.max(state.xp || 0, remote.xp || 0);
  state.dailyGoal = remote.dailyGoal || state.dailyGoal;
  for (const [lang, a] of Object.entries(remote.ability || {})) {
    // Favor the more-practiced (further-from-zero) ability estimate.
    if (Math.abs(a) > Math.abs(state.ability[lang] ?? 0)) state.ability[lang] = a;
  }
  for (const [d, xp] of Object.entries(remote.days || {})) {
    state.days[d] = Math.max(state.days[d] || 0, xp);
  }
  if ((remote.streak?.lastDate || "") > (state.streak?.lastDate || "")) {
    state.streak = remote.streak;
  }
  for (const [k, rec] of Object.entries(remote.completed || {})) {
    const mine = state.completed[k];
    if (!mine || (rec.lastAt || 0) > (mine.lastAt || 0)) state.completed[k] = rec;
    else mine.times = Math.max(mine.times, rec.times || 0);
  }
  for (const [id, item] of Object.entries(remote.items || {})) {
    const mine = state.items[id];
    if (!mine || (item.last || 0) > (mine.last || 0)) state.items[id] = item;
  }
  // Trips: union by id (remote adds any we don't have); newest lastLesson wins.
  for (const rt of remote.trips || []) {
    const mine = state.trips.find((t) => t.id === rt.id);
    if (!mine) state.trips.push(rt);
    else if ((rt.lastLesson || "") > (mine.lastLesson || "")) Object.assign(mine, rt);
  }
  if (!state.activeTripId && (remote.activeTripId || state.trips[0])) {
    state.activeTripId = remote.activeTripId || state.trips[0].id;
  }
  if (!state.lang && remote.lang) state.lang = remote.lang;
  save();
}
