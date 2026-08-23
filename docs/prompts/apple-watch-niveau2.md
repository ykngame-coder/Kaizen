# Prompt — App Apple Watch (Niveau 2, séance live + HealthKit)

> À exécuter **après le Niveau 1** (`apple-watch-niveau1.md`). Réutilise la même
> cible watchOS, le même `WCSession` et les mêmes vues SwiftUI — on y ajoute le
> suivi physiologique en temps réel.

```
Objectif : passer l'app Apple Watch de Kaizen Supotsu du Niveau 1 (afficher/cocher
une séance) au Niveau 2 : SÉANCE LIVE avec HealthKit — fréquence cardiaque en
temps réel, calories actives, chrono, exécution en arrière-plan et écran allumé
en permanence, puis synthèse renvoyée à l'iPhone et enregistrée dans Apple Santé.
Ne pas casser le Niveau 1. Pas de réseau standalone sur la montre.

PRÉREQUIS : Niveau 1 en place (cible watchOS, WCSession phone↔watch, vues
SessionView / ExerciseView / RestTimerView, contrat WatchSession/WatchSessionResult).

============================================================
1) DROITS & CONFIG (cible watchOS)
============================================================
- Ajoute la capability HealthKit à la cible Watch + le background mode
  "workout-processing".
- Chaînes d'usage : NSHealthShareUsageDescription (lecture FC/énergie) et
  NSHealthUpdateUsageDescription (écriture de la séance) — FR, claires — sur
  l'app Watch (et l'app iPhone si besoin), via le config plugin.
- Demande l'autorisation HealthKit au premier lancement de séance ; dégrade
  proprement si refusée (la séance reste utilisable sans métriques live).

============================================================
2) SÉANCE LIVE (SwiftUI + HealthKit, sur la montre)
============================================================
- HKWorkoutSession + HKLiveWorkoutBuilder :
    - activityType adapté (functionalStrengthTraining pour la muscu ; garde une
      map si d'autres types de séances arrivent) ; locationType .indoor par défaut.
    - start / pause / resume / end ; gère l'état (WKExtendedRuntime / background).
- Métriques live affichées pendant la séance (écran allumé en permanence, mode
  always-on compatible) :
    - Fréquence cardiaque (bpm) en direct
    - Calories actives
    - Chrono de séance
    - (garde la progression des séries du Niveau 1 dans la même vue ou un onglet)
- Haptiques aux moments clés (fin de repos existante, début/fin de séance).
- À la fin : HKLiveWorkoutBuilder.finishWorkout → HKWorkout sauvegardé dans
  Apple Santé (source = l'app). Récupère la synthèse : durée, FC moyenne, FC max,
  calories.

============================================================
3) CONTRAT DE DONNÉES (étendre le Niveau 1)
============================================================
Étends WatchSessionResult avec un bloc metrics optionnel :
  metrics?: {
    durationSec: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    activeKcal?: number;
    startedAt: string; endedAt: string;
  }
Watch→Phone : envoie WatchSessionResult (séries cochées) + metrics à la fin.

============================================================
4) CÔTÉ iPHONE (React Native)
============================================================
- watchBridge.ts (existant) : traite metrics dans onWatchResult.
- Enregistre la séance comme au Niveau 1 (addWorkout). Pour les métriques :
    ⚠️ ÉVITER LE DOUBLE COMPTAGE — l'app iPhone importe déjà HealthKit
    (auto-sync + miroir). Si la séance est déjà écrite dans Apple Santé par la
    montre, laisse le pipeline HealthKit existant la remonter, OU attache
    explicitement les metrics à l'activité créée et dédoublonne par
    startedAt+durationSec. Choisis UNE source de vérité et documente-la.
- Affiche la synthèse (FC moy/max, calories, durée) sur le détail de séance.

============================================================
5) (OPTIONNEL) Complication de démarrage rapide
============================================================
- Complication watchOS "Lancer ma séance du jour" (si une séance est reçue de
  l'iPhone). Ne pas bloquer le Niveau 2 dessus.

============================================================
QUALITÉ & RÈGLES
============================================================
- La FC live ne se teste PAS au simulateur → valider sur un vrai Apple Watch.
- Côté RN : pnpm typecheck && pnpm lint && pnpm test verts (mapping metrics pur, testé).
- Côté Swift : compile sans warning ; session workout stable (pause/reprise/fin,
  passage en arrière-plan, verrouillage d'écran).
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- Mets à jour docs/watch.md (métriques, autorisations, source de vérité anti-doublon).
- Nouvelle surface visuelle → APERÇU (écran séance live : FC, calories, chrono).
- Vérifie la cohérence App Privacy / politique de confidentialité : la lecture/
  écriture HealthKit sur la montre doit être reflétée (déjà déclarée pour l'iPhone —
  confirmer qu'elle couvre la Watch).
```
