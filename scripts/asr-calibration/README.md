# Darija ASR calibration

**Purpose:** before we build the speaking-practice core, prove that speech-to-text
can actually understand a learner speaking Darija. Speech-eval is the heart of the
redesign — if transcription is unusable, we want to know *now* and adjust (different
ASR vendor, or lead with writing) rather than after building the whole flow.

## What you do (~10 minutes)

1. **Record 12 short clips of yourself** saying the Darija phrases listed in
   `clips.json`. Speak naturally — the way you'd say it to a person, not slow and
   over-enunciated. Any phone voice-recorder works.

   Save each as `clips/<id>.<ext>` — the `<id>` is the `id` field from `clips.json`.
   Supported formats: `wav`, `mp3`, `m4a`, `ogg`, `webm`, `flac`. So:

   ```
   scripts/asr-calibration/clips/salam.m4a
   scripts/asr-calibration/clips/shukran.m4a
   scripts/asr-calibration/clips/3afak.m4a
   ...
   ```

   You don't have to record all 12 — even 6–8 gives a useful signal. Include a few
   of the longer phrases (`bghit-atay`, `fin-lhammam`, `3tini-lma`), since real
   scenario turns are sentences, not single words.

2. **Get an OpenAI API key** at platform.openai.com (this test costs a fraction of
   a cent — Whisper is $0.006/minute and these clips are seconds long).

3. **Run it:**

   ```
   OPENAI_API_KEY=sk-... node scripts/asr-calibration/calibrate.mjs
   ```

   Needs Node 18+ (uses built-in `fetch`/`FormData`). No `npm install` required.

## What it prints

Per clip: what each model transcribed, and a similarity score vs. the expected
Arabic spelling. Then an average per model with a verdict:

- **≥80%** — strong; we can do fairly strict evaluation.
- **55–80%** — usable; we build a *tolerant, meaning-focused* eval ("did you get
  the gist across?"), which is what the travel goal wants anyway.
- **35–55%** — weak; try another vendor (Deepgram, ElevenLabs Scribe) or lead with writing.
- **<35%** — Darija voice-eval isn't viable with this model.

It tests two OpenAI models — `gpt-4o-transcribe` (newer, better) and `whisper-1`
(baseline) — so we can see whether the better model is worth it.

**Send me the numbers** (and glance at the transcriptions — sometimes the text is
clearly recognizable even when the score is low, which still counts as usable).
That result decides how we build the speaking core.
