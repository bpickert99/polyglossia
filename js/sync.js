// Cloud progress sync via Supabase.
//
// - Sign in with a 6-digit email code (works out of the box, no OAuth setup),
//   or with Google once the Google provider is enabled in the Supabase
//   dashboard (Authentication → Providers → Google).
// - On sign-in, cloud and local progress are merged (newest review wins per
//   word; counters take the max), then every local change is pushed, debounced.
// - Without sign-in the app is fully functional; progress just stays local.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { exportState, mergeRemoteState, onChange } from "./storage.js";

let supabase = null;
let user = null;
let pushTimer = null;
let unsubscribe = null;
let cardEl = null;

async function client() {
  if (!SUPABASE_URL) return null;
  if (!supabase) {
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn("Sync unavailable (couldn't load Supabase client):", e);
      return null;
    }
  }
  return supabase;
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 2500);
}

async function pushNow() {
  const sb = await client();
  if (!sb || !user) return;
  const { error } = await sb.from("progress").upsert({
    user_id: user.id,
    data: exportState(),
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("Progress push failed:", error.message);
}

async function pullAndMerge() {
  const sb = await client();
  if (!sb || !user) return;
  const { data, error } = await sb.from("progress").select("data").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.warn("Progress pull failed:", error.message);
    return;
  }
  if (data?.data) mergeRemoteState(data.data);
  await pushNow(); // write the merged result back
}

async function startSession(u) {
  user = u;
  await pullAndMerge();
  unsubscribe?.();
  unsubscribe = onChange(schedulePush);
  renderSyncCard(cardEl);
}

export async function initSync() {
  const sb = await client();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) await startSession(data.session.user);
  sb.auth.onAuthStateChange((_event, session) => {
    if (session?.user && session.user.id !== user?.id) startSession(session.user);
  });
}

// ---------- UI (rendered inside the Stats page) ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderSyncCard(el) {
  if (!el) return;
  cardEl = el;

  if (!SUPABASE_URL) {
    el.innerHTML = "";
    return;
  }

  if (user) {
    el.innerHTML = `
      <div class="article">
        <h2>☁️ Progress sync</h2>
        <p>Signed in as <b>${esc(user.email || user.id)}</b>. Your progress is saved to your
        account and follows you across devices.</p>
        <button class="btn ghost" id="signout">Sign out</button>
      </div>`;
    el.querySelector("#signout").addEventListener("click", async () => {
      const sb = await client();
      await sb?.auth.signOut();
      user = null;
      unsubscribe?.();
      renderSyncCard(el);
    });
    return;
  }

  el.innerHTML = `
    <div class="article">
      <h2>☁️ Save progress to an account</h2>
      <p class="muted">Optional — everything works without it, but signing in backs up your
      progress and syncs it across devices.</p>
      <div class="sync-row">
        <input class="type-input" id="sync-email" type="email" placeholder="you@example.com" autocomplete="email">
        <button class="btn blue" id="send-code">Email me a code</button>
      </div>
      <div class="sync-row" id="code-row" hidden>
        <input class="type-input" id="sync-code" inputmode="numeric" placeholder="6-digit code">
        <button class="btn" id="verify-code">Verify</button>
      </div>
      <button class="btn ghost wide" id="google" style="margin-top:10px">Continue with Google</button>
      <p class="muted" id="sync-msg"></p>
    </div>`;

  const msg = el.querySelector("#sync-msg");
  const emailInput = el.querySelector("#sync-email");

  el.querySelector("#send-code").addEventListener("click", async () => {
    const sb = await client();
    if (!sb) return (msg.textContent = "Sync service unreachable right now.");
    const email = emailInput.value.trim();
    if (!email.includes("@")) return (msg.textContent = "Enter a valid email address.");
    msg.textContent = "Sending…";
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return (msg.textContent = error.message);
    el.querySelector("#code-row").hidden = false;
    msg.textContent = "Check your inbox for a 6-digit code.";
  });

  el.querySelector("#verify-code").addEventListener("click", async () => {
    const sb = await client();
    const email = emailInput.value.trim();
    const token = el.querySelector("#sync-code").value.trim();
    msg.textContent = "Verifying…";
    const { data, error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) return (msg.textContent = error.message);
    if (data?.user) await startSession(data.user);
  });

  el.querySelector("#google").addEventListener("click", async () => {
    const sb = await client();
    if (!sb) return (msg.textContent = "Sync service unreachable right now.");
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) {
      msg.textContent = "Google sign-in isn't configured yet — use the email code instead. " +
        "(Site owner: enable the Google provider in Supabase → Authentication → Providers.)";
    }
  });
}
