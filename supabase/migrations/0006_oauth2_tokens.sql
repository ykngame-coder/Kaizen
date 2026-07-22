-- SUPOTSU — Étape 8b : support OAuth 2.0 pour les connecteurs (Strava)
-- Strava (contrairement à Garmin/OAuth1) utilise des jetons OAuth 2.0 qui
-- expirent et se renouvellent. On ajoute le refresh token + l'échéance à la
-- table connector_accounts. Ces colonnes restent illisibles côté client (aucune
-- policy de lecture ; l'Edge Function service_role s'en sert seule).

alter table public.connector_accounts
  add column if not exists refresh_token text,
  add column if not exists token_expires_at timestamptz;

-- Store the source's own activity id so a repeated pull-sync (Strava) or a
-- re-delivered push (Garmin) never duplicates an activity.
alter table public.activities
  add column if not exists external_id text;

-- Plain unique index (not partial) so ON CONFLICT can target it. Postgres keeps
-- NULLs distinct, so manual activities (external_id null) are never constrained;
-- only real source ids must be unique per (user, source).
create unique index if not exists activities_external_idx
  on public.activities (user_id, source, external_id);
