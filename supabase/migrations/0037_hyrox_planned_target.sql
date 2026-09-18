-- Preserve a Hyrox station's original distance/time target separately from
-- distance_m/duration_sec, which double as the measured result once the
-- station is logged (both end up populated after logging, so the live pair
-- alone can no longer tell which one was the original target — the same
-- "plan vs. actual" split already made for planned_reps/planned_weight_kg,
-- migration 0029). Without this, editing an already-logged Hyrox workout
-- can misread a station's mode and silently drop its target on save.
alter table workout_sets
  add column if not exists planned_distance_m numeric,
  add column if not exists planned_duration_sec integer;
