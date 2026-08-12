# Mémo de session — Mac (à lire au démarrage)

> **But de ce fichier** : remplacer le `/resume` entre machines. L'historique de
> chat ne se synchronise **pas** d'une machine à l'autre. Ce mémo (versionné dans
> git) donne à n'importe quelle session Claude Code — Mac, PC, web — l'état du
> projet et la marche à suivre. Tiens-le à jour : c'est la mémoire partagée.

## En une phrase

**SUPOTSU** (repo `Kaizen`, package `supotsu`) — app Sport + Santé + Bien-être,
mobile-first (Expo SDK 54 / RN 0.81), monorepo pnpm + Turborepo, backend Supabase.
Philosophie : « aucune boîte noire » (toute reco = Observation → Analyse → Action +
niveau de confiance), dark-mode d'abord, offline-first.

## Répartition des rôles (important — évite la confusion)

| | Session **web/cloud** (chez Claude) | Session **Mac** (ici) |
|---|---|---|
| Rôle | Cerveau + mémoire : engines, doc, correctifs de bugs | Bras : commandes machine |
| Fait quoi | Code et **push** sur la branche | `git pull` + `eas build` / `eas submit` + Supabase |

La session web garde le fil de la conversation. Le Mac ne fait que **récupérer**
le travail et lancer ce qui a besoin d'un Mac / d'un compte Apple Developer.
En cas de doute sur « pourquoi ce choix », la réponse est dans la session web ou
dans les `docs/`.

## Se mettre à jour (à chaque début de session Mac)

```bash
git checkout claude/spot-wellness-app-r6l5bj
git pull origin claude/spot-wellness-app-r6l5bj
pnpm install
```

Vérifier que tout est vert avant de builder :

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @supotsu/mobile export:web   # bundling web OK = bundling mobile sain
```

## Où on en est (au 12/08/2026)

**Fait et poussé** — engines (muscles/récup, décision, sommeil, bien-être,
progression, analytics, charge ACWR, qualité de données, surcharge progressive,
recommandations, base de connaissances) ; écrans Sport / Sommeil / Nutrition /
Objectifs / Profil / Réglages / Analytics / Comprendre ; design system refondu
(anneaux multi-segments, silhouette anatomique) ; migrations `0001` → `0014` ;
OAuth Apple/Google ; déploiement web Vercel ; parseur **Health Auto Export**
validé sur un vrai export.

**Objectif courant** : tester l'app sur **2 iPhone distincts** (2 utilisateurs
test pour révéler les bugs) via **TestFlight**, avec un **vrai backend Supabase**
branché — un test « comme sur l'App Store ».

## Prochaines actions concrètes sur le Mac

Suivre, dans l'ordre :

1. **Brancher Supabase** → `docs/backend.md`
   - Créer le projet, appliquer les migrations `0001` → `0014` (SQL Editor ou
     `supabase db push`).
   - Vérifier de bout en bout :
     `node scripts/verify-backend.mjs "$URL" "$ANON_KEY"` → attendu `✅ Backend OK`
     (confirmation e-mail désactivée pendant ce test uniquement).
   - Injecter les clés dans le build EAS (`eas env:create` pour
     `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
     ⚠️ La clé **anon** est publique/safe. **Jamais** la clé `service_role`.

2. **Compiler + envoyer sur TestFlight** → `docs/testflight.md`
   - `eas build --platform ios --profile production`
   - `eas submit --platform ios --latest`
   - Ajouter les 2 testeurs (test interne = instantané).

3. **Faire tester** → `docs/test-checklist.md` (plan de chasse aux bugs).

4. **Correctifs** : remonter les bugs à la session web → j'implémente et je push →
   sur le Mac `git pull` puis re-build (`eas build` incrémente le numéro auto).

## Docs de référence

- `docs/backend.md` — Supabase + injection des clés dans EAS
- `docs/testflight.md` — build & envoi TestFlight pas à pas
- `docs/test-checklist.md` — checklist testeurs
- `docs/health-auto-export.md` — import santé (HRV, sommeil, activités)
- `docs/apple-health-build.md` — lecture HealthKit native (à venir)
- `docs/architecture.md` — vue d'ensemble, principes, mapping du cahier des charges
- `docs/deploy-web.md` — déploiement Vercel

## Règles projet (à respecter par toute session)

- Développer **uniquement** sur `claude/spot-wellness-app-r6l5bj`.
- **Toujours** `git pull --rebase` avant de push (plusieurs sessions poussent).
- Pas de PR sauf demande explicite.
- Ne jamais committer/utiliser la clé Supabase `service_role`.
- Quand l'apparence change, produire un **aperçu visuel**.
