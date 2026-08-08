# The Learning Loop — runtime engine spec

How a *single learner* moves through a course on a *single day*. This is the
runtime counterpart to `course-design-process.md` (which decides what's *in* a
course). It governs pacing, adaptivity, and the division of labor between the
deterministic scheduler and the AI tutor.

## The one principle: BirdBrain drives, AI teaches

The two systems have strict, non-overlapping jobs. Violating this is the main
failure mode (a model is a bad, expensive scheduler; an algorithm can't
explain *why* you're wrong).

| | **BirdBrain + FSRS** — the map & odometer | **AI** — the tutor in the passenger seat |
|---|---|---|
| Owns | the *numbers*: what's due, how confident, when mastered, whether it's safe to advance, what difficulty to aim at | *language & understanding*: fresh examples, why an answer was wrong, diagnosing the misconception, the in-the-wild scenario |
| Decides | **whether and what** to teach next | **how to teach it** and **why you missed it** |
| Properties | deterministic, offline, free, source of truth for confidence & pacing | non-deterministic, gated, best-effort, acts *on* the state it's handed |
| Never | explains, generates language, judges nuance | sets due dates, computes "mastered", gates advancement, invents untaught vocab |

The handoff in one sentence: **BirdBrain says "weak on `ma…sh`, solid on
`bghit`, θ=0.3, these 8 items are due" → AI generates material tuned to exactly
that → the grades flow back into FSRS to update confidence.**

## The 30-minute confidence-gated day

The day is **time-budgeted (default ~30 min) and confidence-gated**, not a fixed
pile of counts. Time is the ceiling; demonstrated confidence is the throttle.

1. **Warm-up** — FSRS surfaces the most-fading due items.
2. **Core teach** — the planner's base new words + the next grammar rung.
3. **Practice** — exercises aimed by BirdBrain at ~80% success.
4. **The gate** (`js/day-engine.js`, pure, BirdBrain-only) — when the planned
   steps run out, look at *time spent* and *confidence in today's material* and pick:
   - **EXTEND** — confident, time left, and there's more to teach → pull the next
     rung / next word batch and keep going. This is how confidence *lengthens*
     the day.
   - **CONSOLIDATE** — not yet solid (or confident but out of new material, with
     time left) → reinforce today's weakest items, no new material. Bounded so a
     hard day still ends.
   - **WRAP** — out of time (soft budget, hard ceiling) or nothing left to do.
5. **Capstone** — if the AI scenario is unlocked and time remains, run it.

"Confident" is a concrete FSRS/BirdBrain reading, not a vibe: the average
within-session `progress()` over today's new words + the day's rungs, compared
against thresholds in `day-engine.js` (`confident` / `shaky`).

## Confidence between sessions

Per-item confidence already persists locally (`storage.js`: FSRS `S/D/due` +
BirdBrain `bd` per item, θ per language; grammar rungs ride the same machinery
keyed `g:<id>`). The runtime reads it fresh each turn, so extension segments
mid-session see reps added earlier in the same session.

Planned next (not yet built): a distilled **learner snapshot** synced per user
and passed to the AI so it targets tomorrow's weak spots — and AI drills that
*declare the concept they target* so their grades feed the same ledger the
scheduler runs on, instead of being walled off (`keys:[]`) as they are today.

## Keeping AI fast, cheap, honest

BirdBrain handles the routine (aim difficulty, pick distractors, decide
advancement) with zero AI calls. AI is spent only on the hard cases —
explaining a wrong answer, diagnosing a *leech* (3 lapses in a row; the
algorithm flags them, the AI re-teaches), authoring extension drills, the
scenario. Everything degrades to deterministic static content when AI is
unavailable: **AI is never load-bearing.**

## Build status

- [x] `day-engine.js` — time budget + extend/consolidate/wrap gate (BirdBrain-only)
- [x] session-time instrumentation + dynamic segment appending in `lesson.js`
- [x] wire BirdBrain `newItemBudget` into the daily planner (throttles today's
      new dose down for a shaky/backlogged learner; the upside is EXTEND's job)
- [x] learner-snapshot + graded, target-declaring AI drills — the AI receives
      the learner's weak spots and each drill declares the word it trains, so its
      grade feeds FSRS (client-side live; activates fully once the Edge Function
      redeploys — until then drills stay safely ungraded as before)
- [ ] cross-device snapshot sync (durability layer) — snapshot is built locally today
- [ ] AI error-explanations + leech remediation
