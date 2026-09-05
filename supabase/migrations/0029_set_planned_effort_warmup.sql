-- Lot 1 des fondations création & suivi de séance.
-- Voir docs/superpowers/specs/2026-09-05-session-creation-and-runner-design.md
--
-- reps/weight_kg gardent la meilleure vérité connue (le prévu tant que la
-- série n'est pas loguée, le réalisé ensuite) : tous les écrans et moteurs
-- existants continuent donc de fonctionner sans modification. planned_* ne
-- fait que conserver ce qui était programmé, et n'est jamais réécrit.
--
-- completed_at est indispensable à l'adhésion au plan : le runner pré-remplit
-- chaque série avec le prévu, donc sans ce champ une série jamais faite est
-- indiscernable d'une série faite exactement comme prévu.

alter table public.workout_sets
  add column planned_reps smallint,
  add column planned_weight_kg numeric(6, 2),
  add column rir smallint check (rir between 0 and 10),
  add column is_warmup boolean not null default false,
  add column completed_at timestamptz;

-- La bibliothèque « Mes séances » retient l'échauffement pour le restituer au
-- lancement. Le prévu/réalisé n'y a en revanche aucun sens : pas de planned_*.
alter table public.user_session_exercises
  add column is_warmup boolean not null default false;
