# Course Ethos — what every course teaches, and why

This is the constitution of the product. Every course inherits it, even though
the actual structures taught differ from language to language (not all languages
have conjugation, gender, formality, tone, or case). It defines **how we decide
what is worth teaching** so that a learner becomes a *viable, resilient user* of
the language for travel — someone who can improvise through situations they were
never explicitly taught — rather than a reciter of memorized phrases.

The one sentence that is the whole ethos:

> **Teach the smallest set of recombinable structures and understood-replies
> that lets someone improvise through the ten travel functions in this specific
> language — and ruthlessly cut anything they can route around.**

This is not a phrasebook. Phrasebooks already exist and are better at being
phrasebooks. The product's promise is that **you can produce and understand
sentences you were never explicitly taught**, because you learned a small spine
of grammar plus the words that fuel it.

---

## The invariant — the ten communicative functions

Strip away the language-specific grammar and every course serves the **same ten
communicative jobs**. This is the notional-functional backbone. The grammar
spine of any language is simply *"the minimal set of structures in THIS language
required to perform these ten."*

1. **Greet & be appropriately polite** — and pick the register the language forces.
2. **Request** — "I want / I'd like / can I have ___". The single highest-leverage frame in any language.
3. **Ask for information** — where / when / how much / which / is there ___.
4. **Understand the answer** — numbers, directions, yes/no, "there is/isn't," "it's over there." *(Comprehension, not production.)*
5. **Negate & correct** — no, not that, I don't want.
6. **Repair the conversation** — slower, again, how do you say, what does ___ mean, I don't understand. *(The resilience skill.)*
7. **Transact** — quantities, prices, pay, "the bill."
8. **Self-locate in person** — I / you / this / that / here / there + whatever gender or formality is mandatory.
9. **Place things in time, minimally** — now / later / today / tomorrow + one past, one future.
10. **Handle safety & need** — help, sick, allergic, police, bathroom, lost.

Functions **4** and **6** are the ones cheap courses drop, and the ones that
actually make someone viable rather than a talking phrasebook. Function 4
because a question whose answer you can't understand is useless; function 6
because it is the meta-tool that rescues every situation you weren't taught.

---

## The selection function — how to rank what to teach

Every candidate structure and word is ranked by **communicative leverage**:

```
leverage = (breadth of situations unlocked × frequency of use × cost of not having it)
           ÷ learning difficulty
```

Keep only what a motivated beginner can genuinely retain in ~30 days. Cut
everything else. Then apply these laws:

