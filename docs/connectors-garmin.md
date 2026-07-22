# Connecteur Garmin (réel)

Garmin utilise **OAuth 1.0a** et un modèle **push** (Garmin envoie les données à
un webhook). Le secret Garmin ne doit jamais être dans l'app : toute la logique
vit dans une **Edge Function Supabase** (`supabase/functions/garmin/`).

## Ce qui est déjà codé (et testé)

- **Normalisation** des données Garmin → modèle Supotsu : `packages/connectors/src/garmin.ts` (tests unitaires avec vraies formes de payload).
- **Edge Function** OAuth + webhook + ingestion : `supabase/functions/garmin/index.ts`.
- **Table des jetons** `connector_accounts` (migration `0005`), jetons **illisibles côté client** (RLS sans policy de lecture ; état exposé via la fonction `my_connectors()`).
- **UI** : carte « Garmin Connect » dans _Mes appareils_ (Connecter / Déconnecter / état).

## Ce que tu dois faire (une fois)

### 1. Obtenir les identifiants Garmin

1. Va sur le **[Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/health-api/)** et demande l'accès à la **Health API** (validation manuelle par Garmin).
2. Une fois approuvé, tu obtiens un **Consumer Key** et un **Consumer Secret**.
3. Dans le portail Garmin, configure les **endpoints webhook** (voir étape 4).

### 2. Appliquer la migration

Dans le SQL Editor Supabase, exécute `supabase/migrations/0005_connector_accounts.sql`.

### 3. Déployer la fonction + secrets

```bash
supabase functions deploy garmin --no-verify-jwt
supabase secrets set \
  GARMIN_CONSUMER_KEY=xxxx \
  GARMIN_CONSUMER_SECRET=yyyy \
  GARMIN_CALLBACK_URL=https://<projet>.supabase.co/functions/v1/garmin/callback
```

> `--no-verify-jwt` : le webhook et le callback OAuth sont appelés par Garmin
> (sans JWT). L'authentification de l'utilisateur pour `/connect` et
> `/disconnect` est vérifiée **dans** la fonction via le token Supabase.

### 4. Enregistrer les webhooks côté Garmin

Dans le portail Garmin Health API, renseigne l'URL de **push** :

```
https://<projet>.supabase.co/functions/v1/garmin/push
```

et l'URL de **déenregistrement** (deregistration) :

```
https://<projet>.supabase.co/functions/v1/garmin/deregister
```

Active les types de résumés voulus : **activities, dailies, sleeps, hrv, bodyComps**.

### 5. Tester

Dans l'app → _Profil → Mes appareils → Garmin Connect → **Connecter Garmin**_.
Tu es redirigé vers Garmin pour autoriser ; au retour, l'état passe à
**Connecté**. À la prochaine synchro Garmin, tes activités et données santé
arrivent automatiquement (chaque donnée conserve `source = garmin`).

## Flux (rappel)

```
App ──/connect (JWT)──▶ Edge Fn ──request_token──▶ Garmin
App ◀── authorizeUrl ── Edge Fn
App ──ouvre l'URL──▶ Garmin (l'utilisateur autorise)
Garmin ──/callback(oauth_verifier)──▶ Edge Fn ──access_token+userId──▶ stocke les jetons
Garmin ──/push (nouvelles données)──▶ Edge Fn ──normalise──▶ tables activities/health_metrics (service_role)
```

## Sécurité

- Les jetons OAuth vivent uniquement dans `connector_accounts`, **jamais lisibles
  par le client** (vérifié : le rôle `authenticated` lit 0 ligne de jetons).
- Le client ne connaît que l'**état** (`my_connectors()`), pas les secrets.
- La déconnexion **déenregistre** l'utilisateur chez Garmin puis supprime les jetons.
