# Blueprint — Moroccan Arabic (Darija) `ary`

Worked through `docs/course-design-process.md`. This is the reasoning that
decides what the pack teaches and *how* each feature is handled. Content
(`grammar.json`, `modules/*`, `foundations.json`) must match the ledger below.
The point of this document is to show Darija was reasoned about **from scratch**
— not handed Spanish's grammar list.

---

## Stage 0 · Frame

- **Variety:** Moroccan Darija (`ary`), *not* MSA. This matters more here than for
  almost any other language: the written/formal language (MSA) and the spoken
  street language diverge so far that teaching MSA grammar would actively
  mislead a traveler. We teach what people say, not what's written on signs.
- **Destination:** Morocco (Marrakech / Fez / coast / medinas).
- **Traveler:** English-speaking tourist, 1–2 weeks in country, 30 days to prep.
- **Script:** Arabizi (Latin chat alphabet) is the **default and the verbal
  track**; Arabic script is an optional *helper* layer, not required to speak.
  This is the honest choice — Darija is overwhelmingly written in Arabizi by
  Moroccans themselves in texts, and there is no universally standard Darija
  orthography in Arabic script.

## Stage 1 · Language Profile (Darija for an English speaker)

- **Sound system — HIGH decoding tax.** New consonants with no English anchor:
  ʕ (3, pharyngeal), ħ (7, hard H), q (9, deep-throat K), x (kh), ɣ (gh). Plus
  heavy consonant clusters with *no vowels* (Darija drops short vowels MSA
  keeps): *nta*, *shhal*, *mzyan*, *bghit*, *l-ħmam*. English speakers reach for
  a vowel that isn't there. This is the single defining difficulty of the
  language and it dominates the budget.
- **Script & romanization.** Arabizi uses **numerals as letters** (3=ʕ, 7=ħ,
  9=q, sometimes 5=x, 8=gh). This is non-negotiable decoding knowledge and is
  *itself* a foundations item — you cannot read the course materials without it.
- **Morphology — root-and-pattern (non-concatenative).** Words are built by
  slotting a 3-consonant root into vowel patterns (k-t-b → kteb, kanikteb,
  ktab, mektub). This is beautiful and completely alien to English, and it is
  a **trap**: you cannot productively generate it in a month, and trying wastes
  the whole budget. Verbs also carry person as a *prefix* (kan-/kat-/kay-), so
  the pronoun is usually dropped.
- **"To be" / existence / possession — a gift.** There is **no present-tense
  copula**. "I (am) tired" = *ana 3eyyan*. Zero words to learn for the single
  most common sentence shape in travel. Existence is one word: *kayn* (there
  is). Possession is prepositional: *3andi* (I have, lit. "at-me"), *dyali*
  (mine, lit. "of-me").
- **Formality.** Much flatter than French/Spanish. No grammaticalized T–V
  tier a tourist must navigate; politeness rides on fixed phrases (*3afak*,
  *smeh liya*, *baraka Allah fik*), not on verb morphology. Social cost of a
  bare request is low and forgiven for a foreigner.
- **Word order.** Verb-initial and flexible; the dropped-subject verb already
  carries person, so a "sentence" is often just Verb + Object. Adjectives
  follow the noun (*atay skhun* = tea hot).

**Uniquely easy (bank loudly):** no present copula; person baked into the verb
prefix (so *one* prefix pair = "I/you" for every verb); future is a single
invariant word *ghadi*; negation is one fixed wrapper *ma…sh*; possession/have
are single high-frequency words.

**Uniquely hard (simplify / chunk / cut):** the five throat sounds + Arabizi
numerals; root-and-pattern derivation; broken (irregular) plurals; full verb
conjugation across persons; gender agreement on adjectives.

## Stage 2 · Feasibility Budget

The HIGH decoding tax is the governing fact. Days 1–3 must spend real budget on
sounds + Arabizi before a single sentence is trustworthy, and every new word
costs more to encode than a Spanish word does (the learner is also learning to
*read* it). Therefore Darija runs **lean on productive grammar and heavy on
fixed chunks** — the opposite dial-setting from Spanish.

- Effective teaching days ≈ 30 − 3 (taper) − ~2 (foundations load) ≈ 25.
- **Vocabulary target:** ~110–130 words/phrases (lower than a transparent
  language would allow, because each carries an encoding tax).
- **Productive grammar target:** **4 concepts, not 7.** A month of Darija cannot
  honestly deliver seven productive paradigms on top of the sound/script load.
  The rest of communicative power comes from **power-word chunks**, which is how
  Darija is actually spoken by beginners and even by many fluent second-language
  users.

The old `grammar.json` had 7 rungs with invented "leverage" scores (95/88/…).
This Blueprint replaces that with 4 produce-rungs + explicit chunk/recognize
handling, ordered by real dependency and frequency.

## Stage 3 · Functional Syllabus

The ten communicative jobs (see `course-ethos.md`) instantiated for Morocco:
greet/be-polite, ask-for, find-the-way, handle-money/bargain, order-food,
get-unstuck (repair), handle-emergency/health, arrange-lodging, basic
small-talk, understand-the-reply. Language-agnostic; unchanged.

## Stage 4 · Grammar Scope — the Handling Ledger

The core of the bespoke work. Every feature Darija **actually has** gets exactly
one disposition. Weighed on frequency × necessity × learnability-cost ×
error-cost × recombination-payoff.

