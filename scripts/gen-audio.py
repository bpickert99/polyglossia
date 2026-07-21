#!/usr/bin/env python3
"""Generate natural-sounding word/phrase audio for a course, using Piper.

Why this exists: the browser ships eSpeak NG (formant synthesis) for instant,
zero-cost, always-correct-phonemes audio — but it sounds robotic. This script
pre-renders much more natural audio using Piper (a small neural TTS engine)
for every vocabulary item in a course, so the SITE just plays a static file
at runtime instead of synthesizing live.

The key trick, and the reason this isn't just "read the word with a Spanish
voice": we phonemize with the COURSE'S OWN language rules (e.g. eSpeak's
dedicated "ia" Interlingua phonemizer), then feed those exact phonemes
directly into a Piper acoustic model trained on a *different*, related
language (e.g. Spanish). This bypasses Piper's own text-reading rules (which
would mispronounce e.g. Interlingua's "j" as Spanish "j" instead of /ʒ/) while
still getting Piper's natural neural voice. Same phonemes that get displayed
as IPA in the app are the ones actually spoken — audio and IPA can't drift
apart.

Requires network access (downloads a Piper voice from Hugging Face on first
run) — run this from GitHub Actions, not a network-restricted sandbox.

Usage:
    python3 scripts/gen-audio.py ia
    python3 scripts/gen-audio.py ia --voice es_ES-davefx-medium
"""
import argparse
import json
import re
import sys
import wave
from pathlib import Path

from piper.config import SynthesisConfig
from piper.download_voices import download_voice
from piper.phonemize_espeak import EspeakPhonemizer
from piper.voice import PiperVoice

ROOT = Path(__file__).resolve().parent.parent
VOICE_CACHE = ROOT / ".piper-voices"

# Fallback Piper acoustic voice per eSpeak phonemizer language, when the
# course doesn't specify one explicitly. Chosen for the closest phoneme
# inventory overlap with the course language.
DEFAULT_PIPER_VOICE = {
    "ia": "es_ES-davefx-medium",  # Interlingua: pan-Romance, Spanish overlaps well
    "lb": "de_DE-thorsten-medium",  # Luxembourgish: Moselle Franconian, closest is German
    "ar": "ar_JO-kareem-medium",  # Darija (and other Arabic-script courses): real Arabic voice
}


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "x"


def load_course(lang):
    course_dir = ROOT / "data" / lang
    course = json.loads((course_dir / "course.json").read_text())
    return course_dir, course


def collect_units(course_dir, course):
    files = []
    for section in course["sections"]:
        for unit in section.get("units", []):
            path = course_dir / unit["file"]
            if path.exists():
                files.append(path)
    return files


def phonemes_to_str(phoneme_lists):
    """Flatten EspeakPhonemizer's [[phoneme,...]] sentence grouping to one
    space-joined phoneme string per item, trimmed of trailing punctuation."""
    flat = []
    for sentence in phoneme_lists:
        flat.extend(sentence)
    s = "".join(flat).strip()
    return re.sub(r"[.!?,;:]+$", "", s)


def synthesize(voice_obj, phonemes, syn_config):
    ids = voice_obj.phonemes_to_ids(list(phonemes))
    audio = voice_obj.phoneme_ids_to_audio(ids, syn_config)
    return audio


