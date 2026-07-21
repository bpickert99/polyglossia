// Composite-sentence generator: extra practice material, chaining two
// already-taught, independently-correct sentences together with an
// already-taught coordinating connector (and/but/or/therefore/however...).
//
// This is safe by construction rather than by luck: Interlingua has no
// subject-verb agreement or case inflection, so joining two correct
// independent clauses with a coordinating conjunction can never introduce a
// grammar error, whatever the two clauses or the connector happen to be.
// No new grammar is invented — only recombination of what's already correct.
//
// Complexity rises naturally as the learner goes deeper: connectors are
// themselves taught vocabulary (and/but/or from the early "Conversation"
// unit, therefore/however from the B2 "Argumentar" unit), and the pool of
// candidate sentences to draw from only grows. Nothing here is hardcoded to
// a CEFR level — a course with richer connector vocabulary automatically
// produces richer composites, which is what makes this reusable for future
// courses too, not just Interlingua.
import { hasWord } from "./exercises.js";

// English glosses that mark an item as a coordinating connector fit for
// stitching two sentences together. (Deliberately excludes "if" — a
// conditional/subordinating connector changes the logical relationship
// between clauses in a way that isn't just safe concatenation.)
const CONNECTOR_GLOSSES = new Set([
  "and", "but", "or", "therefore, so", "however, nevertheless", "however, still",
]);

const tokensOf = (item) => (item.roman || item.target).replace(/[.!?]+$/, "").split(/\s+/);
// A few taught items are intentionally incomplete templates with a
// fill-in-the-blank ("Io me appella ...", "Secundo me, ...") — real
// standalone teach items, but not complete sentences a composite can use.
// Verb-infinitive items ("esser de accordo" = "to agree") are consistently
// glossed "to ___" throughout this course, and a bare infinitive phrase
// isn't a complete sentence either, whatever its token count.
const isSentence = (item) =>
  hasWord(item) && tokensOf(item).length >= 3 &&
  !/\.\.\./.test(item.target) && !/^to\s/i.test(item.english);
const stripStop = (s) => String(s).replace(/[.!?]+\s*$/, "");
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// sentencePool: the two clauses are drawn from here — pass the CURRENT
// session's items (not the whole course), so the pairing has some chance of
// being topically related instead of a random mashup of unrelated units.
// connectorPool: the connector can come from anywhere already taught, since
// it's just a function word and doesn't need topical relevance.
// Returns null until there's both a connector and two distinct sentences to
// work with — i.e. before the first connector unit, this generates nothing.
export function buildCompositeSentence(sentencePool, connectorPool, rng = Math.random) {
  const connectors = connectorPool.filter((i) => CONNECTOR_GLOSSES.has(i.english));
  const sentences = sentencePool.filter(isSentence);
  if (!connectors.length || sentences.length < 2) return null;

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const connector = pick(connectors);
  const a = pick(sentences);
  const rest = sentences.filter((s) => s.key !== a.key);
  if (!rest.length) return null;
  const b = pick(rest);

  const joinWord = connector.roman || connector.target;
  const target = `${stripStop(a.target)} ${joinWord} ${lowerFirst(stripStop(b.target))}.`;
  const roman = `${stripStop(a.roman || a.target)} ${joinWord} ${lowerFirst(stripStop(b.roman || b.target))}`;
  const english = `${stripStop(a.english)}, ${connector.english.split(",")[0].trim()} ${lowerFirst(stripStop(b.english))}.`;

  return {
    target, roman, english,
    level: [a.level, b.level, connector.level].sort().pop(), // hardest of the three
    // Correctly building the composite is evidence for both source
    // sentences, not a new vocabulary key of its own — see resolveKeys()
    // in lesson.js, which understands ex.keys (plural).
    sourceKeys: [a.key, b.key],
  };
}
