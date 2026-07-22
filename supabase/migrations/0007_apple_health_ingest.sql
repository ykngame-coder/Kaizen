-- SUPOTSU — Apple Santé via Raccourcis iOS (webhook gratuit, sans build de dev)
-- Un Raccourci iOS lit les données santé et les POST à une Edge Function. Pour
-- identifier l'utilisateur sans jeton OAuth, on utilise un « ingest token »
-- long-lived, généré par l'app et collé dans le Raccourci. Il n'autorise QUE
-- l'ingestion santé de ce compte.

-- 1) autoriser le provider 'apple_health'.
alter table public.connector_accounts
  drop constraint if exists connector_accounts_provider_check;
alter table public.connector_accounts
  add constraint connector_accounts_provider_check
  check (provider in ('garmin', 'strava', 'polar', 'coros', 'fitbit', 'oura', 'withings', 'apple_health'));

-- 2) jeton d'ingestion (illisible côté client via la table ; renvoyé seulement
--    par la fonction de création ci-dessous).
alter table public.connector_accounts
  add column if not exists ingest_token text;

create unique index if not exists connector_accounts_ingest_token_idx
  on public.connector_accounts (ingest_token)
  where ingest_token is not null;

-- 3) créer / faire tourner le jeton du Raccourci pour l'utilisateur courant.
--    SECURITY DEFINER : écrit la ligne et renvoie le jeton à son propriétaire.
create or replace function public.create_apple_health_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.connector_accounts (user_id, provider, status, ingest_token, connected_at)
  values (auth.uid(), 'apple_health', 'active', v_token, now())
  on conflict (user_id, provider)
  do update set ingest_token = excluded.ingest_token, status = 'active', connected_at = now();
  return v_token;
end;
$$;

grant execute on function public.create_apple_health_token() to authenticated;
