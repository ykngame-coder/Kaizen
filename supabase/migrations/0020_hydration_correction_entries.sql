-- ---------------------------------------------------------------------------
-- Allow a small negative hydration_ml — a "-250 ml" correction entry (undoing
-- an accidental +250/+500/+750 tap) is a legitimate log row; sumDay() just
-- adds every entry for the day, so a negative row nets the total out
-- correctly without needing to find-and-delete a specific prior entry.
-- ---------------------------------------------------------------------------
alter table public.nutrition_entries
  drop constraint nutrition_entries_hydration_ml_check;

alter table public.nutrition_entries
  add constraint nutrition_entries_hydration_ml_check check (hydration_ml >= -10000 and hydration_ml <= 10000);
