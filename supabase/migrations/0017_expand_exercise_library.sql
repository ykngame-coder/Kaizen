-- ---------------------------------------------------------------------------
-- Expand the manually-pickable exercise library (Master Prompt P5.5, P36.3).
-- A TestFlight tester found the "Nouvelle séance" picker too limited (only
-- 8 curated exercises — the other 29 rows seeded by 0016 are Garmin-import
-- muscle-mapping placeholders, not meant for manual picking) and specifically
-- asked for planche, développé Arnold and leg extension. sets.exercise_id and
-- user_session_exercises.exercise_id both have a foreign key to this table
-- (see 0001_init.sql), so every id added to packages/shared/src/exercises.ts
-- must exist here too or logging a set against a new exercise fails.
-- ---------------------------------------------------------------------------
insert into public.exercises (id, name, category, primary_muscles, secondary_muscles, equipment, level)
values
  -- Chest
  ('ex-incline-bench-press', 'Développé incliné', 'strength', '{chest}', '{shoulders,triceps}', '{gym}', 'intermediate'),
  ('ex-decline-bench-press', 'Développé décliné', 'strength', '{chest}', '{triceps}', '{gym}', 'intermediate'),
  ('ex-dumbbell-bench-press', 'Développé couché haltères', 'strength', '{chest}', '{triceps,shoulders}', '{gym}', 'intermediate'),
  ('ex-cable-crossover', 'Écarté à la poulie', 'hypertrophy', '{chest}', '{shoulders}', '{gym}', 'intermediate'),
  ('ex-chest-dip', 'Dips (pectoraux)', 'strength', '{chest}', '{triceps}', '{gym}', 'intermediate'),
  ('ex-machine-chest-press', 'Développé couché machine', 'strength', '{chest}', '{triceps}', '{gym}', 'beginner'),
  -- Back
  ('ex-lat-pulldown', 'Tirage vertical', 'strength', '{back}', '{biceps}', '{gym}', 'beginner'),
  ('ex-seated-cable-row', 'Tirage horizontal (poulie basse)', 'strength', '{back}', '{biceps}', '{gym}', 'beginner'),
  ('ex-t-bar-row', 'Rowing T-bar', 'strength', '{back}', '{biceps}', '{gym}', 'intermediate'),
  ('ex-one-arm-dumbbell-row', 'Rowing haltère unilatéral', 'strength', '{back}', '{biceps}', '{gym}', 'beginner'),
  ('ex-face-pull', 'Face pull', 'strength', '{shoulders}', '{back}', '{gym}', 'beginner'),
  -- Shoulders
  ('ex-overhead-press', 'Développé militaire', 'strength', '{shoulders}', '{triceps}', '{gym}', 'intermediate'),
  ('ex-arnold-press', 'Développé Arnold', 'strength', '{shoulders}', '{triceps}', '{gym}', 'intermediate'),
  ('ex-lateral-raise-db', 'Élévation latérale haltères', 'hypertrophy', '{shoulders}', '{}', '{gym}', 'beginner'),
  ('ex-front-raise', 'Élévation frontale', 'hypertrophy', '{shoulders}', '{}', '{gym}', 'beginner'),
  ('ex-rear-delt-fly', 'Oiseau (deltoïde postérieur)', 'hypertrophy', '{shoulders}', '{back}', '{gym}', 'beginner'),
  -- Biceps
  ('ex-barbell-curl', 'Curl barre', 'hypertrophy', '{biceps}', '{}', '{gym}', 'beginner'),
  ('ex-dumbbell-curl', 'Curl haltères', 'hypertrophy', '{biceps}', '{}', '{gym}', 'beginner'),
  ('ex-hammer-curl', 'Curl marteau', 'hypertrophy', '{biceps}', '{}', '{gym}', 'beginner'),
  ('ex-preacher-curl', 'Curl pupitre', 'hypertrophy', '{biceps}', '{}', '{gym}', 'intermediate'),
  ('ex-concentration-curl', 'Curl concentration', 'hypertrophy', '{biceps}', '{}', '{gym}', 'beginner'),
  -- Triceps
  ('ex-skull-crusher', 'Extension triceps allongé (skull crusher)', 'hypertrophy', '{triceps}', '{}', '{gym}', 'intermediate'),
  ('ex-triceps-pushdown', 'Extension triceps à la poulie', 'hypertrophy', '{triceps}', '{}', '{gym}', 'beginner'),
  ('ex-triceps-dip', 'Dips (triceps)', 'strength', '{triceps}', '{chest}', '{gym}', 'intermediate'),
  ('ex-overhead-triceps-extension', 'Extension triceps nuque', 'hypertrophy', '{triceps}', '{}', '{gym}', 'beginner'),
  -- Quads
  ('ex-leg-press', 'Presse à cuisses', 'strength', '{quads}', '{glutes}', '{gym}', 'beginner'),
  ('ex-leg-extension', 'Leg extension', 'hypertrophy', '{quads}', '{}', '{gym}', 'beginner'),
  ('ex-front-squat', 'Squat avant', 'strength', '{quads}', '{core,glutes}', '{gym}', 'advanced'),
  ('ex-lunge', 'Fentes avant', 'strength', '{quads}', '{glutes,hamstrings}', '{gym}', 'beginner'),
  ('ex-bulgarian-split-squat', 'Fente bulgare', 'strength', '{quads}', '{glutes}', '{gym}', 'intermediate'),
  ('ex-goblet-squat', 'Squat gobelet', 'strength', '{quads}', '{glutes,core}', '{kettlebell}', 'beginner'),
  -- Hamstrings
  ('ex-romanian-deadlift', 'Soulevé de terre roumain', 'strength', '{hamstrings}', '{glutes,back}', '{gym}', 'intermediate'),
  ('ex-leg-curl-machine', 'Leg curl machine', 'hypertrophy', '{hamstrings}', '{}', '{gym}', 'beginner'),
  ('ex-good-morning', 'Good morning', 'strength', '{hamstrings}', '{back,glutes}', '{gym}', 'advanced'),
  -- Glutes
  ('ex-hip-thrust', 'Hip thrust barre', 'strength', '{glutes}', '{hamstrings,core}', '{gym}', 'intermediate'),
  ('ex-glute-bridge', 'Pont fessier', 'strength', '{glutes}', '{hamstrings}', '{}', 'beginner'),
  ('ex-cable-kickback', 'Kickback à la poulie', 'hypertrophy', '{glutes}', '{}', '{gym}', 'beginner'),
  -- Calves
  ('ex-standing-calf-raise', 'Mollets debout', 'hypertrophy', '{calves}', '{}', '{gym}', 'beginner'),
  ('ex-seated-calf-raise', 'Mollets assis', 'hypertrophy', '{calves}', '{}', '{gym}', 'beginner'),
  -- Core
  ('ex-planche', 'Planche', 'mobility', '{core}', '{shoulders}', '{}', 'beginner'),
  ('ex-side-plank', 'Planche latérale', 'mobility', '{core}', '{}', '{}', 'beginner'),
  ('ex-hanging-leg-raise', 'Relevé de jambes suspendu', 'strength', '{core}', '{}', '{gym}', 'intermediate'),
  ('ex-russian-twist', 'Rotation russe', 'strength', '{core}', '{}', '{}', 'beginner'),
  ('ex-ab-wheel', 'Roue abdominale', 'strength', '{core}', '{shoulders}', '{gym}', 'advanced'),
  ('ex-cable-woodchop', 'Woodchop à la poulie', 'functional', '{core}', '{shoulders}', '{gym}', 'intermediate'),
  -- Functional / full body
  ('ex-burpee', 'Burpees', 'functional', '{full_body}', '{}', '{}', 'beginner'),
  ('ex-thruster', 'Thruster', 'functional', '{full_body}', '{quads,shoulders}', '{gym}', 'intermediate'),
  ('ex-clean-and-press', 'Épaulé-jeté', 'functional', '{full_body}', '{shoulders}', '{gym}', 'advanced'),
  ('ex-farmers-carry', 'Farmer''s walk', 'functional', '{full_body}', '{core,back}', '{gym}', 'beginner'),
  ('ex-box-jump', 'Box jump', 'functional', '{quads}', '{glutes,calves}', '{gym}', 'intermediate'),
  ('ex-mountain-climber', 'Mountain climbers', 'functional', '{core}', '{quads}', '{}', 'beginner')
on conflict (id) do nothing;
