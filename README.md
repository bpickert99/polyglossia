# 🌐 Polyglossia

A free, open, adaptive language-learning platform for languages the big apps overlook.
Duolingo-style, but built around a real adaptive engine instead of fixed lesson scripts.

**Live site:** https://bpickert99.github.io/polyglossia/

## What makes it different

Lessons are **not pre-written**. Each time you start a skill on the path, the app assembles
a fresh lesson on the spot from the learner model:

```
        your answers ─┐
                       ▼
        ┌── Birdbrain ──────────────┐   ┌── FSRS ─────────────┐
        │ ability θ (per language)  │   │ per-word memory      │
        │ difficulty δ (per word)   │   │ half-life scheduling │
        │ P(correct)=σ(θ−δ) → aim   │   │ → what's due to      │
        │ every exercise at ~80%    │   │   review, when       │
        └───────────┬───────────────┘   └──────────┬──────────┘
                    └──────────► lesson builder ◄───┘
                                     │
                    a few NEW words (throttled when you're
                    struggling or behind) + interleaved REVIEW,
                    exercise types aimed by predicted success
```

- **Adaptive difficulty — Birdbrain-style.** Modeled on Duolingo's
  [Birdbrain](https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/)
  and its published [half-life regression](https://research.duolingo.com/papers/settles.acl16.pdf)
  work: the app estimates your ability and each word's difficulty, predicts your chance of
  getting an item right, and keeps exercises in the "zone of proximal development" — around an
  **80% success rate**. Struggle with a word and it gives you gentle recognition; master it and
  you get harder production and trickier distractors.
- **Spaced repetition (FSRS).** Every answer reschedules that word for review right before
  you'd forget it (FSRS-4.5, the modern Anki scheduler).
- **Dynamic lessons.** Start the same skill twice, get two different lessons. New material is
  throttled when your review backlog is high or your ability is shaky.
- **Natural pronunciation + IPA.** Two-tier audio: **Piper** (a small neural TTS engine) renders
  natural-sounding audio offline for every course word, driven by **eSpeak NG**'s real
  letter-to-sound rules for that language — so the natural voice speaks the *actual* target
  sounds, not a guess. Anything not yet pre-rendered (or if Piper generation hasn't run for a
  language) falls back to live eSpeak synthesis in the browser — robotic but still phonemically
  correct, never silently wrong. Every word shows its IPA transcription, generated from the same
  phonemes that drove the audio, so what you see always matches what you hear.
  See `scripts/gen-audio.py` for how audio is generated (run via the **Generate course audio
  (Piper)** GitHub Action — it needs open network access to download voice models, so it runs in
  CI, not locally).
- **Cultural notes** and a **script-drawing tab** (tracing + self-scoring) for non-Latin writing.
- **Optional accounts.** Progress lives in your browser by default; sign in from the Stats tab
  (email code, or Google once configured) to back it up and sync across devices via Supabase.

## Repo layout

```
index.html            app shell
js/                   ES modules (no build step)
  birdbrain.js        adaptive ability/difficulty model
  srs.js              FSRS spaced-repetition scheduler
  lesson-builder.js   assembles a fresh lesson from the learner model
  exercises.js        exercise generation (difficulty aimed by Birdbrain)
  practice.js         review sessions
  lesson.js           lesson session runner (UI)
  tts.js              audio playback: pre-rendered Piper > live eSpeak > Web Speech
  storage.js          progress + learner model (localStorage)
  sync.js             optional cloud sync (Supabase)
  stats.js, main.js, culture.js, script-practice.js, data.js, config.js
  vendor/espeak/      eSpeak NG WebAssembly (lazy-loaded, cached; live-synthesis fallback)
scripts/
  gen-audio.py         phonemizes with eSpeak, synthesizes with Piper (run via CI, not locally)
data/<lang>/          course.json + units/*.json (item pools + ipa/audio once generated) +
                       audio/*.wav (pre-rendered) + audio-manifest.json + culture.json
.github/workflows/
  deploy.yml           GitHub Pages
  gen-audio.yml        Piper audio generation (workflow_dispatch; needs open network, runs in CI)
```

## Adding or extending a course

Courses are authored with Claude and committed under `data/<code>/`. A unit file is a pool of
items (`teach` entries: target word, romanization, English, an optional note, grammar/culture
notes); the app generates the actual lessons and exercises from that pool at runtime. Add a
language by adding `data/<code>/` and an entry in `data/languages.json`.

## Local development

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

No build step — everything is plain ES modules and static JSON. The eSpeak wasm (~18 MB) is
lazy-loaded on first audio/IPA use and cached by the browser thereafter.

## Accounts & sync (optional)

`js/config.js` holds the Supabase URL + publishable key (safe to ship — row-level security
means each signed-in user can only read/write their own progress row). Email-code sign-in works
out of the box. To enable Google, add a Google OAuth client in the Supabase dashboard
(*Authentication → Providers → Google*); the "Continue with Google" button then activates.

## Credits & accuracy

Pronunciation and IPA come from [eSpeak NG](https://github.com/espeak-ng/espeak-ng) (GPLv3).
Course content is authored with Claude; as with any learning material, prefer resources from
native speakers and language communities where they exist.
