// Polyglossia course builder.
//
// Reads source documents from sources/<lang>/ and uses Claude to generate or
// incrementally update the CEFR-aligned course in data/<lang>/. Runs in CI
// (see .github/workflows/build-course.yml) whenever sources change, or locally:
//
//   ANTHROPIC_API_KEY=sk-... node scripts/build-course.mjs [langCode]
//
// Incrementality: data/<lang>/manifest.json records a hash of every processed
// source file. Unchanged sources -> no API calls. Changed/new sources -> the
// course outline is revised and only new/changed units are regenerated.

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";
const ROOT = new URL("..", import.meta.url).pathname;
const SOURCES = join(ROOT, "sources");
const DATA = join(ROOT, "data");

let _client;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it as a repository secret " +
        "(Settings → Secrets and variables → Actions) so the course builder can call Claude.");
    }
    _client = new Anthropic();
  }
  return _client;
}

// ---------- helpers ----------

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function readJSON(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(path, obj) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => !f.startsWith(".") && f.toLowerCase() !== "readme.md")
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile())
    .filter((p) => [".txt", ".md", ".pdf"].includes(extname(p).toLowerCase()));
}

// Source documents as Claude content blocks. PDFs go in natively; text files
// are wrapped with a filename header so the model can cite provenance.
function docBlocks(files) {
  const blocks = [];
  for (const path of files) {
    if (extname(path).toLowerCase() === ".pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: readFileSync(path).toString("base64") },
        title: basename(path),
      });
    } else {
      blocks.push({
        type: "text",
        text: `<source_document filename="${basename(path)}">\n${readFileSync(path, "utf8")}\n</source_document>`,
      });
    }
  }
  if (blocks.length) blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  return blocks;
}

async function ask(system, userBlocks, schema, maxTokens = 64000) {
  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: userBlocks }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("Model declined the request (stop_reason: refusal).");
  }
  const text = message.content.find((b) => b.type === "text")?.text;
  if (message.stop_reason === "max_tokens") {
    throw new Error("Output truncated (max_tokens) — split source documents into smaller files and retry.");
  }
  return JSON.parse(text);
}

// ---------- JSON schemas the model must produce ----------

const S = {
  str: { type: "string" },
  bool: { type: "boolean" },
  int: { type: "integer" },
};

const noteSchema = {
  type: "object",
  properties: { title: S.str, body: S.str },
  required: ["title", "body"],
  additionalProperties: false,
};

const outlineSchema = {
  type: "object",
  properties: {
    course: {
      type: "object",
      properties: {
        code: S.str,
        name: S.str,
        nativeName: S.str,
        direction: { type: "string", enum: ["ltr", "rtl"] },
        description: S.str,
        script: {
          type: "object",
          properties: { name: S.str, nonLatin: S.bool },
          required: ["name", "nonLatin"],
          additionalProperties: false,
        },
        tts: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["native", "approximate"] },
            preferredLangs: { type: "array", items: S.str },
            rate: { type: "number" },
            note: S.str,
            substitutions: { type: "array", items: { type: "array", items: S.str } },
          },
          required: ["mode", "preferredLangs", "note", "substitutions"],
          additionalProperties: false,
        },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
              title: S.str,
              description: S.str,
              locked: S.bool,
              units: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: S.str,
                    title: S.str,
                    icon: S.str,
                    file: S.str,
                    status: { type: "string", enum: ["new", "changed", "unchanged"] },
                    brief: S.str,
                  },
                  required: ["id", "title", "icon", "file", "status", "brief"],
                  additionalProperties: false,
                },
              },
            },
            required: ["level", "title", "description", "locked", "units"],
            additionalProperties: false,
          },
        },
      },
      required: ["code", "name", "nativeName", "direction", "description", "script", "tts", "sections"],
      additionalProperties: false,
    },
    regenerateScript: S.bool,
    regenerateCulture: S.bool,
  },
  required: ["course", "regenerateScript", "regenerateCulture"],
  additionalProperties: false,
};

const exerciseSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["mc", "listen", "type", "match"] },
    prompt: S.str,
    choices: { type: "array", items: S.str },
    answer: { anyOf: [S.int, S.str] },
    accept: { type: "array", items: S.str },
    tts: S.str,
    ttsText: S.str,
    pairs: { type: "array", items: { type: "array", items: S.str } },
  },
  required: ["type"],
  additionalProperties: false,
};

const unitSchema = {
  type: "object",
  properties: {
    id: S.str,
    title: S.str,
    level: S.str,
    summary: S.str,
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: S.str,
          title: S.str,
          teach: {
            type: "array",
            items: {
              type: "object",
              properties: { target: S.str, roman: S.str, english: S.str, note: S.str },
              required: ["target", "english"],
              additionalProperties: false,
            },
          },
          grammar: noteSchema,
          culture: noteSchema,
          exercises: { type: "array", items: exerciseSchema },
        },
        required: ["id", "title", "exercises"],
        additionalProperties: false,
      },
    },
  },
  required: ["id", "title", "level", "summary", "lessons"],
  additionalProperties: false,
};

