-- Metadata parity for the new "Push Pull Legs" catalogue program (slug shared
-- with packages/shared/programs.ts, same convention as 0004's seed). Content
-- (sessionTemplates) lives client-side in the bundled catalogue, same as
-- every other program here — this row only makes the id/title/description
-- resolvable if that program is ever surfaced through the real backend.
-- published defaults to false, same as every other program today.
insert into public.programs (id, title, author, focus, level, weeks, sessions_per_week, description, price_cents)
values
  ('prog-ppl', 'Push Pull Legs', 'Coach Supotsu', 'strength', 'intermediate', 8, 3,
    'Split Push/Pull/Legs à la barre et aux haltères — un cycle complet par semaine.', 0)
on conflict (id) do nothing;
