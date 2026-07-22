-- SUPOTSU — Étape 8 : comptes connecteurs (OAuth) — Garmin en premier
-- Sécurité (Master Prompt P8, P29, P38):
--   * les jetons OAuth ne sont JAMAIS lisibles par le client. RLS n'ouvre aucune
--     lecture aux utilisateurs ; seule la clé service_role (Edge Function) écrit
--     et lit les jetons.
--   * le client connaît uniquement l'état de connexion, via une fonction
--     SECURITY DEFINER qui n'expose pas les secrets.

create table public.connector_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('garmin', 'strava', 'polar', 'coros', 'fitbit', 'oura', 'withings')),
  -- The provider's own user id, used to route push webhooks back to our user.
  external_user_id text,
  access_token text,
  access_token_secret text,
  status text not null default 'active' check (status in ('pending', 'active', 'revoked', 'error')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index connector_accounts_external_idx
  on public.connector_accounts (provider, external_user_id);

create trigger connector_accounts_set_updated_at
  before update on public.connector_accounts
  for each row execute function public.set_updated_at();

-- RLS enabled with NO policy for authenticated: the token row is entirely
-- server-managed. Clients cannot read, write, or delete it. Connecting and
-- disconnecting both go through the Garmin Edge Function (service_role), which
-- also (de)registers the user with Garmin. A profile deletion cascades here.
alter table public.connector_accounts enable row level security;

-- Client-facing status only (no secrets), scoped to the caller.
create or replace function public.my_connectors()
returns table (provider text, status text, connected_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select provider, status, connected_at
  from public.connector_accounts
  where user_id = auth.uid();
$$;

grant execute on function public.my_connectors() to authenticated;
