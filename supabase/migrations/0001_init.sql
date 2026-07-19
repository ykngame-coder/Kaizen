-- SUPOTSU — Phase 1 schema (Étape 1 fondations)
-- Principles enforced here (Master Prompt P8.1, P15, P29, P32):
--   * every user-owned row references the owner; RLS = owner-only.
--   * health/score/activity rows keep their source and are never overwritten
--     (history preserved via insert-per-measurement).
--   * the shared exercise library is world-readable but not user-writable.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  auth_provider text not null default 'email' check (auth_provider in ('email', 'apple', 'google')),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  locale text not null default 'fr',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_connection_at timestamptz
);

-- Auto-provision a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- athlete_profiles (1:1 with profiles)
-- ---------------------------------------------------------------------------
create table public.athlete_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date,
  sex text not null default 'unspecified' check (sex in ('male', 'female', 'unspecified')),
  height_cm numeric(5, 1),
  weight_kg numeric(5, 1),
  level text not null default 'beginner'
    check (level in ('beginner', 'intermediate', 'confirmed', 'advanced')),
  archetype text check (archetype in ('endurance', 'power', 'hybrid', 'strength', 'mobility', 'beginner')),
  sports text[] not null default '{}',
  weekly_availability smallint,
  equipment text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger athlete_profiles_updated_at
  before update on public.athlete_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('performance', 'strength', 'endurance', 'body_composition', 'health', 'habit')),
  title text not null,
  description text,
  priority text not null default 'primary' check (priority in ('primary', 'secondary')),
  target_value numeric,
  target_unit text,
  current_value numeric,
  deadline timestamptz,
  status text not null default 'active' check (status in ('active', 'achieved', 'paused', 'abandoned')),
  progress numeric not null default 0 check (progress >= 0 and progress <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_user_status_idx on public.goals (user_id, status);

create trigger goals_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- exercises (shared library — read-only to users)
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null
    check (category in ('strength', 'hypertrophy', 'endurance', 'mobility', 'functional', 'sport_specific')),
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment text[] not null default '{}',
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  instructions text,
  common_mistakes text[] not null default '{}',
  variants text[] not null default '{}',
  media_url text,
  created_at timestamptz not null default now()
);

create index exercises_category_idx on public.exercises (category);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('walking', 'running', 'cycling', 'swimming', 'strength',
                    'cross_training', 'hyrox', 'mobility', 'yoga', 'other')),
  source text not null default 'manual',
  started_at timestamptz not null,
  duration_sec integer not null check (duration_sec > 0),
  distance_m numeric,
  calories numeric,
  intensity text check (intensity in ('low', 'moderate', 'high', 'max')),
  avg_heart_rate smallint,
  max_heart_rate smallint,
  elevation_gain_m numeric,
  raw jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_user_started_idx on public.activities (user_id, started_at desc);
create index activities_user_type_idx on public.activities (user_id, type);
create index activities_source_idx on public.activities (source);

create trigger activities_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workouts + workout_sets
-- ---------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid,
  name text not null,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  planned_for timestamptz,
  completed_at timestamptz,
  duration_sec integer,
  rpe smallint check (rpe between 1 and 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_user_planned_idx on public.workouts (user_id, planned_for desc);

create trigger workouts_updated_at
  before update on public.workouts
  for each row execute function public.set_updated_at();

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  "order" smallint not null default 0,
  reps smallint,
  weight_kg numeric(6, 2),
  duration_sec integer,
  rest_sec integer,
  rpe smallint check (rpe between 1 and 10)
);

create index workout_sets_workout_idx on public.workout_sets (workout_id);

-- ---------------------------------------------------------------------------
-- health_metrics (one row per measurement; never overwritten)
-- ---------------------------------------------------------------------------
create table public.health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('sleep_duration', 'sleep_efficiency', 'resting_heart_rate', 'hrv',
                    'stress', 'weight', 'body_fat', 'muscle_mass', 'hydration')),
  value numeric not null,
  unit text not null,
  source text not null default 'manual',
  reliability text check (reliability in ('high', 'medium', 'low')),
  measured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index health_metrics_user_type_measured_idx
  on public.health_metrics (user_id, type, measured_at desc);

-- ---------------------------------------------------------------------------
-- supotsu_scores (computed; history kept per day/kind)
-- ---------------------------------------------------------------------------
create table public.supotsu_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    check (kind in ('overall', 'performance', 'recovery', 'consistency', 'progression', 'training_load')),
  value numeric not null check (value >= 0 and value <= 100),
  date date not null,
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'to_confirm')),
  factors jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (user_id, kind, date)
);

create index supotsu_scores_user_kind_date_idx
  on public.supotsu_scores (user_id, kind, date desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.goals enable row level security;
alter table public.exercises enable row level security;
alter table public.activities enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.health_metrics enable row level security;
alter table public.supotsu_scores enable row level security;

-- profiles: a user sees/edits only their own row.
create policy "profiles are self-owned"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Owner-only policy applied uniformly to user-scoped tables.
create policy "athlete_profiles are self-owned"
  on public.athlete_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goals are self-owned"
  on public.goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "activities are self-owned"
  on public.activities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workouts are self-owned"
  on public.workouts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "health_metrics are self-owned"
  on public.health_metrics for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "supotsu_scores are self-owned"
  on public.supotsu_scores for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- workout_sets: ownership derived from the parent workout.
create policy "workout_sets follow workout ownership"
  on public.workout_sets for all
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_sets.workout_id and w.user_id = auth.uid()
    )
  );

-- exercises: shared library, readable by any authenticated user, not writable.
create policy "exercises are readable by authenticated users"
  on public.exercises for select
  to authenticated
  using (true);
