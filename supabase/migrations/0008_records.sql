-- SUPOTSU — Records personnels / 1RM (Master Prompt P3)
-- Records de force (1RM), course (meilleur 5 km…), pas, etc. Propriété stricte
-- (RLS owner-only) et dédup par identifiant source pour un import idempotent.

create table public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  external_id text,
  label text not null,
  category text not null check (category in ('run', 'strength', 'cycling', 'steps', 'other')),
  value numeric not null,
  unit text not null,
  source text not null default 'manual',
  achieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index records_user_achieved_idx on public.records (user_id, achieved_at desc);
create unique index records_external_idx on public.records (user_id, source, external_id);

create trigger records_set_updated_at
  before update on public.records
  for each row execute function public.set_updated_at();

alter table public.records enable row level security;

create policy "records are self-owned"
  on public.records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