def write_wav(path, audio_f32, sample_rate):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm16 = (audio_f32 * 32767).clip(-32768, 32767).astype("int16")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm16.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lang", help="course language code, e.g. ia")
    ap.add_argument("--voice", help="Piper voice id, e.g. es_ES-davefx-medium")
    ap.add_argument("--speed", type=float, default=None,
                     help="length_scale multiplier override; <1 = faster, >1 = slower. "
                          "Persists to course.json['tts']['speed'] once set, so future runs keep it "
                          "without needing to pass it again.")
    args = ap.parse_args()

    course_dir, course = load_course(args.lang)
    espeak_voice = course.get("tts", {}).get("voice", args.lang)
    piper_voice_name = args.voice or course.get("tts", {}).get("piperVoice") or DEFAULT_PIPER_VOICE.get(espeak_voice)
    if not piper_voice_name:
        sys.exit(f"No Piper voice configured for '{args.lang}' (espeak voice '{espeak_voice}'). Pass --voice.")
    speed = args.speed if args.speed is not None else course.get("tts", {}).get("speed", 1.0)

    print(f"Language: {args.lang} | eSpeak phonemizer: {espeak_voice} | Piper voice: {piper_voice_name} | Speed: {speed}")

    # "native" courses (currently: Arabic-script languages like Darija) skip
    # the eSpeak phoneme-bridge trick entirely and let the Piper voice
    # phonemize with its own bundled frontend instead — for Arabic that
    # frontend includes a neural tashkeel (diacritization) pass ahead of
    # espeak-ng's phonemizer, which does much better on undiacritized script
    # than routing through a generic EspeakPhonemizer call would. The bridge
    # trick exists specifically for languages with NO matching Piper voice
    # (Interlingua, Luxembourgish); Arabic has a real one, so use it directly.
    native = course.get("tts", {}).get("phonemizer") == "native"

    VOICE_CACHE.mkdir(parents=True, exist_ok=True)
    model_path = VOICE_CACHE / f"{piper_voice_name}.onnx"
    if not model_path.exists():
        print(f"Downloading Piper voice {piper_voice_name} ...")
        download_voice(piper_voice_name, VOICE_CACHE)
    voice_obj = PiperVoice.load(model_path)
    phonemizer = None if native else EspeakPhonemizer()
    syn_config = SynthesisConfig(length_scale=1.0 / speed if speed else None)

    audio_dir = course_dir / "audio"
    manifest_path = course_dir / "audio-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    changed_units = 0
    total_words = 0
    generated = 0

    for unit_path in collect_units(course_dir, course):
        unit = json.loads(unit_path.read_text())
        unit_dirty = False
        for lesson in unit.get("lessons", []):
            for item in lesson.get("teach", []):
                target = item.get("target")
                if not target:
                    continue
                total_words += 1
                # "arabic" is an authoring-only field (real Arabic-script
                # spelling) present on Arabic-script courses' items — it's
                # what actually gets spoken, while target/roman (the Arabizi
                # transliteration) stays what the app displays and never
                # reaches the phonemizer.
                spoken_text = item.get("arabic") or item.get("roman") or target
                # Speed is part of the cache key: changing it must invalidate
                # every cached file, or a speed change would silently no-op.
                key = f"{args.lang}:{speed}:{spoken_text}"

                phoneme_lists = (
                    voice_obj.phonemize(spoken_text) if native
                    else phonemizer.phonemize(espeak_voice, spoken_text)
                )
                phoneme_str = phonemes_to_str(phoneme_lists)
                item["ipa"] = phoneme_str
                # Filenames are always based on the displayed (Latin) form,
                # never the Arabic-script spoken_text, so they stay readable
                # ASCII on disk regardless of phonemizer mode.
                filename = f"{slug(item.get('roman') or target)}.wav"
                rel_audio = f"audio/{filename}"
                item["audio"] = rel_audio

                cached = manifest.get(key)
                if cached == phoneme_str and (audio_dir / filename).exists():
                    continue  # unchanged word, unchanged phonemes, file already there

                audio = synthesize(voice_obj, phoneme_lists[0] if phoneme_lists else [], syn_config)
                write_wav(audio_dir / filename, audio, voice_obj.config.sample_rate)
                manifest[key] = phoneme_str
                generated += 1
                unit_dirty = True
        if unit_dirty:
            unit_path.write_text(json.dumps(unit, indent=2, ensure_ascii=False) + "\n")
            changed_units += 1

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n")

    # Record which Piper voice + speed rendered this course's audio, so future
    # runs (even without explicit flags) reuse the same settings.
    course.setdefault("tts", {})["piperVoice"] = piper_voice_name
    course["tts"]["speed"] = speed
    (course_dir / "course.json").write_text(json.dumps(course, indent=2, ensure_ascii=False) + "\n")

    print(f"Done. {total_words} words seen, {generated} audio files (re)generated, {changed_units} unit files updated.")


if __name__ == "__main__":
    main()
