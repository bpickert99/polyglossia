// TripTalk lesson-construction proxy.
//
// The static spine (vocabulary + grammar rungs) is the curriculum and stays
// deterministic. This function does the one thing static assembly can't: build
// an open-ended "in-the-wild" scenario from ONLY what the learner has been
// taught — a short dialogue in the target language, each line broken into
// Mango-style colour-coded chunks aligned to English, with conjugated words
// split into morphemes. The prompt hard-limits the model to the known-word set;
// the client then validates the output against that same set and falls back to
// static content if anything drifts, so untaught vocabulary can never surface.
//
// Keys live here, never in the static site. verify_jwt is on, so only a
// signed-in user reaches this — and a per-user daily cap bounds cost and doubles
// as the paywall lever.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "claude-haiku-4-5";
const DAILY_CAP = 40; // generations per user per day — cost bound + paywall lever

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// Structured-output schema the model must fill. Kept within structured-output
// limits (every object has additionalProperties:false + required; no numeric or
// length constraints; no recursion).
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    setting: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          speaker: { type: "string", enum: ["them", "you"] },
          roman: { type: "string" },
          english: { type: "string" },
          chunks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                roman: { type: "string" },
                en: { type: "string" },
                group: { type: "integer" },
                morphemes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { seg: { type: "string" }, role: { type: "string" } },
                    required: ["seg", "role"],
                  },
                },
              },
              required: ["roman", "en", "group", "morphemes"],
            },
          },
        },
        required: ["speaker", "roman", "english", "chunks"],
      },
    },
    task: { type: "string" },
  },
  required: ["setting", "lines", "task"],
};

const SYSTEM = `You build a tiny, realistic role-play scenario for a traveler who is mid-way through a pre-departure crash course. Your one hard rule: use ONLY words the learner has already been taught (given below). Never introduce a new word — if you need a word you weren't given, rewrite the line to avoid it. Keep every line short (2–6 words). Prefer the exact taught chunks.

For each line, break it into chunks aligned to English meaning and give matching chunks the same integer "group" across the target and its English gloss, so a UI can colour-link them (Mango-style). Split any conjugated or affixed word into morphemes with a short role label (e.g. "ka"→"present", "n"→"I", "akol"→"eat"; or the negation wrap "ma"/"sh"). For a plain word, use one morpheme whose role is its part ("noun", "verb", "question-word", etc.).

Return a scenario with: a one-line English "setting", 4–6 alternating "lines" (speaker "them" or "you"), and a short English "task" telling the learner what to say or understand. Keep it warm and true to the destination.`;

async function generateScenario(body: any) {
  const known: { roman: string; english: string }[] = body.known || [];
  const rungs: { title: string; teach: string }[] = body.rungs || [];
  const destination = body.destination || "your destination";
  const moduleTitle = body.moduleTitle || "everyday situations";

  const wordList = known.map((w) => `${w.roman} = ${w.english}`).join("\n");
  const grammarList = rungs.map((r) => `• ${r.title}`).join("\n") || "(none yet)";

  const userPrompt = `Destination: ${destination}
Today's theme: ${moduleTitle}

WORDS THE LEARNER KNOWS (use only these):
${wordList}

GRAMMAR THE LEARNER KNOWS:
${grammarList}

Build the scenario now, obeying the known-word rule strictly.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("no text block in model response");
  return JSON.parse(textBlock.text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // Identify the signed-in user (verify_jwt already validated the token).
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    // Enforce the daily cap with the service role (bypasses RLS on ai_usage).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const day = new Date().toISOString().slice(0, 10);
    const { data: usage } = await admin
      .from("ai_usage").select("count").eq("user_id", user.id).eq("day", day).maybeSingle();
    const count = usage?.count ?? 0;
    if (count >= DAILY_CAP) return json({ error: "daily_limit", cap: DAILY_CAP }, 429);

    const body = await req.json();
    const scenario = await generateScenario(body);

    await admin.from("ai_usage")
      .upsert({ user_id: user.id, day, count: count + 1, updated_at: new Date().toISOString() },
        { onConflict: "user_id,day" });

    return json({ scenario }, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
