-- Make Push Pull Legs and Prépa Hyrox visible in the real-backend catalogue
-- (RLS on public.programs only allows select where published — 0034). The
-- other 3 legacy catalogue programs stay unpublished: several of their own
-- session templates reference exercise ids that were never seeded server-side
-- either, and fixing those is out of scope here.
update public.programs set published = true where id in ('prog-ppl', 'prog-hyrox-prep');
