-- ---------------------------------------------------------------------------
-- Quantité mangée d'une entrée nutrition.
--
-- Seuls les totaux étaient conservés, donc rouvrir un repas déjà enregistré ne
-- pouvait proposer que ses totaux — impossible d'en retrouver les valeurs pour
-- 100 g, qui sont pourtant ce qu'on veut réutiliser quand on remange la même
-- chose en quantité différente.
--
-- Une seule colonne suffit : les valeurs pour 100 g se déduisent des totaux
-- (total / quantity_g * 100). Les stocker en plus créerait deux sources pour la
-- même vérité, qui finiraient par diverger.
--
-- Nullable à dessein : toutes les entrées existantes, et toute saisie en mode
-- « Total », n'ont pas de quantité — elles continueront de se recopier telles
-- quelles.
-- ---------------------------------------------------------------------------

alter table public.nutrition_entries
  add column if not exists quantity_g numeric check (quantity_g > 0);
