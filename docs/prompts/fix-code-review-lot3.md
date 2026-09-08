# Prompt — Correctifs code-review (lot 3) : couche d'import santé

> Findings d'une revue ciblée sur les connecteurs / import santé. Concerne
> `packages/connectors/src`. Complémentaire de :
> - `objectif-sommeil-reglable.md` (dédup dette/régularité côté MOTEUR) — le #1
>   ci-dessous corrige la même famille de bug côté IMPORT ; les deux ensemble
>   règlent le double-comptage du sommeil.
> - `fix-code-review-lot2.md` (notes/atomicité séance, pagination, nutrition).

```
Corrige les points suivants dans la couche d'import santé (packages/connectors/src).
Fonctions PURES + testées (Vitest), aucun réseau/UI. i18n non concerné.

============================================================
#1 — SOMMEIL compté en double entre sources HealthKit   [🔴 correctness]
============================================================
Fichier : packages/connectors/src/appleHealth.ts (~L166, aggregateHealthKitSleep
+ aggregateHealthKitSleepSessions).
Constat : ces fonctions ADDITIONNENT les échantillons de sommeil de TOUTES les
sources. Si une même nuit a Apple Watch + une autre app (AutoSleep, Garmin→Apple
Santé), on somme ~7h + ~7h = ~14h, deep/light/rem doublés. C'est le même
double-comptage multi-sources déjà corrigé pour les PAS (cumulativeSum), jamais
appliqué au sommeil.
À faire :
- Avant d'agréger, FUSIONNER les intervalles de sommeil qui se CHEVAUCHENT
  (union d'intervalles sur l'axe temps), toutes sources confondues, puis sommer
  la durée de l'UNION (pas la somme brute par source). Idem pour la répartition
  par stade (deep/light/rem/awake) : un instant couvert par 2 sources ne compte
  qu'une fois.
- Tests : une nuit présente en double (2 sources qui se chevauchent) → durée ≈
  celle d'UNE nuit, pas la somme ; nuits réellement distinctes → inchangées.

============================================================
#2 — dedupActivities jette une 2e activité LÉGITIME   [🔴 data loss]
============================================================
Fichier : packages/connectors/src/dedup.ts (~L25, isDuplicate/dedupActivities).
Constat : critère « doublon » = même type + même jour (UTC) + durée à ±10%/120s.
→ deux courses de 30 min le même jour (matin + soir), ou une session déjà stockée
+ une nouvelle proche, → la 2e est SUPPRIMÉE. Perte de vraies données.
À faire :
- Resserre le critère de doublon : exiger un CHEVAUCHEMENT temporel réel
  (heures de début proches, ex. < 5-10 min d'écart) et/ou une même source, au lieu
  de « même jour + durée proche ». Deux sessions distinctes le même jour doivent
  être CONSERVÉES.
- Tests : 2 courses distinctes le même jour → 2 conservées ; vrai doublon
  (même source, même créneau) → 1.

============================================================
#3 — Hydratation rejetée : plage en litres alors que tout est en ml   [🟠]
============================================================
Fichier : packages/connectors/src/quality.ts (~L41, HEALTH_RANGES.hydration).
Constat : la plage est [0,10] (litres), mais TOUS les producteurs émettent des ml
(2000, 3000…). validateHealthMetric rejette donc toute hydratation réelle
(3000 > 10). Latent aujourd'hui (importFromConnector n'est exercé que par les
tests) mais faux sans ambiguïté, cohérence ml partout ailleurs.
À faire :
- Passe la plage hydration en ml (ex. [0, 10000]). Vérifie l'unité attendue par
  validateHealthMetric pour ce type et aligne-la sur 'ml' (comme nutrition
  hydrationMl, saveNutritionToHealthKit, SHORTCUT_METRIC_UNITS).
- Test : 3000 ml accepté ; valeurs aberrantes (>10000) rejetées.

============================================================
QUALITÉ & RÈGLES
============================================================
- pnpm typecheck && pnpm lint && pnpm test verts (ajoute les tests cités,
  notamment sur appleHealth.test.ts / dedup / quality).
- pnpm --filter @supotsu/mobile export:web OK.
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- Pas d'apparence modifiée (couche données) → pas d'aperçu requis, sauf si un écran
  d'import affiche des totaux (alors vérifier qu'ils ne sont plus doublés).

RAPPEL : la dédup du sommeil côté MOTEUR (dette + régularité) est dans
objectif-sommeil-reglable.md ; le #1 ci-dessus corrige la couche IMPORT. Les deux
sont nécessaires pour éliminer complètement le double-comptage du sommeil.
```
