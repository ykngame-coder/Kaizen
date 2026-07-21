-- SUPOTSU — Étape 6 : Nutrition + Habitudes/Gamification
-- Same principles as 0001 (Master Prompt P11, P12, P36):
--   * every row is owner-scoped; RLS = owner-only.
--   * intake and habit logs are additive history (one row per event), never
--     overwritten, and keep their source.

-- ---------------------------------------------------------------------------
-- nutrition_entries (one row per logged intake; history preserved)
-- ---------------------------------------------------------------------------
create table public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  description text not null,
  kcal numeric not null check (kcal >= 0),
  protein_g numeric check (protein_g >= 0),
  carb_g numeric check (carb_g >= 0),
  fat_g numeric check (fat_g >= 0),
  hydration_ml numeric check (hydration_ml >= 0),
  source text not null default 'manual',
  logged_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nutrition_entries_user_logged_idx
  on public.nutrition_entries (user_id, logged_at desc);

create trigger nutrition_entries_set_updated_at
  before update on public.nutrition_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- habits (user commitments) + habit_logs (additive completions)
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  pillar text not null default 'habits'
    check (pillar in ('sleep', 'recovery', 'performance', 'nutrition', 'habits', 'understanding', 'decision')),
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly')),
  target_per_period integer not null default 1 check (target_per_period > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index habits_user_idx on public.habits (user_id);

create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index habit_logs_habit_completed_idx
  on public.habit_logs (habit_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- earned_badges (gamification; one row per unlocked badge, with its reason)
-- ---------------------------------------------------------------------------
create table public.earned_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null,
  reason text not null,
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index earned_badges_user_idx on public.earned_badges (user_id);

-- ---------------------------------------------------------------------------
-- Row level security — owner-only, mirroring 0001.
-- ---------------------------------------------------------------------------
alter table public.nutrition_entries enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.earned_badges enable row level security;

create policy "nutrition_entries are self-owned"
  on public.nutrition_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "habits are self-owned"
  on public.habits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "habit_logs are self-owned"
  on public.habit_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "earned_badges are self-owned"
  on public.earned_badges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
