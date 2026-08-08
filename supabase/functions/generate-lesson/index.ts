// TripTalk lesson-construction proxy. Three modes, all constrained to the
// learner's taught word-set:
//   • scenario  — a colour-coded in-the-wild dialogue (gated by critical mass)
//   • practice  — fresh recombinant production drills for the daily lesson
//   • evaluate  — judge a free typed/spoken attempt against known grammar
//
// The static spine owns the curriculum; this only fills the generative long-tail.
// Keys live here, never in the static site; verify_jwt gates access to a
// signed-in user; a per-user daily cap bounds cost and doubles as the paywall.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "claude-haiku-4-5";
const DAILY_CAP = 60; // generations per user per day — cost bound + paywall lever

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const chunkSchema = {
  type: "array",
  items: {
    type: "object", additionalProperties: false,
    properties: {
      roman: { type: "string" }, en: { type: "string" }, group: { type: "integer" },
      morphemes: {
        type: "array",
        items: { type: "object", additionalProperties: false, properties: { seg: { type: "string" }, role: { type: "string" } }, required: ["seg", "role"] },
      },
    },
    required: ["roman", "en", "group", "morphemes"],
  },
};

const SCENARIO_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    setting: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { speaker: { type: "string", enum: ["them", "you"] }, roman: { type: "string" }, english: { type: "string" }, chunks: chunkSchema },
        required: ["speaker", "roman", "english", "chunks"],
      },
    },
    task: { type: "string" },
  },
  required: ["setting", "lines", "task"],
};

const PRACTICE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          instruction: { type: "string" }, answer: { type: "string" },
          accept: { type: "array", items: { type: "string" } },
          // The ONE known word this drill primarily trains, copied verbatim from
          // the known list — the client keys the exercise to it so the grade
          // feeds that word's spaced-repetition schedule.
          target: { type: "string" },
        },
        required: ["instruction", "answer", "accept", "target"],
      },
    },
  },
  required: ["items"],
};

const EVALUATE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["good", "close", "off"] },
    feedback: { type: "string" },
    better: { type: "string" },
  },
  required: ["verdict", "feedback", "better"],
};

const EXPLAIN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    why: { type: "string" },      // what the confusion likely is, plainly
    tip: { type: "string" },      // the rule or a concrete memory hook
    example: { type: "string" },  // one short correct phrase, known words only
  },
  required: ["why", "tip", "example"],
};

const KNOWN_RULE =
  "Hard rule: use ONLY words the learner has already been taught (listed below). Never introduce a new word — if you'd need one, rephrase to avoid it. Keep it short and natural.";

function knownBlock(body: any) {
  const known: { roman: string; english: string }[] = body.known || [];
  const rungs: { title: string }[] = body.rungs || [];
  return `WORDS THE LEARNER KNOWS (use only these):\n${known.map((w) => `${w.roman} = ${w.english}`).join("\n")}\n\nGRAMMAR THE LEARNER KNOWS:\n${rungs.map((r) => `• ${r.title}`).join("\n") || "(none yet)"}`;
}

async function callClaude(system: string, user: string, schema: unknown, maxTokens = 2500) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }], output_config: { format: { type: "json_schema", schema } } }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content || []).find((b: any) => b.type === "text");
  if (!block) throw new Error("no text block");
  return JSON.parse(block.text);
}

function scenario(body: any) {
  const system = `You build a tiny realistic role-play for a traveler mid-way through a crash course. ${KNOWN_RULE}\n\nFor each line, break it into chunks aligned to English meaning and give matching chunks the same integer "group" across target and English so a UI can colour-link them. Split conjugated/affixed words into morphemes with short role labels (e.g. "ka"→"present","n"→"I","akol"→"eat"; negation wrap "ma"/"sh"). Plain words get one morpheme whose role is its part.\n\nReturn: a one-line English "setting", 4–6 alternating "lines" (speaker "them"/"you"), and a short English "task" telling the learner what to say or understand. Warm, true to the destination.`;
  const user = `Destination: ${body.destination || "your destination"}\nTheme: ${body.moduleTitle || "everyday situations"}\n\n${knownBlock(body)}\n\nBuild the scenario now.`;
  return callClaude(system, user, SCENARIO_SCHEMA, 3000).then((s) => ({ scenario: s }));
}

