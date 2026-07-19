# Architecture SUPOTSU

SUPOTSU est une plateforme Sport + Santé + Bien-être. Ce document décrit
l'architecture technique du monorepo et son alignement avec le cahier des
charges (Master Prompt, 52 parties).

## Principes directeurs

- **Clean Architecture + Feature-First + DDD** : une couche ne dépend jamais
  d'une couche supérieure.
- **Engines découplés de l'UI** : les moteurs de calcul communiquent uniquement
  par interfaces (`packages/engines`), orchestrés par le `DecisionEngine`. Aucun
  moteur ne connaît React/React Native.
- **Provenance des données** : chaque donnée porte `source`, `origin`
  (measured/calculated/estimated/proprietary), `reliability` et un horodatage,
  et n'est jamais écrasée (insert-per-measurement).
- **Explicabilité** : toute recommandation porte `Observation → Analyse →
Action` + un niveau de confiance (`high | medium | to_confirm`).
- **Propriété des données** : Row Level Security propriétaire-seul sur toutes les
  tables utilisateur.
- **Offline-first, dark-mode prioritaire, rien de purement décoratif.**

## Stack

| Couche                | Techno                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| Mobile                | Expo + React Native + Expo Router + TypeScript                                          |
| Styling               | NativeWind (Tailwind) + design tokens partagés                                          |
| Données / formulaires | TanStack Query, Zod, React Hook Form                                                    |
| Backend               | Supabase (Postgres + Auth + Storage + Realtime + RLS) + Edge Functions (moteurs lourds) |
| Qualité               | TypeScript strict, ESLint, Prettier, Vitest, Turborepo                                  |

Décision d'architecture : **backend hybride** — Supabase couvre nativement
DB/Auth/Storage/Realtime/secrets ; les Edge Functions hébergeront la logique
lourde des Engines. L'abstraction Engines/connecteurs permet de migrer vers une
infra conteneurisée (K8s) au besoin, sans reconstruction.

## Structure du monorepo

```
apps/
  mobile/            Expo (Expo Router), features/ par domaine
packages/
  design-system/     tokens (couleurs dark-first, typo, spacing) + preset Tailwind
  ui/                composants RN pilotés par les tokens + ThemeProvider
  core/              entités de domaine (types purs)
  engines/           interfaces des moteurs + EngineRegistry (contrats)
  shared/            schémas Zod, constantes, types d'événements
  database/          factory client Supabase + types générés
supabase/
  migrations/        schéma SQL (tables Phase 1 + RLS)
docs/
```

## Mapping cahier des charges → code

| Master Prompt                                     | Implémentation (Étape 1)                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| P1 piliers, provenance                            | `packages/core/common.ts` (`Pillar`, `DataOrigin`, `Measurement`) |
| P2 Engines par interfaces, Decision orchestrateur | `packages/engines` (`contracts.ts`, `registry.ts`)                |
| P8/P32/P51 modèle de données                      | `packages/core/*`, `supabase/migrations/0001_init.sql`            |
| P10/P34 scores + pondérations                     | `packages/core/score.ts` (`OVERALL_SCORE_WEIGHTS`)                |
| P13 Recovery Score / Training Readiness           | `RecoveryEngine` (contrat)                                        |
| P16.6/P23.9 système d'événements                  | `packages/shared/events.ts`                                       |
| P18.9/P21.15 explicabilité + confiance            | `packages/engines/result.ts` (`Explanation`, `EngineResult`)      |
| P28/P47 design system + dark mode                 | `packages/design-system`, `packages/ui/theme.tsx`                 |
| P7/P17 navigation 5 sections                      | `apps/mobile/app/(tabs)`                                          |
| P15/P29 RLS + propriété des données               | RLS dans la migration (owner-only)                                |

## Ordre de construction (roadmap)

1. **Étape 1 — Fondations** (fait) : monorepo, design system, contrats
   d'Engines, schéma DB + RLS, coquille app.
2. **Étape 2** : authentification (email/Apple/Google/biométrie) + onboarding.
3. **Étape 3** : dashboard câblé, activités, entraînements.
4. **Étape 4** : Supotsu AI (moteurs, recommandations, adaptation).
5. **Étape 5** : connecteurs (Apple Health, Garmin, Strava).
6. **Étape 6** : nutrition, communauté, coach, marketplace.

## Démarrer

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # qualité
pnpm --filter @supotsu/mobile start        # app Expo
pnpm --filter @supotsu/mobile export:web   # bundle web statique
```

Base de données locale (Docker requis) :

```bash
pnpm db:start   # supabase local
pnpm db:types   # régénère packages/database/src/generated/database.types.ts
```
