// Progress persistence — localStorage first, optionally synced to the cloud
// (see sync.js). All reads/writes go through this module; anything that
// changes state notifies subscribers so the sync layer can push.
import { review } from "./srs.js";

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

// Record one exercise result against an item; updates the FSRS schedule.
export function recordResult(lang, key, correct, display = {}) {
  const item = touchItem(lang, key, display);
  review(item, correct);
  save();
  return item;
}

export function getItems(lang) {
  return Object.values(state.items).filter((i) => i.lang === lang);
}

// ---------- language selection ----------

export function getLang() {
  return state.lang || null;
}

export function setLang(code) {
  state.lang = code;
  save();
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
  if (!state.lang && remote.lang) state.lang = remote.lang;
  save();
}
