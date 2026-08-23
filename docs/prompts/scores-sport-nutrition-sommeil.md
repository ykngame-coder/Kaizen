# Prompt — Refonte des scores (Sport, Nutrition dans le global, Sommeil)

> Note : le score de sommeil avec **régularité + dette** existe déjà
> (`computeSleepScore2` dans `sleep.ts`, utilisé par l'écran Sommeil). Ce prompt
> ne fait que s'assurer qu'il est utilisé partout, et crée le reste.

```
Objectif : refondre l'agrégation des scores de Kaizen Supotsu. 3 chantiers.
Tout se passe dans des moteurs PURS (packages/engines/src), testés (Vitest),
sans UI ni persistance. Chaque score retourne un EngineResult<number> avec
`confidence` (high/medium/to_confirm selon la couverture de données) et, quand
pertinent, une Explanation {observation, analysis, action}. On renormalise
toujours sur les composantes réellement disponibles (règle « aucune boîte
noire » — ne jamais gonfler un score quand une donnée manque).

CONTEXTE (code existant à réutiliser, ne pas réécrire) :
- packages/engines/src/scoring.ts : computePerformanceScore, computeConsistencyScore
  (= régularité, jours actifs/7), computeTrainingLoadScore (ACWR), buildDailySnapshot.
- packages/engines/src/progression.ts : summarizeTrend, trendSlopePerDay, weightTrend,
  computeGoalProgress (helpers de tendance).
- packages/engines/src/recovery.ts : computeRecoveryScore.
- packages/engines/src/sleep.ts : computeSleepScore2 (quantité/qualité/régularité/
  dette/récup — DÉJÀ complet) ; l'ancien computeSleepScore (durée+efficacité) est obsolète.
- packages/engines/src/nutrition.ts : computeNutritionScore(entries, targets, asOf),
  estimateTargets, sumDay.
- packages/core/src/score.ts : OVERALL_SCORE_WEIGHTS.

============================================================
CHANTIER 1 — Score de PROGRESSION (à créer)
============================================================
Dans scoring.ts (ou progression.ts), ajoute :
  export function computeProgressionScore(activities: Activity[], asOf: ISODateString,
    sets?: MuscleWork[]/* ou l'historique de séries dispo */): EngineResult<number>
Principe : mesurer si l'entraînement PROGRESSE dans le temps.
- Construis une série hebdomadaire de charge d'entraînement (activityLoad par
  semaine) sur ~6 semaines, et/ou une série de volume de musculation (reps×charge)
  par semaine à partir de l'historique de séries si disponible.
- Utilise trendSlopePerDay / summarizeTrend pour obtenir la pente.
- Mappe : pente positive → >50 (progression), plate → ~50, négative → <50.
  Ex. value = clamp(50 + pente_normalisée * 50). Choisis une normalisation stable
  (p. ex. variation % semaine sur semaine bornée).
- Confiance : ≥4 semaines de données → high ; 2-3 → medium ; sinon to_confirm.
- Explanation (obs/analyse/action) en français, ex. « Tes charges progressent de
  X %/semaine → surcharge progressive en place → continue ».

============================================================
CHANTIER 2 — Score SPORT (à créer)
============================================================
Dans scoring.ts, ajoute :
  export function computeSportScore(activities, asOf, sets?): EngineResult<number>
Moyenne pondérée, renormalisée sur le disponible, de :
  - Performance  (computePerformanceScore)   poids 0.40
  - Régularité   (computeConsistencyScore)    poids 0.30
  - Progression  (computeProgressionScore)    poids 0.30
Définis ces poids dans packages/core/src/score.ts :
  export const SPORT_SCORE_WEIGHTS = { performance: 0.4, regularity: 0.3, progression: 0.3 }.
NB : l'ACWR (computeTrainingLoadScore) reste une MÉTRIQUE affichée à part, pas
dans le score sport (éviter le double comptage). Retourne confidence = min des
sous-confiances présentes + Explanation synthétique.

============================================================
CHANTIER 3 — Score SUPOTSU global (recomposer)
============================================================
Dans packages/core/src/score.ts, remplace OVERALL_SCORE_WEIGHTS par un modèle
à 4 piliers (ajustables) :
  export const OVERALL_SCORE_WEIGHTS = { sport: 0.30, recovery: 0.25, sleep: 0.25, nutrition: 0.20 }.
Dans scoring.ts, modifie buildDailySnapshot pour composer le score global à partir de :
  - Sport      = computeSportScore(...)
  - Récupération = computeRecoveryScore(healthMetrics)   (déjà là)
  - Sommeil    = computeSleepScore2(healthMetrics, asOf, 7, sessions)  ← IMPORTANT :
                 utilise computeSleepScore2 (régularité + dette incluses), pas l'ancien.
  - Nutrition  = computeNutritionScore(entries, targets)
Renormalise sur les piliers dont la confiance != 'to_confirm' (un pilier sans
données ne compte pas, comme aujourd'hui pour la récup). Étends la signature de
buildDailySnapshot pour recevoir nutritionEntries + nutritionTargets (ou un
nutritionScore déjà calculé) et sleepSessions ; expose dans DailySnapshot les
sous-scores { sport, recovery, sleep, nutrition } en plus de overall + acwr +
recommendation. Garde recommendation explicable.

Nettoyage : si l'ancien computeSleepScore (durée+efficacité seule) n'est plus
utilisé nulle part, retire-le (ou marque-le @deprecated) ; vérifie qu'aucun écran
n'affiche un score sommeil « pauvre ».

============================================================
UI (câblage minimal)
============================================================
- DashboardScreen.tsx : passe activités + santé + entries nutrition + targets +
  sessions à buildDailySnapshot. Affiche le score Supotsu global recomposé et,
  idéalement, la ventilation Sport / Récup / Sommeil / Nutrition.
- SportScreen.tsx : affiche le nouveau score Sport (anneau) avec sa ventilation
  performance / régularité / progression.
- Vérifie que le score sommeil affiché vient bien de computeSleepScore2.

============================================================
TESTS & QUALITÉ
============================================================
- Ajoute des tests Vitest : computeProgressionScore, computeSportScore, et
  buildDailySnapshot recomposé (piliers présents/absents → renormalisation,
  bornes 0-100, confidences). Mets à jour les tests existants impactés.
- Lance : pnpm typecheck && pnpm lint && pnpm test  (tout doit être vert).
- pnpm --filter @supotsu/mobile export:web pour valider le bundling.

RÈGLES PROJET :
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change (nouveaux scores affichés) → fais un APERÇU VISUEL du Dashboard
  et du hub Sport après coup.

POIDS PAR DÉFAUT (ajustables) :
- Global : Sport 0,30 · Récup 0,25 · Sommeil 0,25 · Nutrition 0,20
- Sport : Performance 0,40 · Régularité 0,30 · Progression 0,30
```
