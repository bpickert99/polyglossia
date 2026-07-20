// Spaced-repetition scheduler based on FSRS-4.5 (the algorithm behind modern
// Anki), simplified to the binary grades a lesson exercise produces:
// wrong -> "again", correct -> "good".
//
// Each vocabulary item carries:
//   S (stability, days)  — how long the memory lasts
//   D (difficulty, 1-10) — item-specific hardness, updated on every review
//   due                  — timestamp of the next scheduled review
// Retrievability R(t) is computed from elapsed time and stability, so the
// practice queue can rank items by how close they are to being forgotten.

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];
const FACTOR = 19 / 81;
const DECAY = -0.5;
const TARGET_RETENTION = 0.9;
const DAY = 86400000;

const AGAIN = 1;
const GOOD = 3;

const clampD = (d) => Math.min(10, Math.max(1, d));

function initStability(grade) {
  return Math.max(0.1, W[grade - 1]);
}

function initDifficulty(grade) {
  return clampD(W[4] - (grade - 3) * W[5]);
}

export function retrievability(item, now = Date.now()) {
  if (!item?.S) return 0;
  const t = Math.max(0, (now - item.last) / DAY);
  return Math.pow(1 + (FACTOR * t) / item.S, DECAY);
}

function nextIntervalDays(S) {
  return Math.max(0.5, (S / FACTOR) * (Math.pow(TARGET_RETENTION, 1 / DECAY) - 1));
}

function nextDifficulty(D, grade) {
  const updated = D - W[6] * (grade - 3);
  return clampD(W[7] * initDifficulty(4) + (1 - W[7]) * updated);
}

function stabilityAfterSuccess(D, S, R) {
  return S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp((1 - R) * W[10]) - 1));
}

function stabilityAfterLapse(D, S, R) {
  const s = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp((1 - R) * W[14]);
  return Math.min(s, S); // forgetting never increases stability
}

// Apply one review result. Returns the updated item (mutates in place too).
export function review(item, correct, now = Date.now()) {
  const grade = correct ? GOOD : AGAIN;
  if (!item.S) {
    item.S = initStability(grade);
    item.D = initDifficulty(grade);
  } else {
    const R = retrievability(item, now);
    item.D = nextDifficulty(item.D, grade);
    item.S = correct ? stabilityAfterSuccess(item.D, item.S, R) : stabilityAfterLapse(item.D, item.S, R);
    if (!correct) item.lapses = (item.lapses || 0) + 1;
  }
  item.reps = (item.reps || 0) + 1;
  item[correct ? "correct" : "wrong"] = (item[correct ? "correct" : "wrong"] || 0) + 1;
  item.last = now;
  // Failed items come back within the same day; successes follow the curve.
  item.due = now + (correct ? nextIntervalDays(item.S) * DAY : 10 * 60 * 1000);
  return item;
}

export function isDue(item, now = Date.now()) {
  return !!item?.S && item.due <= now;
}

// "Mastered" = memory stable for three weeks or more at target retention.
export function isMastered(item) {
  return (item?.S || 0) >= 21;
}

export function accuracy(item) {
  const n = (item?.correct || 0) + (item?.wrong || 0);
  return n ? (item.correct || 0) / n : 1;
}

// 0..1 bar for UI: how solid this memory currently is.
export function strength(item, now = Date.now()) {
  if (!item?.S) return 0;
  const maturity = Math.min(1, item.S / 21);
  return retrievability(item, now) * (0.4 + 0.6 * maturity);
}
