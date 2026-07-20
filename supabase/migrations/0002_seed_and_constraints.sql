-- SUPOTSU — seed data + integrity constraints (Étape backend réel)

-- ---------------------------------------------------------------------------
-- Exercise library seed. Ids are stable slugs shared with the client
-- (packages/shared/exercises.ts). Idempotent via ON CONFLICT.
-- ---------------------------------------------------------------------------
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('ex-back-squat', 'Squat barre', 'strength', '{quads,glutes}', '{core,hamstrings}', '{gym}', 'intermediate'),
  ('ex-deadlift', 'Soulevé de terre', 'strength', '{back,hamstrings,glutes}', '{core}', '{gym}', 'advanced'),
  ('ex-bench-press', 'Développé couché', 'strength', '{chest}', '{triceps,shoulders}', '{gym}', 'intermediate'),
  ('ex-pull-up', 'Traction', 'strength', '{back,biceps}', '{core}', '{}', 'intermediate'),
  ('ex-push-up', 'Pompes', 'strength', '{chest,triceps}', '{core,shoulders}', '{}', 'beginner'),
  ('ex-kb-swing', 'Kettlebell swing', 'functional', '{glutes,hamstrings}', '{core,back}', '{kettlebell}', 'beginner'),
  ('ex-wall-balls', 'Wall balls', 'sport_specific', '{quads,shoulders}', '{core}', '{gym}', 'intermediate'),
  ('ex-plank', 'Gainage', 'mobility', '{core}', '{}', '{}', 'beginner')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Idempotent health imports: a given (user, metric, timestamp, source) is
-- unique, so re-syncing a connector never duplicates rows (Master Prompt P9.8).
-- ---------------------------------------------------------------------------
create unique index if not exists health_metrics_dedup_idx
  on public.health_metrics (user_id, type, measured_at, source);