const scriptSchema = {
  type: "object",
  properties: {
    name: S.str,
    description: S.str,
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: S.str,
          glyphs: {
            type: "array",
            items: {
              type: "object",
              properties: { glyph: S.str, roman: S.str },
              required: ["glyph", "roman"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "glyphs"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "description", "groups"],
  additionalProperties: false,
};

const cultureSchema = {
  type: "object",
  properties: {
    articles: {
      type: "array",
      items: {
        type: "object",
        properties: { title: S.str, body: S.str, tags: { type: "array", items: S.str } },
        required: ["title", "body", "tags"],
        additionalProperties: false,
      },
    },
  },
  required: ["articles"],
  additionalProperties: false,
};

// ---------- prompts ----------

const SYSTEM = `You are the course builder for Polyglossia, an open-source, Duolingo-style
learning platform for under-served languages. You turn uploaded source documents (grammars,
word lists, phrasebooks, readers, lesson notes) into a structured, CEFR-aligned course.

Non-negotiable principles:
- FIDELITY: base every vocabulary item, grammar explanation, and cultural note on the source
  documents. Do not invent words or forms not supported by the sources or by well-established
  reference knowledge of the language. When sources conflict, prefer the most recent/most
  authoritative document and note dialect variation in a grammar or culture note.
- CEFR ALIGNMENT: place units honestly on the A1-C2 scale. Only create units at a level if
  the source material genuinely supports teaching at that level; keep higher sections locked
  ("locked": true, "units": []) otherwise. A1 = greetings, basic phrases, script basics;
  A2 = everyday topics, simple present-tense sentences; B1+ = connected discourse.
- RESPECT: for Indigenous and minority languages, include cultural notes that are accurate
  and respectful, remind learners that communities own their languages, and avoid sacred or
  ceremonial content that the sources do not explicitly present for outsiders.
- INCREMENTALITY: you are given the existing course (if any). Preserve existing unit ids and
  content wherever the sources still support them, mark them "unchanged", and only mark units
  "new" or "changed" when the source material adds or revises what they teach. Never renumber
  or shuffle existing units without cause — learners have progress tied to unit ids.
- EXERCISES: every lesson mixes exercise types (mc, listen, type, match). "mc"/"listen" need
  "choices" (3-4) and integer "answer" index; "listen" needs "ttsText" (romanization to speak);
  "type" needs string "answer" (+ optional "accept" variants); "match" needs 2-5 "pairs".
  Exercises must only test material taught in the same or earlier lessons.
- PEDAGOGY (research-backed; the app adds spaced repetition on top of what you author):
  * Frequency first: order vocabulary by usefulness/frequency; teach high-frequency words
    and formulaic chunks (greetings, "I want...", "where is...") before rare words.
  * Cognitive load: 3-6 new items per lesson, no more.
  * Retrieval practice: favor production ("type") and discrimination ("match") over pure
    recognition; include at least one production exercise per lesson.
  * Comprehensible input (i+1): where sources allow, include short example sentences that
    combine one new element with already-taught words (teach items and cloze-style "mc"
    exercises whose prompt is a sentence with a blank: "ᎠᎹ ___ = water, please").
  * Explicit-but-brief grammar: one focused grammar note per lesson at most, with a small
    table and a pattern the learner can generalize, not a lecture.
- TTS: for languages with no real TTS voice, set tts.mode to "approximate", choose
  preferredLangs whose phonology best fits the romanization (often ["<iso>", "es", "it", "en"]),
  and provide "substitutions" - [from, to] pairs that rewrite romanization sequences a fallback
  voice would mangle (e.g. nasal vowels, unusual digraphs).
- SCRIPT: if the language uses a non-Latin script, produce a complete script inventory grouped
  pedagogically (vowels first, then consonant series) for the drawing-practice tab.`;

// ---------- per-language build ----------

async function buildLanguage(code) {
  const srcDir = join(SOURCES, code);
  const outDir = join(DATA, code);
  const files = listSourceFiles(srcDir);
  if (!files.length) {
    console.log(`[${code}] no source documents — skipping`);
    return false;
  }

  const manifestPath = join(outDir, "manifest.json");
  const manifest = readJSON(manifestPath, { files: {} });
  const hashes = Object.fromEntries(files.map((p) => [basename(p), sha(readFileSync(p))]));
  const changed = Object.entries(hashes).filter(([f, h]) => manifest.files[f] !== h).map(([f]) => f);
  const removed = Object.keys(manifest.files).filter((f) => !hashes[f]);

  if (!changed.length && !removed.length) {
    console.log(`[${code}] sources unchanged — nothing to do`);
    return false;
  }
  console.log(`[${code}] changed: ${changed.join(", ") || "none"}; removed: ${removed.join(", ") || "none"}`);

  const existingCourse = readJSON(join(outDir, "course.json"));
  const docs = docBlocks(files);

  // Phase 1 — revise the course outline.
  console.log(`[${code}] phase 1: outline (${MODEL})`);
  const outlinePrompt = [
    ...docs,
    {
      type: "text",
      text:
        `Language code: "${code}".\n` +
        (existingCourse
          ? `EXISTING COURSE (preserve ids; mark units unchanged/changed/new):\n${JSON.stringify(existingCourse)}\n` +
            `Changed source files this run: ${changed.join(", ") || "(none)"}. Removed: ${removed.join(", ") || "(none)"}.\n`
          : `There is no existing course — design one from scratch.\n`) +
        `Produce the updated course outline. For every unit include "file" as "units/<id>.json", ` +
        `a "status", and a "brief" (2-4 sentences describing exactly what the unit's lessons should ` +
        `teach, citing which source documents it draws on). Include all six CEFR sections, locking ` +
        `the ones the sources cannot support. Set regenerateScript/regenerateCulture true only if ` +
        `the changed sources affect them or they don't exist yet.`,
    },
  ];
  const outline = await ask(SYSTEM, outlinePrompt, outlineSchema, 32000);
  const course = outline.course;

  // Phase 2 — generate each new/changed unit (docs prefix is cache-hit across calls).
  const unitsToBuild = course.sections.flatMap((s) =>
    (s.units || []).filter((u) => u.status !== "unchanged").map((u) => ({ ...u, level: s.level })));

  for (const unit of unitsToBuild) {
    console.log(`[${code}] phase 2: unit ${unit.id} (${unit.status})`);
    const existingUnit = readJSON(join(outDir, unit.file));
    const unitJSON = await ask(SYSTEM, [
      ...docs,
      {
        type: "text",
        text:
          `Course outline:\n${JSON.stringify(course)}\n\n` +
          (existingUnit ? `EXISTING UNIT (revise, preserving lesson ids where possible):\n${JSON.stringify(existingUnit)}\n\n` : "") +
          `Generate the full unit "${unit.id}" ("${unit.title}", level ${unit.level}).\n` +
          `Brief: ${unit.brief}\n` +
          `2-3 lessons; each lesson: 3-6 "teach" items (target script, "roman" romanization, ` +
          `english, optional note), an optional "grammar" and/or "culture" note, and 4-7 exercises ` +
          `following the exercise rules.`,
      },
    ], unitSchema, 40000);
    writeJSON(join(outDir, unit.file), unitJSON);
  }

  // Phase 3 — script inventory and culture articles when needed.
  if (course.script?.nonLatin && (outline.regenerateScript || !existsSync(join(outDir, "script.json")))) {
    console.log(`[${code}] phase 3: script inventory`);
    const scriptJSON = await ask(SYSTEM, [
      ...docs,
      { type: "text", text: `Produce the complete ${course.script.name} inventory for the drawing-practice tab: every character with its romanization, grouped pedagogically.` },
    ], scriptSchema, 24000);
    writeJSON(join(outDir, "script.json"), scriptJSON);
  }

  if (outline.regenerateCulture || !existsSync(join(outDir, "culture.json"))) {
    console.log(`[${code}] phase 3: culture articles`);
    const cultureJSON = await ask(SYSTEM, [
      ...docs,
      { type: "text", text: `Write 3-8 cultural background articles for ${course.name} learners, drawn from the source documents (history, values, traditions, the language community today). 2-4 paragraphs each, separated by blank lines.` },
    ], cultureSchema, 32000);
    writeJSON(join(outDir, "culture.json"), cultureJSON);
  }

  // Strip builder-internal fields before publishing, then persist everything.
  for (const s of course.sections) for (const u of s.units || []) { delete u.status; delete u.brief; }
  writeJSON(join(outDir, "course.json"), course);
  writeJSON(manifestPath, { files: hashes, model: MODEL, updatedAt: new Date().toISOString() });

  // Keep the language index in sync.
  const langsPath = join(DATA, "languages.json");
  const langs = readJSON(langsPath, { languages: [] });
  const entry = { code: course.code, name: course.name, nativeName: course.nativeName };
  const i = langs.languages.findIndex((l) => l.code === course.code);
  if (i >= 0) langs.languages[i] = entry; else langs.languages.push(entry);
  writeJSON(langsPath, langs);

  console.log(`[${code}] done — ${unitsToBuild.length} unit(s) regenerated`);
  return true;
}

// ---------- main ----------

const only = process.argv[2];
const langDirs = existsSync(SOURCES)
  ? readdirSync(SOURCES).filter((d) => statSync(join(SOURCES, d)).isDirectory() && (!only || d === only))
  : [];

if (!langDirs.length) {
  console.log("No language folders found under sources/. Nothing to build.");
  process.exit(0);
}

let any = false;
for (const code of langDirs) {
  try {
    any = (await buildLanguage(code)) || any;
  } catch (err) {
    console.error(`[${code}] build failed:`, err.message);
    process.exitCode = 1;
  }
}
console.log(any ? "Course data updated." : "No course changes.");
