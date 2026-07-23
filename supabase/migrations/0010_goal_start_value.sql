-- SUPOTSU — Étape 8 : Objectifs & progression
-- Capture a goal's baseline so progress toward the target is unambiguous
-- (e.g. "lose 5 kg" needs the starting weight, not just current vs target).
alter table public.goals add column if not exists start_value numeric;
