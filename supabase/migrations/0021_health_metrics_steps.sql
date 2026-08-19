-- ---------------------------------------------------------------------------
-- 'steps' was added as a HealthMetricType in app code (packages/core) without
-- a matching migration — every HealthKit sync that included a step-count
-- reading violated health_metrics_type_check and failed outright, taking the
-- rest of that sync's metrics down with it (one bulk insert, one violating
-- row aborts the whole statement). TestFlight: steps stuck at "—" despite
-- 10k+ steps in Apple Health, and "Synchronisation impossible" with this
-- exact constraint name in the error detail.
-- ---------------------------------------------------------------------------
alter table public.health_metrics
  drop constraint health_metrics_type_check;

alter table public.health_metrics
  add constraint health_metrics_type_check
  check (type in ('sleep_duration', 'sleep_efficiency', 'resting_heart_rate', 'hrv',
                  'stress', 'weight', 'body_fat', 'muscle_mass', 'hydration', 'steps'));
