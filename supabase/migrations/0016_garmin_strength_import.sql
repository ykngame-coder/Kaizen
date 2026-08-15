-- Garmin FIT strength-set import (Master Prompt — Garmin muscle-silhouette
-- fix). Two things: (1) seed the exercise-category entries added to
-- packages/shared/exercises.ts, same idempotent pattern as 0002; (2) let
-- imported workouts be deduped like activities/health_metrics already are —
-- workouts had no external_id at all, so re-importing the same Garmin
-- export would otherwise double every set's volume.

insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('ex-garmin-calf-raise', 'Mollets (import Garmin)', 'strength', '{calves}', '{}', '{gym}', 'beginner'),
  ('ex-garmin-carry', 'Portage de charge (import Garmin)', 'functional', '{core}', '{back,glutes}', '{gym}', 'intermediate'),
  ('ex-garmin-chop', 'Rotation de tronc (import Garmin)', 'functional', '{core}', '{shoulders}', '{gym}', 'intermediate'),
  ('ex-garmin-core', 'Gainage dynamique (import Garmin)', 'strength', '{core}', '{}', '{}', 'beginner'),
  ('ex-garmin-crunch', 'Crunch (import Garmin)', 'strength', '{core}', '{}', '{}', 'beginner'),
  ('ex-garmin-curl', 'Curl biceps (import Garmin)', 'strength', '{biceps}', '{}', '{gym}', 'beginner'),
  ('ex-garmin-flye', 'Écarté (import Garmin)', 'strength', '{chest}', '{shoulders}', '{gym}', 'intermediate'),
  ('ex-garmin-hip-raise', 'Hip thrust (import Garmin)', 'strength', '{glutes}', '{hamstrings,core}', '{gym}', 'intermediate'),
  ('ex-garmin-hip-stability', 'Stabilité de hanche (import Garmin)', 'mobility', '{glutes}', '{core}', '{}', 'beginner'),
  ('ex-garmin-hip-swing', 'Balancier de hanche (import Garmin)', 'functional', '{glutes}', '{hamstrings,core}', '{kettlebell}', 'intermediate'),
  ('ex-garmin-hyperextension', 'Hyperextension lombaire (import Garmin)', 'strength', '{back}', '{glutes,hamstrings}', '{gym}', 'intermediate'),
  ('ex-garmin-lateral-raise', 'Élévation latérale (import Garmin)', 'strength', '{shoulders}', '{}', '{gym}', 'beginner'),
  ('ex-garmin-leg-curl', 'Leg curl (import Garmin)', 'strength', '{hamstrings}', '{}', '{gym}', 'beginner'),
  ('ex-garmin-leg-raise', 'Relevé de jambes (import Garmin)', 'strength', '{core}', '{quads}', '{}', 'beginner'),
  ('ex-garmin-lunge', 'Fentes (import Garmin)', 'strength', '{quads,glutes}', '{hamstrings,core}', '{gym}', 'intermediate'),
  ('ex-garmin-olympic-lift', 'Haltérophilie (import Garmin)', 'strength', '{full_body}', '{}', '{gym}', 'advanced'),
  ('ex-garmin-plyo', 'Pliométrie (import Garmin)', 'functional', '{quads,glutes}', '{calves}', '{}', 'intermediate'),
  ('ex-garmin-row', 'Tirage (import Garmin)', 'strength', '{back}', '{biceps}', '{gym}', 'intermediate'),
  ('ex-garmin-shoulder-press', 'Développé épaules (import Garmin)', 'strength', '{shoulders}', '{triceps}', '{gym}', 'intermediate'),
  ('ex-garmin-shoulder-stability', 'Stabilité d’épaule (import Garmin)', 'mobility', '{shoulders}', '{core}', '{}', 'beginner'),
  ('ex-garmin-shrug', 'Shrug (import Garmin)', 'strength', '{back}', '{}', '{gym}', 'beginner'),
  ('ex-garmin-sit-up', 'Sit-up (import Garmin)', 'strength', '{core}', '{}', '{}', 'beginner'),
  ('ex-garmin-total-body', 'Corps entier (import Garmin)', 'functional', '{full_body}', '{}', '{gym}', 'intermediate'),
  ('ex-garmin-triceps-extension', 'Extension triceps (import Garmin)', 'strength', '{triceps}', '{}', '{gym}', 'beginner'),
  ('ex-garmin-battle-rope', 'Battle rope (import Garmin)', 'functional', '{shoulders,core}', '{back}', '{gym}', 'intermediate'),
  ('ex-garmin-sandbag', 'Sac lesté (import Garmin)', 'functional', '{full_body}', '{}', '{gym}', 'intermediate'),
  ('ex-garmin-sled', 'Traîneau (import Garmin)', 'functional', '{quads,glutes}', '{calves}', '{gym}', 'intermediate'),
  ('ex-garmin-sledge-hammer', 'Masse (import Garmin)', 'functional', '{core,shoulders}', '{back}', '{gym}', 'intermediate'),
  ('ex-garmin-tire', 'Pneu (import Garmin)', 'functional', '{full_body}', '{}', '{gym}', 'advanced')
on conflict (id) do nothing;

alter table public.workouts add column if not exists external_id text;

create unique index if not exists workouts_dedup_idx
  on public.workouts (user_id, external_id)
  where external_id is not null;
