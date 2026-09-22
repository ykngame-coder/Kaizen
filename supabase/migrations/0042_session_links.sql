-- SUPOTSU — Une séance faite dans l'app et l'activité que la montre en a gardée
--
-- Les deux décrivent le même effort mais vivent dans des tables différentes :
-- elles apparaissaient deux fois, et comptaient deux fois dans la charge. Le
-- rapprochement se fait au calcul (engines/sessionMatching) ; cette table ne
-- garde que ce que l'utilisateur a corrigé à la main.
--
--   'linked'   : rattache deux éléments que le calcul n'aurait pas réunis.
--   'separate' : les maintient distincts malgré leur recouvrement.

create table public.session_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  mode text not null check (mode in ('linked', 'separate')),
  created_at timestamptz not null default now(),
  -- Une seule décision par couple : la dernière remplace la précédente.
  unique (user_id, workout_id, activity_id)
);

create index session_links_user_idx on public.session_links (user_id);

alter table public.session_links enable row level security;

create policy "session_links are self-owned"
  on public.session_links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
