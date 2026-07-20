// Cloud sync backend (Supabase). The publishable key is safe to ship in a
// static site — data access is protected by row-level security, so every
// signed-in user can only ever read/write their own progress row.
// Leave SUPABASE_URL empty to run the site fully offline/local-only.
export const SUPABASE_URL = "https://tzsltxjzzxebyioucdaa.supabase.co";
export const SUPABASE_KEY = "sb_publishable_6cp5iOXwJ3zYW-CruS-lzg_NaIhVp-C";
