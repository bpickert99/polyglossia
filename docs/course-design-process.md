# Course Design Process

How **every** language is added — from anywhere, no exceptions. This is the
governing methodology. The older `course-ethos.md` still holds (it is the
language-agnostic *selection principles*), but it is now **Stage 3** of this
larger process, not the whole story. The failure this fixes: applying one shared
grammar recipe to every language instead of reasoning about each from scratch.

## The one rule: DESIGN → gate → AUTHOR

Deciding *what* to teach and *how* to handle it is a separate stage from writing
content. Its output is a **Blueprint** (`data/<code>/blueprint.md`) — a
human-readable document carrying the per-language reasoning and an explicit
*handling ledger*. **No content is authored until the Blueprint is approved.**
That gate is what forces bespoke thinking and makes every decision auditable.

```
Frame → Language Profile → Feasibility Budget → Functional Syllabus
      → Grammar Scope → Vocabulary Scope → Foundations
      ─────────────── [ Blueprint: review & approve ] ───────────────
      → Authoring → QA gates → ship
```

---

## The stages

**0 · Frame.** Language + *variety* (Darija ≠ MSA; Mexican ≠ Iberian Spanish),
destination(s), traveler profile (default: English-speaking tourist, 1–2 weeks),
script choice (native / romanized / both), and time budget (**default 30 days**
pre-departure).

**1 · Language Profile** — a structured teardown of *this* language for the
traveler's native language (default English). Answer each, because each drives a
downstream decision:
- **Sound system** — which new consonants/vowels/contrasts must the learner
  acquire? (sets the *decoding tax*)
- **Script & romanization** — native-script burden; if romanized, the scheme's
  own quirks (Arabizi numerals, tone diacritics, pinyin tones).
- **Morphology** — how are words built (isolating / agglutinative / fusional /
  root-and-pattern)? Does producing a *basic* sentence require conjugation,
  agreement, or case?
- **"To be" / existence / possession** — the copula basics (or their absence).
- **Formality** — T–V split, honorifics, particles; and the *social cost* of
  getting it wrong.
- **Word order** — default order and how rigid.
- Ends with two explicit lists: **uniquely easy** (free wins to bank loudly) and
  **uniquely hard** (traps to simplify, chunk, or cut).

**2 · Feasibility Budget** — convert the plan into real capacity, *scaled by the
decoding tax from Stage 1*:
- effective lessons ≈ days − taper(3) − foundations load.
- per-lesson split into vocab / grammar / review slots.
- **the decoding tax lowers grammar capacity**: a language whose sounds and
  script are themselves a project (Darija, Thai, Japanese) leaves less budget
  for productive grammar and must lean on fixed chunks; a transparent one
  (Spanish, Indonesian) frees capacity for more. Output: target counts —
  ~X words, ~Y productive grammar concepts — **derived, not guessed**, and
  different per language.

**3 · Functional Syllabus** *(the constant — see `course-ethos.md`)* — the ten
communicative jobs, instantiated for the destination. Decides *what the course
must enable*; language-agnostic.

**4 · Grammar Scope Derivation** *(the bespoke core)* — for each function, ask:
in *this* language, does performing it need productive grammar, or is it a fixed
chunk? Then give every candidate structure a **Handling** disposition (below), a
one-line rationale, and prereq links. Cap to the Stage-2 grammar budget, ordered
by dependency then frequency. **Ordering is by real dependency + frequency, not a
made-up leverage score.**

**5 · Vocabulary Scope** — fill the functions with destination-real words, tiered
0–2 (0 = always taught), sized to the vocab budget, chosen to *recombine* with
the taught grammar and the fixed chunks.

**6 · Foundations** — the unskippable day-1 decoder, derived from Stage 1
(Arabizi numerals; Spanish sound rules; Thai tones; a kana primer if script
chosen). Foundations are *decoding prerequisites*, distinct from grammar.

**7 · Authoring** — draft teach text / examples / quizzes / comprehension from
the approved Blueprint (AI-drafted, human-reviewed). Content may never introduce
anything the Blueprint didn't sanction.

**8 · QA gates** — automated: closed-vocabulary (no drill uses an untaught word);
every function covered; budget respected; grammar prereqs form a DAG;
comprehension replies stay in-scope. Human: a fluent-speaker correctness pass.

---

## Framework A — the Handling Ledger

Every feature the language *has* gets exactly one disposition. This is *how* each
thing is handled, not merely whether it's "in":

| Handling | Meaning | Choose when |
|---|---|---|
| **TEACH · produce** | learn the rule and use it | high frequency × high recombination × affordable |
| **TEACH · recognize** | understand it in replies, don't produce | needed to parse answers, costly to produce |
| **SIMPLIFY** | teach a labeled 80% version | necessary but the full form is too heavy (one past tense, not four) |
| **CHUNK** | bury it inside fixed phrases; never teach the rule | high frequency but rule-cost > one-trip payoff |
| **CUT** | out of scope; route around it | rare, or replaceable by something simpler already taught |

Decide by weighing **frequency × necessity × learnability-cost × error-cost ×
recombination-payoff**. Because you only rule on features a language *actually
has* (from Stage 1), the ledger auto-adapts to tones, classifiers, cases, no-tense,
gendered nouns, whatever — nothing is assumed to exist.

The ledger is deliberately meant to produce *different* answers per language:
- **no present copula** (Darija, Russian) → TEACH-as-a-gift: flag the free win loudly.
- **gender agreement** (Spanish) → SIMPLIFY / recognize — a wrong article never blocks an order; don't spend budget drilling it.
- **tones** (Thai, Mandarin) → FOUNDATIONS, not grammar — a decoding prerequisite.
- **honorific register** (Japanese, Korean) → TEACH the polite baseline; CUT the higher tiers.
- **root-and-pattern verb derivation** (Arabic) → CHUNK — teach fixed high-frequency forms, not the engine that builds them.

---

## Framework B — the Feasibility Budget scales the amount

Same ledger, different totals. Harder-to-decode languages get **fewer** productive
grammar points and **more** chunks; transparent ones get more productive grammar.
The budget is the dial that keeps a 30-day promise honest per language.

---

## Where AI fits

Stages 1, 2, and 4 are structured reasoning handed to a model **with a prompt
that forbids templating and forces the per-language teardown + ledger** (see
`blueprint-prompt.md`). The model drafts the Blueprint; humans review at the
gate. Runtime AI (scenarios, practice) then generates strictly within the
Blueprint's sanctioned scope, so nothing drifts outside what was chosen.

## Artifacts per language

| File | Stage | Purpose |
|---|---|---|
| `data/<code>/blueprint.md` | 1–6 | the reasoning + Handling Ledger + budget — the approval gate |
| `data/<code>/pack.json` | 5 | modules, tiers, TTS, script config |
| `data/<code>/modules/*.json` | 5,7 | vocab items + comprehension |
| `data/<code>/grammar.json` | 4,7 | the rungs the Blueprint sanctioned |
| `data/<code>/foundations.json` | 6 | the day-1 decoder |

A pack is not "done" until its `blueprint.md` exists and its content matches the
Blueprint's ledger.