| # | Feature | Handling | Why (bespoke) |
|---|---|---|---|
| 1 | **No present copula** ("I am tired" = ana 3eyyan) | **TEACH · gift** | Free win, highest-frequency shape in travel; flag it loudly as *the* thing that makes Darija easy. Near-zero cost. |
| 2 | **ka- present, I & you** (kan-/kat-) | **TEACH · produce** | One prefix pair unlocks every verb in first person. High recombination, affordable. This is the one real conjugation worth producing. |
| 3 | **Negation wrapper** ma … sh | **TEACH · produce** | Fixed, invariant, and *ma kanfhemsh* ("I don't understand") is the single most useful survival sentence. Cheap, enormous payoff. |
| 4 | **Questions** — front a Q-word / *wash* for yes-no | **TEACH · produce** | Q-words are lexical (learn a list), and *wash*-fronting is one rule. High necessity; low cost. |
| 5 | **Future** with invariant *ghadi* | **TEACH · produce** | One indeclinable word buys the whole future. Trivial cost, real payoff. (4th and last produce-rung.) |
| 6 | **Power-words** bghit / khessni / 3andi / kayn | **CHUNK (primary)** | These are morphologically frozen 1st-person forms. Teach them as *words*, never as conjugation. They carry more of the course's communicative load than any grammar rule — deliberately the backbone, not a footnote. |
| 7 | **Possession** *dyal* + *had/hadak* | **CHUNK** | Teach *dyali/dyalek*, *had*, *hadak* as fixed items, not a possessive paradigm. High frequency, but the full clitic system isn't worth a rung. |
| 8 | **he/she/it present** kay-/kat- | **TEACH · recognize** | You *hear* it constantly in replies (*kayn*, *kayji*) but rarely need to produce it. Recognize-only saves budget. |
| 9 | **Adjective-after-noun + adjective gender agreement** | **SIMPLIFY** | Teach word order as a one-line habit; label agreement as "add -a for feminine, often" and move on. A wrong ending never blocks an order. Don't spend a rung drilling it. |
| 10 | **Root-and-pattern verb derivation** | **CUT** | Cannot be produced generatively in a month; teach the fixed forms you need (rungs 2/6) and route around the engine that builds them. |
| 11 | **Broken / irregular plurals** | **CUT** | Learn the handful of needed plurals as vocabulary items; don't teach the patterns. |
| 12 | **Full person paradigm** (we/they/plural-you) | **CUT** | Out of scope for a solo tourist; *ghadi + I/you* covers the need. |

**Resulting produce-rungs (4), ordered by dependency then frequency:**
`present-1` (ka- I/you) → `negation-1` (needs present) → `questions-1`
(independent, very high frequency) → `future-1` (needs present). Plus one
**recognize** rung `present-2` (kay-/kat-). Everything else is CHUNK/SIMPLIFY/CUT
and lives in modules as vocabulary, **not** as grammar rungs.

### Change from what's currently shipped
- **Drop `order-1` and `possession-1` as produce-rungs.** Word order → a
  SIMPLIFY note attached to `present-1`; possession → CHUNK items in the
  greetings/shopping modules. This takes produce-rungs 7 → 4, matching the
  Stage-2 budget.
- **Reframe the four power-words explicitly as the CHUNK backbone**, taught in
  modules (they already are), and stop implying they're "grammar we simplified."
- Keep `present-1`, `negation-1`, `questions-1`, `future-1`, `present-2`.
- Delete the numeric `leverage` field — ordering is now dependency+frequency.

## Stage 5 · Vocabulary Scope

Fill the ten functions with Morocco-real words (dirham/rial money reality, mint
tea, taxi/grand-taxi, medina, tajine), tiered 0–2, sized to ~110–130 and chosen
to recombine with the 4 rungs and the power-word chunks. Current modules already
follow this; the power-words are correctly carried as chunks here.

## Stage 6 · Foundations (day-1 decoder — unskippable)

Derived from Stage 1's HIGH decoding tax:
1. **Arabizi numerals** 3 / 7 / 9 (and 5, gh) — you can't read the course
   without these. Unskippable.
2. **The five throat sounds** ʕ ħ q x ɣ — hear-and-approximate, not master.
3. **Missing short vowels** — why *shhal* / *bghit* have no vowel to grab.

These are decoding prerequisites, distinct from grammar. (Current
`foundations.json` covers Arabizi; the sound + missing-vowel notes should be
confirmed present.)

## Stage 7–8 · Authoring & QA

Author only from this ledger. QA gates: closed-vocabulary (no drill uses an
untaught word or an uncut structure); all ten functions covered; ≤4 produce
grammar concepts; prereqs form a DAG (present → negation/future; questions
standalone); comprehension replies stay in taught scope; **human fluent-speaker
pass** on the throat-sound audio and the Arabizi spellings before ship.

---

## Ledger summary (the auditable decision)

- **TEACH · produce (4):** no-copula gift · ka- present I/you · ma…sh negation ·
  questions · ghadi future. *(no-copula rides in foundations/greetings, not a
  standalone rung, but is a taught concept.)*
- **TEACH · recognize (1):** kay-/kat- he/she/it.
- **CHUNK (backbone):** bghit / khessni / 3andi / kayn · dyal / had / hadak.
- **SIMPLIFY:** adjective-after-noun word order · gender agreement.
- **CUT:** root-and-pattern derivation · broken plurals · full person paradigm.

If Spanish's blueprint and this one had come out looking the same, the process
would have failed. They don't: Spanish spends budget on gender and a fuller verb
system because it's cheap to decode; Darija spends it on *sounds and script* and
deliberately leans on frozen chunks, because that is what one honest month of
Darija can buy.
