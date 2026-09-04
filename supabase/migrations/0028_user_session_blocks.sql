create table public.user_session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.user_sessions (id) on delete cascade,
  "order" smallint not null default 0,
  format text not null check (format in ('strength', 'amrap', 'emom', 'for_time')),
  time_cap_sec integer,
  target_rounds smallint
);

create index user_session_blocks_session_idx on public.user_session_blocks (session_id);

alter table public.user_session_exercises
  add column block_id uuid references public.user_session_blocks (id) on delete cascade;

create index user_session_exercises_block_idx on public.user_session_exercises (block_id) where block_id is not null;

alter table public.user_session_blocks enable row level security;

create policy "user_session_blocks readable via parent session"
  on public.user_session_blocks for select
  to authenticated
  using (
    exists (
      select 1 from public.user_sessions s
      where s.id = session_id and (s.visibility = 'public' or s.user_id = auth.uid())
    )
  );

create policy "user_session_blocks writable via parent session"
  on public.user_session_blocks for all
  using (exists (select 1 from public.user_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.user_sessions s where s.id = session_id and s.user_id = auth.uid()));
