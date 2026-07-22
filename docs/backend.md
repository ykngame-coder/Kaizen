# Brancher le backend Supabase réel

Par défaut l'app tourne en **mode démo** (données locales, aucun serveur). Pour
passer sur un vrai backend Supabase :

## 1. Créer le projet

1. Va sur [supabase.com](https://supabase.com) → **New project**.
2. Note l'**URL du projet** et la clé **anon** (Project Settings → API).
   Ce sont des clés **publiques côté client** (safe à embarquer dans l'app).
   Ne jamais committer la clé **service_role**.

## 2. Appliquer les migrations

Dans le **SQL Editor** de Supabase, exécute dans l'ordre le contenu de :

1. `supabase/migrations/0001_init.sql` (tables, RLS, triggers)
2. `supabase/migrations/0002_seed_and_constraints.sql` (bibliothèque d'exercices + index)
3. `supabase/migrations/0003_nutrition_habits.sql` (nutrition, habitudes, badges + RLS)
4. `supabase/migrations/0004_community_marketplace.sql` (défis, programmes, RLS + fonction classement)
5. `supabase/migrations/0005_connector_accounts.sql` (jetons connecteurs OAuth ; voir `connectors-garmin.md`)

> Alternative CLI : `supabase link` puis `supabase db push`.

## 3. Configurer l'app

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Renseigne dans `apps/mobile/.env` :

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Expo charge automatiquement les variables `EXPO_PUBLIC_*`. Au prochain
lancement, l'app bascule en **mode Supabase** (le bandeau « démo » disparaît,
auth + RLS réels).

## 4. Authentification

- **Email/mot de passe** : activé par défaut. En dev, tu peux désactiver la
  confirmation e-mail (Authentication → Providers → Email → « Confirm email »
  off) pour te connecter immédiatement. En prod, laisse-la active : l'app gère
  l'état « confirme ton e-mail ».
- **Apple / Google** : à configurer dans Authentication → Providers, puis les
  deep links natifs (étape ultérieure).

## 5. Vérifier de bout en bout

Un script vérifie le schéma + la RLS contre ton vrai projet (confirmation e-mail
désactivée requise pour ce test) :

```bash
node scripts/verify-backend.mjs "$EXPO_PUBLIC_SUPABASE_URL" "$EXPO_PUBLIC_SUPABASE_ANON_KEY"
```

Il crée deux utilisateurs de test, vérifie que chacun ne voit que ses données,
que l'insertion cross-utilisateur est bloquée par la RLS, et que la
bibliothèque d'exercices est lisible. Sortie attendue : `✅ Backend OK`.

## Régénérer les types (optionnel)

Une fois la base en place, tu peux remplacer les types écrits à la main :

```bash
pnpm db:types   # supabase gen types typescript --local
```