- **Frames over phrases.** Prefer productive slot-and-filler frames ("I want
  ___", "where is ___?", "how much is ___?"). A frame that recombines 20 ways
  beats 20 memorized lines. Every fixed phrase must earn its place by *not*
  being expressible as a frame.
- **Teach the 80% version, and label it.** One past tense, not four. The two
  cases they can't survive without, not the whole paradigm. The single register
  that keeps them safe. State the simplification honestly so the learner knows
  the edge of what they know.
- **Teach comprehension of the likely reply** to every question you teach.
  Producing "where's the bathroom?" is worthless without parsing "straight,
  then left."
- **Always teach repair.** Slower / again / how do you say / what does ___ mean
  / I don't understand. Non-negotiable — they convert a beginner from fragile to
  resilient.
- **Non-substitutability test.** Cut anything the learner can route around with a
  simpler structure already taught. If "yesterday + present tense" conveys the
  past, teach that and drop the dedicated past tense.
- **Respect what the language forces, and only that.** If getting formality,
  gender, tone, classifiers, or word order wrong causes real social or
  comprehension *failure*, teach the minimum to avoid the failure. If it merely
  sounds imperfect, defer it. (Thai tones: teach. German case beyond survival:
  defer. Japanese `-masu` politeness: teach. Spanish subjunctive: defer.)
- **Weight vocabulary by destination reality.** The destination's food, money,
  transport, and etiquette decide which words fill the frames.

---

## The generation prompt

The selection function above, written so it can drive both human course-authoring
and AI generation. It never assumes conjugation, gender, or formality exist — it
asks what *this* language forces.

> You are scoping the critical spine for a 30-day pre-travel crash course in
> {LANGUAGE} for a traveler visiting {DESTINATION}. The learner does not want
> fluency. They want to *function* and — the real goal — to *improvise through
> situations they were never explicitly taught.* Select the SMALLEST set of
> structures and words that makes them a productive, resilient user, not a
> reciter of phrases.
>
> Cover these ten universal functions: greet/be polite · request · ask for
> information · *understand the likely answer* · negate & correct · *repair the
> conversation* · transact & handle numbers · self-locate (I/you/this/there +
> any forced gender or formality) · minimal time (now/next/before) · safety &
> need. For each function, identify the **minimal structure(s) {LANGUAGE}
> actually requires** to perform it, and the ~10 highest-leverage words that
> fuel it.
>
> Rank every candidate structure and word by communicative LEVERAGE =
> (breadth of situations unlocked × frequency of use × cost of not having it) ÷
> learning difficulty. Keep only what a motivated beginner can retain in 30
> days. Cut everything else.
>
> Apply these laws: frames over phrases; teach the labeled 80% version; teach
> comprehension of the likely reply to every question; always include repair
> moves; cut anything routable around a simpler taught structure
> (non-substitutability); respect only what the language forces (formality,
> gender, tone, classifier, word order) where the error causes real failure;
> weight vocabulary by {DESTINATION} reality.
>
> Output: (a) the ranked grammar spine — the 6–8 structures, most-leveraged
> first; (b) the function→structure map showing how each of the ten jobs gets
> done; (c) the flagged simplifications, each with what it trades away; (d) the
> must-understand replies for every question taught.

---

## Typology reference — the same jobs, different spines

The ten jobs are constant; the grammar needed to do them varies enormously.
This is the lens for scoping any new pack. "Must teach" is the spine; "safely
simplify/skip" is where the ethos does its cutting.

| Language | Script cost | Must teach (the spine) | Safely simplify / defer | Formality reality |
|---|---|---|---|---|
| Spanish | none | present reg. verbs; ser/estar (simplified); "voy a"+inf; gender agreement; question words | preterite vs imperfect → one past; subjunctive; vosotros | tú/usted — usted default |
| French | light | present; "je voudrais"; near future aller+inf; gender+articles; ne…pas | passé composé nuance; subjunctive; liaison | tu/vous — vous default |
| German | none | present; modals; **verb-second order**; question words | full case → nom/acc survival; adjective endings | du/Sie — Sie default |
| Italian | none | present; "vorrei"; gender agreement; question words | passato prossimo aux; subjunctive | tu/Lei — Lei default |
| Portuguese (BR) | light | present; "vou"+inf; gender; question words | preterite/imperfect split; subjunctive; clitics | você default |
| Russian | Cyrillic | present; **~2 cases (nom, acc/prep survival)**; no present copula; negation | full case; verbal aspect; gender of every noun | ty/vy — vy default |
| Croatian | none | present; case survival subset; question words | 7 cases; aspect; pitch accent | ti/Vi — Vi default |
| Greek | Greek alph. | present; gender+articles; question words; negation | full case; aspect; accent | plural-polite default |
| Turkish | none | **agglutinative suffixes** (locative -de, dative -e, acc -i); **SOV**; question particle mi | tense proliferation; evidential -miş; vowel-harmony mastery | sen/siz — siz default |
| Arabic (dialect) | Arabic / romanize | present (ka-/bi- prefix); m/f agreement; negation wrap (ma…sh); question words; want/go/have | MSA case endings (drop); dual; full verb forms | mostly m/f address |
| Hebrew | Hebrew / romanize | gender-marked present; no present copula; want (rotze/rotza); questions | past/future binyanim; construct state | minimal formality |
| Persian | Perso-Arabic / romanize | present; **SOV**; ezāfe linker; want (mikham); politeness verbs | full past; ta'arof registers | strong formality (shomā default) |
| Hindi/Urdu | Devanagari/Nastaliq / romanize | **SOV**; postpositions; gender-marked verbs; chahiye (want/need); honorific pronouns | ergative past; aspect | tu/tum/aap — aap default |
| Swahili | none | **noun classes → the 2–3 that matter**; agreement prefixes; tense infixes (na/li/ta); nataka | full 18-class concord; relatives | respectful greetings > T-V |
| Mandarin | Hanzi + Pinyin | **tones**; **measure words**; SVO; no conjugation; aspect 了; 吗 questions | character production; tone sandhi detail | 你/您 — 您 light-default |
| Japanese | kana+kanji / romaji | **SOV**; particles wa/ga/o/ni/de; **-masu polite verbs**; want (-tai/hoshii); counters | keigo; kanji production; plain register | politeness is grammatical — teach -masu |
| Korean | Hangul (~1 day) | **SOV**; particles; **-yo polite ending**; want (-go sipeo); counters | honorific tiers; irregular verbs | politeness grammatical — teach -yo |
| Thai | Thai / romanize | **tones**; SVO; no conjugation; **classifiers**; polite particles ka/khrap; questions | script mastery; register nuance | polite particles are the formality — teach |
| Vietnamese | Latin (diacritics=tones) | **tones (6)**; SVO; no conjugation; **kinship pronouns**; classifiers; questions | Sino-Vietnamese depth | pronoun-by-relationship replaces T-V |
| Indonesian | none | **easiest**: SVO; no tense/gender/conjugation; reduplication plural; mau (want); apa questions | affixation depth (me-/ber-); literary forms | tolerant; polite address terms |

The pattern: the amount of grammar you *must* teach varies wildly, but the ten
jobs don't. German taxes you on word order and case; Indonesian gives grammar
away for free; Thai and Mandarin tax you on tone instead of morphology;
Japanese/Korean/Thai bake politeness into grammar so you can't skip it. Same
destination-tasks, radically different spines.

---

## Worked example — the Darija (Morocco) spine

Applying the ethos to Moroccan Darija for a traveler spending 1–2 weeks in
Morocco, taught in the romanized (Arabizi) script Moroccans use for texting.

### The ranked grammar spine (most-leveraged first)

1. **Request frame — `bghit ___`** ("I want ___"). The workhorse: food, taxi,
   shopping, hotel. Recombines with every noun taught. Highest leverage in the
   language.
2. **Present tense with the `ka-` prefix** — `kanakul` (I eat), `katakul` (you
   eat), `kayakul` (he eats). Regular, productive, unlocks describing what you
   do/want/need now.
3. **Question fronting** — `fin ___?` (where), `shhal ___?` (how much/many),
   `ash ___?` (what), `wesh ___?` (yes/no opener). Fills functions 3 and 7.
4. **m/f agreement on self and address** — `ana siya7`/`siya7a`, `nta`/`nti`.
   Darija's substitute for a T-V system; getting it wrong is a real social miss.
5. **Negation wrap — `ma…sh`** — `ma bghitsh` (I don't want), `ma fhemtsh` (I
   didn't understand). Function 5, and half of repair.
6. **Simple future/intent — `ghadi ___`** — `ghadi nakhod` (I'll take it).
   One-word future; no tense system needed.
7. **Existence / location — `kayn ___`** ("there is / is there ___?"). Fills
   function 4 comprehension (`kayn`/`ma kaynsh`) and function 3.

### Function → structure map

| Function | Darija realization |
|---|---|
| Greet & be polite | salam, labas, inshallah/l7amdulillah, safi shukran |
| Request | `bghit ___` + noun |
| Ask for information | `fin/shhal/ash/wesh ___?` |
| Understand the answer | numbers, `kayn/ma kaynsh`, direction words (lisar/limn/nishan), yes/no (wakha/lla) |
| Negate & correct | `ma…sh` wrap; lla; ma bghitsh |
| Repair | `3awd` (again), `bshwiya` (slowly), `ma fhemtsh` (I didn't understand), `kifash tqul ___?` |
| Transact | shhal, dirham/rial trap, numbers, `3tini`, compteur (taxi meter) |
| Self-locate | ana/nta/nti, had (this), hadak (that), hna/temma |
| Minimal time | daba (now), men be3d (later), lyum/ghedda; `ghadi` future; `kan` past touch |
| Safety & need | 3afak (please/help), 3yan (sick), l-bulis (police), fin l-toilette, tweddert (I'm lost) |

### Flagged simplifications (what we trade away)

- **Drop MSA case endings entirely.** Dialect doesn't use them; teaching them
  would garble both speech and the TTS. (This is also why the audio source must
  be hand-diacritized to the dialect pronunciation.)
- **One past "touch," not a tense system.** `kan` (was) + a handful of
  high-frequency past forms; otherwise route the past through time words +
  present.
- **No dual, no full verb-form derivation.** Teach the `ka-`/`ghadi` pair and
  the fixed high-frequency verbs; skip the morphology that generates them.
- **Arabizi first; Arabic script optional.** Since production is romanized, the
  implementation leans audio-first. Arabic script is an opt-in helper layer.

### Must-understand replies (comprehension targets)

- To "how much?": a number + `drhem` — and the **dirham/rial trap** (locals may
  quote old rials = 1/20 dirham).
- To "where is ___?": `nishan` (straight), `lisar`/`limn` (left/right), `temma`
  (over there), `hda ___` (next to ___).
- To "do you have ___?": `kayn` / `ma kaynsh` (there is / there isn't).
- To an offer/price haggle: `wakha, khod b ___` (okay, take it for ___).
- Ambient: `inshallah` (god willing — often a soft "maybe/we'll see"),
  `l7amdulillah` (thank god — the default "I'm fine").