function weakBlock(body: any) {
  const weak: { roman: string; english: string }[] = body.weak || [];
  if (!weak.length) return "";
  return `\n\nWEAK SPOTS — the learner is shakiest on these; favour drills that put these words to work:\n${weak.map((w) => `${w.roman} = ${w.english}`).join("\n")}`;
}

function practice(body: any) {
  const n = Math.min(4, Math.max(1, body.count || 3));
  const system = `You write ${n} short "say it" production drills for a traveler. ${KNOWN_RULE}\n\nEach drill: an English "instruction" like "Say: I want tea", the correct romanized "answer", an "accept" array of other acceptable spellings/word-orders (can be empty), and "target" — the ONE word from the known list this drill mainly trains, copied EXACTLY as it appears there (same spelling). Prefer combining known words in NEW ways (recombination), not repeating a single taught phrase, and lean toward the weak spots below. Keep answers 2–5 words.`;
  const user = `Destination: ${body.destination || "your destination"}\nTheme: ${body.moduleTitle || "everyday situations"}\n\n${knownBlock(body)}${weakBlock(body)}\n\nWrite the ${n} drills now.`;
  return callClaude(system, user, PRACTICE_SCHEMA, 1500);
}

function evaluate(body: any) {
  const system = `You are a warm, encouraging language coach. The learner is doing a role-play in ${body.destination || "the country"}. Judge their attempt at the task: does it accomplish it using appropriate grammar they know? Be generous with minor spelling. Return: "verdict" (good | close | off), one short encouraging sentence of "feedback" naming the single most useful fix (or praise), and "better" — a natural model answer in the romanized target language using only taught words.`;
  const user = `TASK: ${body.task || ""}\nTHEIR ATTEMPT: ${body.userText || ""}\n\n${knownBlock(body)}\n\nEvaluate now.`;
  return callClaude(system, user, EVALUATE_SCHEMA, 700);
}

// Diagnose a hard case — a leech (a word missed several times running) or a
// grammar miss — and re-teach it. Kept for the hard cases only (the client
// never calls this on routine slips), so call volume stays low.
function explain(body: any) {
  const leech = body.kind === "leech";
  const system = leech
    ? `You are a warm, concise language tutor helping a traveler who keeps forgetting ONE word. Give three short sentences: "why" (a plausible reason it won't stick — a false friend, a near-homophone of another word they know, an unusual sound), "tip" (one concrete memory hook), "example" (a natural short phrase that USES the word). ${KNOWN_RULE}`
    : `You are a warm, concise language tutor. The learner just missed a grammar exercise. Give three short sentences: "why" (what the mistake most likely was, in plain English), "tip" (the one rule to remember), "example" (a correct short phrase showing it). ${KNOWN_RULE}`;
  const user = leech
    ? `WORD THEY KEEP MISSING: ${body.roman || body.target || ""} = ${body.english || ""}\n\n${knownBlock(body)}\n\nExplain now.`
    : `EXERCISE PROMPT: ${body.prompt || ""}\nCORRECT ANSWER: ${body.correct || ""}\nTHEIR WRONG ANSWER: ${body.chosen || "(unknown)"}\n\n${knownBlock(body)}\n\nExplain now.`;
  return callClaude(system, user, EXPLAIN_SCHEMA, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const day = new Date().toISOString().slice(0, 10);
    const { data: usage } = await admin.from("ai_usage").select("count").eq("user_id", user.id).eq("day", day).maybeSingle();
    const count = usage?.count ?? 0;
    if (count >= DAILY_CAP) return json({ error: "daily_limit", cap: DAILY_CAP }, 429);

    const body = await req.json();
    const mode = body.mode || "scenario";
    const result =
      mode === "practice" ? await practice(body) :
      mode === "evaluate" ? await evaluate(body) :
      mode === "explain" ? await explain(body) :
      await scenario(body);

    await admin.from("ai_usage").upsert({ user_id: user.id, day, count: count + 1, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
    return json(result, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
