-- ---------------------------------------------------------------------------
-- Dénivelé négatif d'une activité.
--
-- `elevation_gain_m` existe depuis l'origine mais n'a jamais eu de chemin
-- d'écriture (le connecteur ne le mappait pas, le schéma d'entrée ne
-- l'acceptait pas) — retour TestFlight du 14 sept. 2026 : Santé expose le
-- dénivelé positif ET négatif pour les séances importées (HealthKit les
-- porte en métadonnée du workout), Kaizen n'en gardait aucun des deux.
-- On répare les deux à la fois plutôt que de rouvrir le sujet dans 3 mois.
-- ---------------------------------------------------------------------------

alter table public.activities
  add column if not exists elevation_loss_m numeric;
