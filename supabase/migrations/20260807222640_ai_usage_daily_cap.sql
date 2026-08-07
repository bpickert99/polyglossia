-- Per-user daily generation counter for the AI lesson-construction proxy.
-- RLS on with no policies: only the Edge Function's service role touches it.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
