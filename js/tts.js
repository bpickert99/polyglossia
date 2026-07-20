// Best-effort text-to-speech.
//
// For most under-served languages no real TTS voice exists in any browser.
// Strategy, driven by each course's `tts` config in course.json:
//   1. If a genuine voice for the language exists (e.g. "chr"), use it.
//   2. Otherwise fall back through `preferredLangs` (e.g. Spanish/Italian read
//      phonemic romanizations far better than English voices do) and apply the
//      course's `substitutions` so unpronounceable sequences are approximated.
// The UI labels this clearly as approximate audio.

let voices = [];
function refreshVoices() {
  voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
}
if (window.speechSynthesis) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}

function findVoice(langPrefixes) {
  for (const prefix of langPrefixes) {
    const v = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(prefix.toLowerCase()));
    if (v) return v;
  }
  return null;
}

export function ttsAvailable() {
  return !!window.speechSynthesis;
}

// Returns "native" | "approximate" | "none" for display purposes.
export function ttsMode(course) {
  if (!ttsAvailable()) return "none";
  refreshVoices();
  const cfg = course?.tts || {};
  if (findVoice([course.code])) return "native";
  return findVoice(cfg.preferredLangs || []) || voices.length ? "approximate" : "none";
}

export function speak(text, course) {
  if (!ttsAvailable() || !text) return;
  refreshVoices();
  speechSynthesis.cancel();

  const cfg = course?.tts || {};
  let voice = findVoice([course?.code].filter(Boolean));
  let spoken = text;

  if (!voice) {
    voice = findVoice(cfg.preferredLangs || ["es", "it", "en"]);
    for (const [from, to] of cfg.substitutions || []) {
      spoken = spoken.replaceAll(from, to);
    }
  }

  const u = new SpeechSynthesisUtterance(spoken);
  if (voice) u.voice = voice;
  u.rate = cfg.rate ?? 0.85;
  u.pitch = 1;
  speechSynthesis.speak(u);
}
