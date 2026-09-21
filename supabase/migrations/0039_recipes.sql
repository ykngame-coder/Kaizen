-- supabase/migrations/0039_recipes.sql
-- ---------------------------------------------------------------------------
-- Recettes calculées : un panier d'ingrédients (macros figées à l'ajout,
-- jamais une référence live vers Open Food Facts) dont les macros pour 100 g
-- se recalculent à la lecture — jamais stockées, pour ne jamais diverger
-- d'une édition à l'autre.
--
-- Même schéma de visibilité que user_sessions/user_session_exercises :
-- privée par défaut, publique lisible par tous, écriture réservée à l'auteur.
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_idx on public.recipes (user_id);
create index recipes_visibility_idx on public.recipes (visibility);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  barcode text,
  description text not null,
  kcal_per100g numeric not null check (kcal_per100g >= 0),
  protein_g_per100g numeric check (protein_g_per100g >= 0),
  carb_g_per100g numeric check (carb_g_per100g >= 0),
  fat_g_per100g numeric check (fat_g_per100g >= 0),
  quantity_g numeric not null check (quantity_g > 0),
  "order" smallint not null default 0
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy "recipes readable when public or own"
  on public.recipes for select
  to authenticated
  using (visibility = 'public' or auth.uid() = user_id);

create policy "recipes writable by owner"
  on public.recipes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recipe_ingredients readable via parent recipe"
  on public.recipe_ingredients for select
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and (r.visibility = 'public' or r.user_id = auth.uid())
    )
  );

create policy "recipe_ingredients writable via parent recipe"
  on public.recipe_ingredients for all
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()));
