-- Prépa Hyrox's own session content (packages/shared/programs.ts, HYROX_PATTERN)
-- references 4 exercise ids that were never seeded into public.exercises —
-- only 8 of the 20 ex-* ids used across the whole legacy program catalogue
-- made it into 0002's seed. Publishing this program without this fix would
-- let a real user enroll, then hit a foreign-key violation the moment the
-- schedule tries to insert a set for one of these.
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  ('ex-burpee', 'Burpee', 'functional', '{full_body}', '{core}', '{}', 'beginner'),
  ('ex-farmers-carry', 'Marche du fermier', 'functional', '{core,back}', '{shoulders,quads}', '{kettlebell}', 'beginner'),
  ('ex-mountain-climber', 'Mountain climber', 'functional', '{core}', '{shoulders,quads}', '{}', 'beginner'),
  ('ex-thruster', 'Thruster', 'functional', '{quads,shoulders}', '{glutes,core}', '{gym}', 'intermediate')
on conflict (id) do nothing;
