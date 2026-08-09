# Teaching Principles & Roadmap

What we teach, *how* we teach it, and what's next to build. This is the fourth
governing doc; here's how the four relate:

- **`course-ethos.md`** — the language-agnostic *selection* principles (the ten
  communicative jobs, the leverage idea).
- **`course-design-process.md`** — the per-language method for deciding *what's
  in* a course (the DESIGN→gate→AUTHOR pipeline + Handling Ledger).
- **`learning-loop.md`** — the runtime: *how a single learner moves through a
  single day* (BirdBrain drives, AI teaches; the time-budgeted, confidence-gated day).
- **This doc** — the *pedagogy* that cuts across all three (morpheme-first,
  colour-as-key, receptive/productive balance) plus the **feature roadmap** that
  follows from it.

Nothing here is built yet. It's the agreed direction, written down before we start.

---

## Part I — Principles

### 1. Morpheme-first: teach the decoders, not just the words

The honest ceiling on *taught* words in a month is a few hundred. The number of
words a traveler *encounters* is unbounded. Morphology is the bridge: teach the
~30 high-leverage decoders and a learner can **gist hundreds of words they were
never taught**. Knowing `ka-` = happening-now, `n-/t-/y-` = I/you/he, and
`ma…sh` = not lets someone decode `kanakol / katakol / makayaklsh` from one root.
One decoder, a whole paradigm made gistable.

So morpheme-first is not a separate feature — it is *the* answer to "70 words is
too few." You don't store 300 words; you store 40 roots × a handful of productive
affixes and let composition do the rest. It buys the **receptive half of travel
at a discount.**

**Produce-morphemes vs. recognize-morphemes.** This maps onto the Handling Ledger
and is where per-language honesty lives:

- **Produce** — you attach them yourself to make new forms (`ka-`, `ma…sh`,
  Spanish `-o/-as`, diminutive `-ito`). Worth real drilling.
- **Recognize** — you never produce them, but spotting them lets you gist an
  unheard word. The underused category, and exactly what serves the goal.

**Per-language reality (the Blueprint decides this):**
- **Darija** — the concatenative affixes (`ka-`, `ma…sh`, `dyal-`, person
  prefixes) are morpheme-first *gold*: cheap, regular, huge payoff → **produce**.
  The root-and-pattern engine (k-t-b → kteb/ktab/mektub) was **CUT** for
  production (un-learnable in a month) — but we can still teach the learner to
  **recognize the consonant skeleton** so an unheard `mektub` pings as
  *writing-related*. Net: produce the affixes, recognize the roots, never
  generate the patterns.
- **Spanish** — verb endings are productive morphemes; the *derivational* ones
  (`-ción`, `-dad`, `re-`, `des-`) combine with cognate awareness to unlock
  hundreds of near-free receptive words (`información`, `nacionalidad`).
- **Isolating languages** (Thai, Vietnamese) have little morphology — there the
  principle generalizes to *compound/word-family* awareness instead. "Sub-lexical
  decoding aids" is the real, type-independent principle.

**Two honesty checks.** (a) *Dose it.* Beginners drown in decomposition; the
power-words (`bghit`, `khessni`) are still learned **whole** even though they're
decomposable. Morpheme-first and CHUNK coexist — the Ledger decides which each
item gets. (b) *Segmentation must be linguistically true.* Colouring a
non-productive "morpheme" teaches a false pattern; this raises the stakes on the
fluent-speaker review gate.

### 2. Colour is the decoding key, not decoration

Today the Mango colours annotate one sentence at a time. Morpheme-first turns
colour into a **consistent, app-wide key**: a given *meaning-class* always wears
the same hue — "present tense" one colour, "I/me" another, "negation" another —
everywhere it appears. The learner stops reading colour as pretty and starts
reading it as grammar-at-a-glance. Then, hearing an unheard word, its coloured
segments *are* the scaffolding: they decode `[present][I][eat-ish]` without ever
having met that verb.

Requirement: colour is assigned **by meaning, not per-sentence**, from a small
documented palette of stable semantic roles (tense/aspect · person · negation ·
question · possession · lexical root). It is a system and must be specced as one.

### 3. Balance receptive and productive — the ear is half the trip

The app over-indexes on production (say it yourself). Real travel is ~50%
comprehension — you ask fine, then drown in the reply. We barely train the ear.
Closing this gap (the gist exercise, number/price listening, real audio) is the
single biggest pedagogical hole, and morpheme-first is what makes the receptive
side affordable.

### 4. Disciplined, tiered vocabulary

