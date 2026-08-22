-- workouts_dedup_idx (0016) is a *partial* unique index (`where external_id
-- is not null`), but every Garmin import upsert targets
-- onConflict('user_id,external_id') with no predicate — Postgres can't use a
-- partial index as an ON CONFLICT arbiter unless the conflict clause repeats
-- the same WHERE, which the Supabase/PostgREST client never emits. Every
-- Garmin-workout import has therefore been failing outright with "there is
-- no unique or exclusion constraint matching the ON CONFLICT specification"
-- (reported via TestFlight feedback).
--
-- Dropping the partial predicate fixes this without changing behavior:
-- Postgres unique indexes already never treat two NULLs as conflicting, so a
-- plain unique index on (user_id, external_id) still allows any number of
-- manually-created workouts (external_id null) per user — the partial
-- predicate was redundant for that purpose, and only broke upserts.

drop index if exists public.workouts_dedup_idx;

create unique index if not exists workouts_dedup_idx
  on public.workouts (user_id, external_id);
