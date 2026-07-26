#!/usr/bin/env node
// Darija ASR calibration harness.
//
// Answers one question before we build the speaking core: how well does
// off-the-shelf speech-to-text understand a real learner speaking Darija?
// Speech-eval is the heart of the redesign, so we de-risk it FIRST — if the
// transcription is garbage, we adjust (different vendor, or lean writing-first)
// before building the whole scenario flow around it.
//
// It sends each recorded clip to OpenAI's transcription models and compares
// the result to the expected Arabic-script spelling. OpenAI outputs Arabic
// script (not Arabizi), so we compare against the `arabic` field, diacritics
// stripped. A meaning-focused eval doesn't need a perfect match — a rough
// similarity tells us whether "did they get the gist across?" is viable.
//
// Usage:
//   1. Record yourself saying each phrase in clips.json (see README.md),
//      saving as clips/<id>.<ext>.
//   2. OPENAI_API_KEY=sk-... node scripts/asr-calibration/calibrate.mjs
//
// Optional: ASR_MODELS=whisper-1 node ... to test a single model.

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = join(HERE, "clips");
const KEY = process.env.OPENAI_API_KEY;
// gpt-4o-transcribe is OpenAI's newer, more accurate model; whisper-1 is the
// older baseline. We test both so you can see which is worth paying for.
const MODELS = (process.env.ASR_MODELS || "gpt-4o-transcribe,whisper-1")
  .split(",").map((m) => m.trim()).filter(Boolean);

const AUDIO_EXTS = new Set([".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".mp4", ".mpeg", ".mpga"]);

if (!KEY) {
  console.error("Set OPENAI_API_KEY (get one at platform.openai.com). Example:\n" +
    "  OPENAI_API_KEY=sk-... node scripts/asr-calibration/calibrate.mjs");
  process.exit(1);
}

// Normalize Arabic for comparison: drop diacritics + tatweel, collapse
// alef/ya/ta-marbuta variants, strip whitespace and punctuation. ASR won't
// emit diacritics and spelling of dialect words varies, so we compare shapes.
function normArabic(s) {
  return String(s)
    .normalize("NFC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\p{P}]/gu, "");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

function similarity(expected, actual) {
  const x = normArabic(expected), y = normArabic(actual);
  if (!x && !y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length, 1);
}

async function transcribe(model, filePath) {
  const buf = await readFile(filePath);
  const form = new FormData();
  form.append("model", model);
  form.append("language", "ar"); // best available hint; no Darija-specific code exists
  form.append("file", new Blob([buf]), basename(filePath));
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`${res.status} — ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.text || "").trim();
}

async function findClip(id) {
  if (!existsSync(CLIPS_DIR)) return null;
  const files = await readdir(CLIPS_DIR);
  const match = files.find((f) => basename(f, extname(f)) === id && AUDIO_EXTS.has(extname(f).toLowerCase()));
  return match ? join(CLIPS_DIR, match) : null;
}

function bar(score) {
  const n = Math.round(score * 20);
  return "█".repeat(n) + "░".repeat(20 - n);
}

async function main() {
  const manifest = JSON.parse(await readFile(join(HERE, "clips.json"), "utf8"));
  const items = manifest.items || [];

  const present = [];
  for (const it of items) {
    const file = await findClip(it.id);
    if (file) present.push({ ...it, file });
  }

  if (!present.length) {
    console.error(`No audio clips found in ${CLIPS_DIR}\n` +
      `Record yourself saying the phrases in clips.json and save them as clips/<id>.<ext>.\n` +
      `Expected ids: ${items.map((i) => i.id).join(", ")}`);
    process.exit(1);
  }
  console.log(`Found ${present.length}/${items.length} clips. Testing models: ${MODELS.join(", ")}\n`);

  const totals = Object.fromEntries(MODELS.map((m) => [m, []]));

  for (const it of present) {
    console.log(`\n▸ ${it.roman}  —  "${it.english}"   (expected: ${it.arabic})`);
    for (const model of MODELS) {
      try {
        const text = await transcribe(model, it.file);
        const score = similarity(it.arabic, text);
        totals[model].push(score);
        console.log(`   ${model.padEnd(20)} ${bar(score)} ${(score * 100).toFixed(0).padStart(3)}%   ${text || "(empty)"}`);
      } catch (err) {
        console.log(`   ${model.padEnd(20)} ERROR — ${err.message}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("AVERAGE SIMILARITY BY MODEL");
  for (const model of MODELS) {
    const scores = totals[model];
    if (!scores.length) { console.log(`  ${model}: no successful transcriptions`); continue; }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const verdict = avg >= 0.8 ? "STRONG — strict eval viable"
      : avg >= 0.55 ? "USABLE — build a tolerant, meaning-focused eval"
      : avg >= 0.35 ? "WEAK — try another vendor (Deepgram/ElevenLabs) or lean writing-first"
      : "POOR — Darija voice-eval not viable with this model";
    console.log(`  ${model.padEnd(20)} ${bar(avg)} ${(avg * 100).toFixed(0)}%   → ${verdict}`);
  }
  console.log("=".repeat(60));
  console.log("\nSend me these numbers (and eyeball the transcriptions above — sometimes\nthe text is recognizable to a human even when the % is low). That tells us\nwhether to build voice-eval on OpenAI, switch vendors, or lead with writing.");
}

main().catch((e) => { console.error(e); process.exit(1); });
