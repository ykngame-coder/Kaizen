# SUPOTSU

Plateforme **Sport + Santé + Bien-être** — « excellente pour comprendre et
décider ». Monorepo mobile-first (Expo + React Native + Supabase).

> État : **Étape 1 — Fondations**. Monorepo, design system, contrats des moteurs,
> schéma de base de données (avec RLS) et coquille applicative navigable.
> L'authentification, les données réelles et l'IA arrivent aux étapes suivantes.

## Prérequis

- Node ≥ 20, pnpm ≥ 10
- (Optionnel) Docker, pour la base de données Supabase locale

## Installation

```bash
pnpm install
```

## Commandes

| Commande                                   | Effet                                 |
| ------------------------------------------ | ------------------------------------- |
| `pnpm typecheck`                           | Vérifie les types (tout le workspace) |
| `pnpm lint`                                | ESLint                                |
| `pnpm test`                                | Tests unitaires (Vitest)              |
| `pnpm --filter @supotsu/mobile start`      | Lance l'app Expo                      |
| `pnpm --filter @supotsu/mobile export:web` | Bundle web statique                   |
| `pnpm db:start`                            | Démarre Supabase en local (Docker)    |

## Structure

Voir [`docs/architecture.md`](docs/architecture.md) pour l'architecture détaillée
et le mapping avec le cahier des charges.

```
apps/mobile      application Expo
packages/*       design-system, ui, core, engines, shared, database
supabase/        migrations SQL + RLS
```
