# Connecteur Strava (réel, activable aujourd'hui)

Strava est le pont pragmatique pour les **activités** de ta Garmin : Garmin
Connect synchronise déjà tes séances vers Strava, et l'API Strava est **ouverte,
gratuite, self-service**. OAuth 2.0, logique côté serveur (Edge Function).

> Strava porte les **activités** (course, vélo, HR, distance…), **pas** le
> sommeil/HRV/stress. Pour ces métriques Garmin propriétaires, utilise l'export
> Garmin (à venir) ou l'API Garmin officielle quand elle rouvrira.

## Ce qui est déjà codé (et testé)

- Normalisation activités Strava → modèle Supotsu : `packages/connectors/src/strava.ts` (tests unitaires).
- Edge Function OAuth2 + sync : `supabase/functions/strava/index.ts`.
- Colonnes jetons OAuth2 + index anti-doublon : migration `0006`.
- UI : carte « Strava » dans _Mes appareils_ (Connecter / Synchroniser / Déconnecter).

## À faire (une fois, ~5 min)

### 1. Créer une app Strava

1. Va sur **[strava.com/settings/api](https://www.strava.com/settings/api)** (connexion avec ton compte Strava).
2. Crée une application : tu obtiens un **Client ID** et un **Client Secret**.
3. **Authorization Callback Domain** : mets le domaine de ta fonction, p. ex. `<projet>.supabase.co`.

### 2. Appliquer la migration

Dans le SQL Editor Supabase, exécute `supabase/migrations/0006_oauth2_tokens.sql`.

### 3. Déployer la fonction + secrets

```bash
supabase functions deploy strava --no-verify-jwt
supabase secrets set \
  STRAVA_CLIENT_ID=12345 \
  STRAVA_CLIENT_SECRET=xxxx \
  STRAVA_CALLBACK_URL=https://<projet>.supabase.co/functions/v1/strava/callback
```

### 4. Utiliser

Dans l'app → _Profil → Mes appareils → Strava → **Connecter Strava**_ → autorise
sur Strava → reviens → **Synchroniser**. Tes activités Strava (donc tes séances
Garmin) arrivent, chacune avec `source = strava`, dédupliquées à chaque synchro.

## Flux

```
App ──/connect (JWT)──▶ Edge Fn ──▶ URL d'autorisation Strava
App ──ouvre l'URL──▶ Strava (tu autorises)
Strava ──/callback(code,state)──▶ Edge Fn ──token──▶ stocke access+refresh+expiry
App ──/sync (JWT)──▶ Edge Fn ──(refresh si expiré)──▶ GET activities ──▶ upsert (anti-doublon)
```

## Sécurité

- Client secret + jetons uniquement côté serveur (`connector_accounts`), jamais lisibles par le client.
- Renouvellement automatique du jeton d'accès (OAuth2) via le refresh token.
- L'index unique `(user_id, source, external_id)` garantit qu'une re-synchro ne duplique aucune activité.
