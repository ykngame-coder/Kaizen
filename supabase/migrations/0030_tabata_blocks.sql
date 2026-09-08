-- ---------------------------------------------------------------------------
-- Tabata block format.
--
-- A block could only ever store `time_cap_sec` and `target_rounds`, with no
-- room for a rest duration — which is exactly what separates Tabata from an
-- EMOM. For a Tabata block `time_cap_sec` carries the WORK seconds (the same
-- field already means "interval length" for EMOM) and `rest_sec` the rest.
--
-- The format CHECKs in 0023 and 0028 were written inline and are therefore
-- named by Postgres (`<table>_format_check`). They are dropped by that
-- generated name and recreated under an explicit one, so the next format is a
-- one-line change instead of this dance again.
-- ---------------------------------------------------------------------------

alter table public.workout_blocks
  drop constraint if exists workout_blocks_format_check;
alter table public.workout_blocks
  add constraint workout_blocks_format_valid
  check (format in ('strength', 'amrap', 'emom', 'for_time', 'tabata'));

alter table public.workout_blocks
  add column if not exists rest_sec integer;

alter table public.user_session_blocks
  drop constraint if exists user_session_blocks_format_check;
alter table public.user_session_blocks
  add constraint user_session_blocks_format_valid
  check (format in ('strength', 'amrap', 'emom', 'for_time', 'tabata'));

alter table public.user_session_blocks
  add column if not exists rest_sec integer;
