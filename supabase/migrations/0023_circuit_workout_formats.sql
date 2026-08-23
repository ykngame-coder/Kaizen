-- Circuit workout formats (AMRAP/EMOM/Pour le temps): a session becomes a
-- sequence of blocks instead of one flat format. Plain strength-only
-- workouts keep zero blocks — workout_sets.block_id stays null for them,
-- exactly as today. See docs/superpowers/specs/2026-08-22-circuit-workout-formats-design.md.

create table public.workout_blocks (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  "order" smallint not null default 0,
  format text not null check (format in ('strength', 'amrap', 'emom', 'for_time')),
  time_cap_sec integer,
  target_rounds smallint,
  completed_rounds smallint,
  result_time_sec integer
);

create index workout_blocks_workout_idx on public.workout_blocks (workout_id);

alter table public.workout_sets
  add column block_id uuid references public.workout_blocks (id) on delete cascade;

create index workout_sets_block_idx on public.workout_sets (block_id) where block_id is not null;

alter table public.workout_blocks enable row level security;

create policy "workout_blocks follow workout ownership"
  on public.workout_blocks for all
  using (
    exists (select 1 from public.workouts w where w.id = workout_blocks.workout_id and w.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workouts w where w.id = workout_blocks.workout_id and w.user_id = auth.uid())
  );