Realistic month math at ~30 min/day over ~25 effective days: **~6–10 new
*productive* words/day** (higher for transparent Spanish, lower under Darija's
decoding tax) → **~150–250 productive words**. Recognition vocab is far cheaper
(understand, don't retrieve) → layer **~200–300** more. Honest target: **understand
~400–600, produce ~150–250.** Today's ~65-item packs sit at roughly a third of
the productive ceiling with *no* recognition layer — they undershoot the
Feasibility Budget they're supposed to honor.

Three tiers, not just "more words":
- **Productive core (~150–200)** — say-it-yourself, recombinant with the grammar.
- **Recognition layer (~200+)** — understand-only; powers the gist exercise;
  cheap because never quizzed for retrieval.
- **Overflow (open-ended)** — lower-frequency destination-real words that surface
  only for a learner who's crushed the core.

Quality caveat: 180 well-chosen recombinant words + solid grammar beats 500
memorized phrases. Grow toward the budget deliberately, and spend the extra room
on the ear layer we're missing.

### 5. Finish line, then done

Duolingo keeps you on a treadmill forever; this program has a **real end** — the
day you land. Design should honor that: the product's job is to hand you off
ready, not to retain you. The in-country cheat-sheet (below) is the clearest
expression of this — treating "landing day" as a feature, not an afterthought.

### 6. What the evidence says (SLA literature)

A targeted review of the pedagogy literature for this context (short-horizon,
adult, transactional). What it validates, and what it says to add:

- **Formulaic language / chunks.** ~55–80% of native speech is prefabricated;
  chunks beat isolated words for beginner fluency. Gatbonton & Segalowitz's
  **ACCESS** (drill a formulaic utterance → use it in a task) mirrors our
  lesson→scenario pipeline. *Validates CHUNK-first.*
- **Spaced retrieval + feedback.** A 48-study meta-analysis: spaced ≫ massed for
  vocab *and* grammar, lasting years; retrieval-with-feedback has the largest
  effect; retrieval that **generalizes to new contexts** is what sticks.
  *Validates FSRS + AI feedback + recombination/morpheme generalization.*
- **Task-based, input-first.** Even complete beginners acquire from input-based
  tasks, which can beat PPP; role-play is effective for tourism. *Push input
  tasks earlier, not only after the scenario gate.*
- **Vocabulary coverage.** First ~2,000 word families are the priority; survival
  needs a small high-frequency core + formulaic phrases. *Select/tier vocab by
  corpus frequency; keep the productive count disciplined.*
- **Pronunciation — Intelligibility Principle + Functional Load.** Target being
  understood, not a native accent; drill the contrasts with high functional load
  (the ones that break meaning). *Reframe pronunciation as intelligibility;
  prioritize foundations by functional load; add minimal-pair discrimination.*
- **Listening — bottom-up decoding.** Beginners over-rely on top-down guessing;
  what they lack is decoding the **connected speech stream** (word boundaries,
  reductions, fast numbers). *Add bottom-up drills; the morpheme colour-key is a
  decoding aid. Integrate with the top-down gist exercise.*
- **Affect / Willingness-to-Communicate.** Confidence and low anxiety convert
  knowledge into speech. *Design for it: low-stakes rehearsal, forgiving scoring,
  and strategic competence (below).*

---

## Designing good challenges — stewardship principles

Every exercise item is a small bet on the goal. These are the rules for writing
items (authored or AI-generated) that actually serve "understood, and understand
what comes back, in a month":

1. **Test the trip, not the metalanguage.** An item should resemble a thing you
   do in-country — understand a reply, make a request, get unstuck — not name a
   tense. Criterion validity over convenience.
2. **Grade communicative success, forgivingly.** Pass = you'd be understood. An
   error that doesn't block meaning passes (with a light note); one that breaks
   intelligibility fails. Follows the functional-load evidence and protects
   willingness-to-communicate. Never fail a nervous beginner for a cosmetic slip.
3. **Prefer effortful retrieval, but match the role.** Produce-items make you
   generate; recognize-items (receptive vocab, costly forms) may be
   multiple-choice. Aim ~80% success (desirable difficulty), not 100%.
4. **Make distractors diagnostic.** Wrong options should be real confusions —
   minimal pairs, false friends, the wrong morpheme — so a miss reveals the
   misconception and feeds the tutor. Random distractors teach nothing.
5. **Contextualize every item.** A speaker, a place, a goal. Decontextualized
   word↔word pairs are the weakest form.
6. **Stay inside the taught set — and make workarounds reachable.** Never require
   an untaught word to answer. For get-by challenges the intended workaround must
   be buildable from known words (an authoring constraint, checked at QA).
7. **Interleave, space, vary modality and direction.** Mix structures within a
   session; test comprehension (hear→mean) *and* production (mean→say).
8. **Add speed only where it belongs.** Automatize *known* chunks under mild time
   pressure; never rush new material — that raises anxiety and depresses learning.
9. **Every miss teaches.** Reveal the model, name the fix in one line, and (hard
   cases) let the AI diagnose why.
10. **Bias toward the receptive gap.** Comprehension is under-trained and travelers
    fail there — weight listening/gist/decoding above a production-only default.

---

## Part II — Roadmap

Ordered by leverage. "Ties to" points back to the principle each serves. **✓ = built.**

| Feature | What it is | Ties to | Notes / dependencies |
|---|---|---|---|
| **✓ Morpheme inventory + colour key** | A first-class per-pack artifact: each decoder with meaning, colour, produce/recognize role, examples. Colours assigned by meaning, app-wide. | §1, §2 | **Built** — `data/<code>/morphemes.json` + `js/morphemes.js` (stable class→colour key), surfaced in Review › Build and reinforced in the scenario. Still needs a fluent-speaker accuracy pass. |
| **✓ Gist comprehension exercise** | Hear a spoken reply; restate the **gist in English** (not a literal translation); AI scores forgivingly for actionable meaning. | §3 ear, §1 morphemes | **Built** — new `gist` Edge Function mode (v4); upgrades the comprehension slot once vocab is deep enough; **sidesteps ASR**; self-assesses when AI is down. TODO: an audio-only variant (currently shows the reply text too) and a version that tests decoding an *untaught* word from known morphemes. |
| **Vocab expansion to budget + recognition layer** | Grow productive core toward ~150–200; add the understand-only recognition tier. | §4, §3 | Per-language, derived from the Feasibility Budget (not a flat number). Recognition items are cheap in FSRS (recognize-role). |
| **Fast-learner handling** | 1) depth over breadth (harder work with known words); 2) overflow tier unlocks for the proven-fast; 3) later, AI vocab overflow within Blueprint scope, added to the personal deck. | §4 | The day-engine already EXTENDs a *day*; this deepens the *course pool* so a quick learner doesn't stall. Build 1+2 first; 3 needs guardrails. |
| **✓ Get-by challenge (strategic competence)** | A real goal accomplished with known words + repair/circumlocution, not the perfect word; AI-scored for being understood. | §5, evidence | **Built** — `data/<code>/challenges.json` + `getby` exercise (reuses the `evaluate` AI mode; self-assesses offline). The clearest embodiment of the challenge-design principles. |
| **Bottom-up listening drills** | Decode connected speech: word-count/segmentation, catch fast numbers/prices, minimal-pair discrimination (high functional load). | §3 ear, evidence | Best-evidenced ear gap. **Gated on better audio** — minimal pairs on bad Darija TTS would teach false contrasts; ship for Spanish first. |
| **Functional-load pronunciation** | Reframe foundations as intelligibility-not-perfection; prioritize the contrasts that break meaning; minimal-pair practice. | evidence | Content + the discrimination exercise above. |
| **Frequency-driven vocab selection** | Pick and tier vocabulary by corpus frequency in the Feasibility Budget. | §4, evidence | A `course-design-process.md` change, not a runtime feature. |
| **Timed automatization drills** | Respond to a known chunk correctly *and* fast — fluency/speed for real-time use. | evidence | A speed flag on production drills; known material only. |
| **Ear-training family** | Number/price/time listening, speed & accent variation — the stuff most often missed by ear. | §3 | Depends on better audio to be worthwhile. |
| **In-country cheat-sheet** | Offline, printable/lock-screen card of the learner's strongest phrases + survival power-words, generated from what they actually learned. | §5 | The "handoff." Nothing in market frames the *end* of study as a feature. |
| **Trip personalization** | A few onboarding questions (vegetarian? hotel or family? hiking/business/beach?) reweight vocab and scenarios. | ethos | Mostly a prioritization change over existing content; high ROI. |
| **Better audio (Darija first)** | Native/diacritized audio so comprehension training has real input. | §3 | Known weak link (undiacritized Arabic → MSA mispronunciation). Ear-training makes it urgent, not cosmetic. |

### Sequencing — what I'd build first and why

1. **Morpheme inventory + colour key**, then **the gist exercise** on top of it —
   together they establish morpheme-first *and* close the ear gap, and they make
   the vocab number defensible instead of just "more cards."
2. **Vocab-to-budget + recognition layer** — now cheap to justify, because the
   morphemes do the decoding work.
3. **Fast-learner depth/overflow**, then **ear-training family** (gated on audio).
4. **In-country cheat-sheet** — the finish-line payoff, satisfying on its own.
5. **Personalization** and **audio** thread through the rest as enablers.

The through-line: *teach the decoders, train the ear, keep the word count
honest, and treat landing day as the finish line.*
