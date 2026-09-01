-- Superset support: sets sharing this number, within the same block, form
-- one superset — alternated A1/B1/A2/B2 live, rest only after each round.
-- See docs/superpowers/specs/2026-09-01-superset-support-design.md.

alter table public.workout_sets add column superset_group smallint;
