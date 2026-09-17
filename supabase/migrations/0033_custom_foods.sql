-- ---------------------------------------------------------------------------
-- Aliments personnalisés (Open Food Facts ne connaît pas tous les codes-barres).
--
-- Retour utilisateur : certains codes-barres scannés sont absents d'OFF. On
-- ne recopie jamais leur base chez nous (elle serait tout aussi vide pour ces
-- produits précis, et poserait une question de licence ODbL) — on laisse
-- juste l'utilisateur renseigner le produit une fois, pour tout le monde.
--
-- Partagée à la lecture (esprit collaboratif d'OFF) ; en écriture, seulement
-- l'ajout d'un nouveau code-barres par son auteur — pas de correction d'une
-- fiche existante par un autre utilisateur pour l'instant, pour rester simple
-- et éviter le vandalisme sans mise en place de modération.
-- ---------------------------------------------------------------------------
create table public.custom_foods (
  barcode text primary key,
  description text not null,
  kcal numeric not null check (kcal >= 0),
  protein_g numeric check (protein_g >= 0),
  carb_g numeric check (carb_g >= 0),
  fat_g numeric check (fat_g >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.custom_foods enable row level security;

create policy "custom_foods are readable by authenticated users"
  on public.custom_foods for select
  to authenticated
  using (true);

create policy "custom_foods are insertable by their author"
  on public.custom_foods for insert
  to authenticated
  with check (created_by = auth.uid());
