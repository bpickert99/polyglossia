// Text-to-speech and IPA.
//
// Two audio sources, preferred in this order:
//   1. PRE-RENDERED NATURAL AUDIO (Piper neural TTS, see scripts/gen-audio.py).
//      Generated offline: eSpeak phonemizes the word with the course's real
//      letter-to-sound rules, then those exact phonemes are fed into a Piper
//      neural voice from a related language — natural-sounding, phonemically
//      correct, and guaranteed to match the displayed IPA (same phonemes drove
//      both). Passed in as `audioUrl` by the caller when a course item has one.
//   2. LIVE eSpeak NG SYNTHESIS (vendored WebAssembly), for anything not yet
//      pre-rendered. Sounds robotic, but has real letter-to-sound rules for
//      100+ languages — including a correct Interlingua voice ("ia") — so it's
//      never just "guessing" with the wrong language's pronunciation.
// If both fail (offline, blocked), we fall back to the browser's own speech
// synthesis so the app still talks, least accurately.
//
// The eSpeak wasm is ~18MB; it is lazy-loaded on first use and cached by the
// browser thereafter.

const WASM_URL = new URL("./vendor/espeak/espeak-ng.wasm", import.meta.url);
const JS_URL = new URL("./vendor/espeak/espeak-ng.js", import.meta.url);

let factory = null;       // the Emscripten module factory
let wasmBinary = null;    // fetched once, reused per invocation
let loadPromise = null;
let engineFailed = false;

const wavCache = new Map();  // key -> Uint8Array (RIFF wav)
const ipaCache = new Map();  // key -> string
let audioCtx = null;

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

async function loadEngine() {
  if (factory) return factory;
  if (engineFailed) return null;
  if (!loadPromise) {
    loadPromise = (async () => {
      const [mod, bin] = await Promise.all([
        import(/* @vite-ignore */ JS_URL.href),
        fetch(WASM_URL).then((r) => r.arrayBuffer()),
      ]);
      wasmBinary = bin;
      factory = mod.default;
      return factory;
    })().catch((e) => {
      console.warn("eSpeak engine unavailable, falling back to system voices:", e);
      engineFailed = true;
      return null;
    });
  }
  return loadPromise;
}

// Kick off the download early (e.g. when a lesson starts) so the first word
// doesn't stall. Safe to call repeatedly.
export function primeTTS() {
  loadEngine();
}

export function engineReady() {
  return !!factory;
}

// Run one eSpeak invocation. Each call spins up a fresh runtime (this is how the
// CLI-style wasm build works), reusing the already-fetched+compiled binary.
async function run(args, capture) {
  const make = await loadEngine();
  if (!make) return null;
  let out = "";
  const instance = await make({
    arguments: args,
    wasmBinary,
    print: capture ? (s) => { out += s + "\n"; } : () => {},
    printErr: () => {},
    locateFile: (p) => (p.endsWith(".wasm") ? WASM_URL.href : p),
  });
  return { instance, out };
}

const voiceOf = (course) => course?.tts?.voice || course?.code || "en";
const wpm = (course) => Math.round((course?.tts?.rate ?? 0.85) * 175);

// IPA transcription for a word/phrase. If the course data already has a
// pre-computed transcription (from scripts/gen-audio.py — the same phonemes
// that drove the natural audio), use it directly, no engine load needed.
// Otherwise derive it live from eSpeak's phonemizer. Cached either way.
export async function ipaFor(text, course, stored) {
  if (stored) return stored;
  if (!text) return "";
  const voice = voiceOf(course);
  const key = voice + "|" + text;
  if (ipaCache.has(key)) return ipaCache.get(key);
  const r = await run(["--ipa=3", "-q", "-v", voice, text], true).catch(() => null);
  const ipa = r ? r.out.replace(/\s+/g, " ").trim() : "";
  ipaCache.set(key, ipa);
  return ipa;
}

async function synthWav(text, course) {
  const voice = voiceOf(course);
  const key = voice + "|" + wpm(course) + "|" + text;
  if (wavCache.has(key)) return wavCache.get(key);
  const r = await run(["-w", "/o.wav", "-v", voice, "-s", String(wpm(course)), text], false)
    .catch(() => null);
  if (!r) return null;
  let bytes = null;
  try { bytes = r.instance.FS.readFile("/o.wav"); } catch { /* no file */ }
  if (bytes) wavCache.set(key, bytes);
  return bytes;
}

function playWav(bytes) {
  // Copy into a fresh ArrayBuffer (decodeAudioData detaches its input).
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const c = ctx();
  return new Promise((resolve) => {
    c.decodeAudioData(buf, (audio) => {
      const src = c.createBufferSource();
      src.buffer = audio;
      src.connect(c.destination);
      src.onended = resolve;
      src.start();
    }, () => resolve());
  });
}

// Play a pre-rendered natural-audio file (Piper output).
function playUrl(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.addEventListener("ended", resolve, { once: true });
    audio.addEventListener("error", () => reject(new Error(`failed to load ${url}`)), { once: true });
    audio.play().catch(reject);
  });
}

// ---------- fallback (browser speech synthesis) ----------

let sysVoices = [];
function refreshSys() {
  sysVoices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
}
if (window.speechSynthesis) {
  refreshSys();
  speechSynthesis.onvoiceschanged = refreshSys;
}
function sysVoice(prefixes) {
  for (const p of prefixes) {
    const v = sysVoices.find((v) => v.lang && v.lang.toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return null;
}
function speakFallback(text, course) {
  if (!window.speechSynthesis || !text) return;
  refreshSys();
  speechSynthesis.cancel();
  const cfg = course?.tts || {};
  let voice = sysVoice([course?.code, ...(cfg.preferredLangs || ["en"])].filter(Boolean));
  let spoken = text;
  if (voice && !voice.lang.toLowerCase().startsWith((course?.code || "").toLowerCase())) {
    for (const [from, to] of cfg.substitutions || []) spoken = spoken.replaceAll(from, to);
  }
  const u = new SpeechSynthesisUtterance(spoken);
  if (voice) u.voice = voice;
  u.rate = cfg.rate ?? 0.85;
  speechSynthesis.speak(u);
}

// ---------- public API ----------

export function ttsAvailable() {
  return true; // pre-rendered audio, eSpeak, or system speech; something will talk.
}

// "natural" = at least some items in this course have pre-rendered Piper
// audio; "accurate" = live eSpeak (correct phonemes, robotic voice);
// "approximate"/"none" = eSpeak failed to load, browser voices as last resort.
export function ttsMode(course) {
  if (course?.tts?.piperVoice) return "natural";
  if (engineFailed) return window.speechSynthesis ? "approximate" : "none";
  return "accurate";
}

// Speak a word or phrase. `audioUrl`, when given, is a pre-rendered natural
// audio file (preferred); falls back to live eSpeak, then system speech.
export async function speak(text, course, audioUrl) {
  if (audioUrl) {
    try { return await playUrl(audioUrl); }
    catch (e) { console.warn("pre-rendered audio failed, falling back:", e); }
  }
  if (!text) return;
  try {
    const make = await loadEngine();
    if (make) {
      const wav = await synthWav(text, course);
      if (wav && wav.length > 44) return await playWav(wav);
    }
  } catch (e) {
    console.warn("eSpeak playback failed, using fallback:", e);
  }
  speakFallback(text, course);
}
