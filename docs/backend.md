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
6. `supabase/migrations/0006_oauth2_tokens.sql` (jetons OAuth2 + anti-doublon activités ; voir `connectors-strava.md`)
7. `supabase/migrations/0007_apple_health_ingest.sql` (Apple Santé via Raccourcis ; voir `apple-health-shortcut.md`)
8. `supabase/migrations/0008_records.sql` (records personnels / 1RM)
9. `supabase/migrations/0009_wellness_checkins.sql` (check-in bien-être mental)
10. `supabase/migrations/0010_goal_start_value.sql` (baseline des objectifs)
11. `supabase/migrations/0011_sleep_sessions.sql` (sessions de sommeil détaillées)
12. `supabase/migrations/0012_profile_avatar.sql` (avatar de profil)
13. `supabase/migrations/0013_user_programs.sql` (programmes suivis)
14. `supabase/migrations/0014_meditation_audio.sql` (audios de méditation)

> Applique-les **dans l'ordre**. À chaque nouvelle migration ajoutée au repo,
> exécute la ou les nouvelles sur ton projet.

> Alternative CLI (recommandée) : `supabase link --project-ref <ref>` puis
> `supabase db push` — applique automatiquement toutes les migrations dans l'ordre.

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

### EAS / TestFlight — un vrai test type App Store

Le `.env` local ne suffit pas pour un build **TestFlight** : les variables
doivent être présentes **au moment du build cloud**. La clé `anon` est publique
(safe à embarquer). Deux façons :

**A. Variables d'environnement EAS (recommandé — hors git)**
```bash
cd apps/mobile
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJhbGciOi..." --visibility plaintext
```
Puis `eas build --platform ios --profile production` (voir `testflight.md`).

**B. Dans `eas.json`** (plus simple, mais la clé anon apparaît dans le repo) :
```jsonc
// eas.json → build.production
"production": {
  "autoIncrement": true,
  "env": {
    "EXPO_PUBLIC_SUPABASE_URL": "https://xxxx.supabase.co",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOi..."
  }
}
```

> Pour un test « comme sur l'App Store » : laisse la **confirmation e-mail
> activée** (Authentication → Providers → Email), et configure une **URL de
> redirection** valide pour les liens de confirmation/OAuth (Authentication →
> URL Configuration). Chaque testeur crée un vrai compte ; la RLS garantit que
> chacun ne voit que ses données.

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
