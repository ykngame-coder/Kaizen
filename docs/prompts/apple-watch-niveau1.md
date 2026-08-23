# Prompt — App Apple Watch (Niveau 1, compagnon « suivre sa séance »)

> À garder pour la phase **post-TestFlight**. Structuré pour ajouter le Niveau 2
> (fréquence cardiaque HealthKit) plus tard sans tout refaire.

```
Objectif (POST-TESTFLIGHT — ne pas démarrer tant que l'app iPhone n'est pas
stabilisée) : ajouter une app Apple Watch COMPAGNON à Kaizen Supotsu pour SUIVRE
UNE SÉANCE au poignet. Niveau 1 : la montre reçoit la séance prévue depuis
l'iPhone, affiche exercices/séries, permet de cocher les séries et lance un
minuteur de repos, puis renvoie la séance réalisée à l'iPhone qui l'enregistre.
PAS de réseau sur la montre, PAS encore de HealthKit workout (prévu Niveau 2).

RÉALITÉ TECHNIQUE (à cadrer d'emblée) :
- watchOS ne fait pas de React Native : l'app Watch est un projet NATIF Swift +
  SwiftUI. Aucun code UI partagé avec l'app RN.
- On ajoute une CIBLE watchOS au projet iOS Expo via un config plugin
  (recommandé : @bacons/apple-targets ; vérifie l'état de l'art au moment de
  l'implémentation). Nécessite prebuild / dev build EAS (déjà en place).
- Communication montre ↔ iPhone : WatchConnectivity (WCSession) — côté RN via
  react-native-watch-connectivity, côté watch en Swift (WCSession natif).

============================================================
0) CONTEXTE À RÉUTILISER (côté iPhone, existant)
============================================================
- repository : listPlannedWorkouts(userId), addWorkout(userId, { name, sets:
  [{ exerciseId, order, reps, weightKg }] }), setWorkoutStatus(...).
- Catalogue d'exercices : packages/shared/src/exercises.ts (id + name).
- « Séance du jour » / planning : SportScreen, sport/planning.

============================================================
1) CONTRAT DE DONNÉES (partagé phone ↔ watch, versionné)
============================================================
Définis un payload JSON stable, ex. :
  WatchSession {
    id: string; name: string; version: 1;
    exercises: [{ exerciseId?: string; name: string;
      sets: [{ reps?: number; weightKg?: number; done: boolean }] }]
  }
  WatchSessionResult {
    id: string;
    exercises: [{ exerciseId?: string; name: string;
      sets: [{ reps?: number; weightKg?: number; done: boolean }] }];
    finishedAt: string;
  }
Phone→Watch : WatchSession (séance prévue). Watch→Phone : WatchSessionResult
(ce qui a été coché / ajusté).

============================================================
2) CÔTÉ iPHONE (React Native)
============================================================
- Ajoute react-native-watch-connectivity + un module
  apps/mobile/src/features/watch/watchBridge.ts :
    - sendSessionToWatch(session: WatchSession)
    - onWatchResult(cb: (r: WatchSessionResult) => void)  // s'abonne aux retours
    - isWatchReachable()
- UI : depuis « Séance du jour » / planning, bouton « Envoyer à la Apple Watch »
  (visible seulement si une montre est appairée/reachable). Mappe le workout
  prévu → WatchSession.
- À la réception d'un WatchSessionResult : convertis en séries et enregistre via
  addWorkout(userId, { name, sets }) (rattache exerciseId ; ignore les séries non
  cochées ou marque le statut). Feedback à l'utilisateur (« Séance importée de la
  Watch »).
- Dégradation propre si pas de montre (bouton masqué, aucun crash ; web non concerné).

============================================================
3) CÔTÉ WATCH (SwiftUI, natif)
============================================================
Structure minimale, pensée pour évoluer vers le Niveau 2 :
- WCSession (délégué) : reçoit WatchSession, envoie WatchSessionResult.
- Vues SwiftUI :
    - SessionView : titre + liste des exercices, progression (X/Y séries).
    - ExerciseView : lignes de séries ; tap = cocher « done » ; ajuste reps/charge
      à la Digital Crown ; bouton « Repos » lançant un RestTimerView.
    - RestTimerView : compte à rebours (ex. 60/90/120 s), haptique en fin (WKInterfaceDevice).
    - Fin de séance → envoie WatchSessionResult à l'iPhone.
- État local sur la montre pendant la séance (pas de persistance réseau).
- Prépare l'emplacement pour HKWorkoutSession + fréquence cardiaque (Niveau 2),
  sans l'implémenter (commentaire TODO clair).
- Icône/nom de l'app Watch cohérents avec l'app iPhone.

============================================================
4) BUILD / PIPELINE (à documenter dans docs/watch.md)
============================================================
- Config plugin pour la cible watchOS ; bundle identifier de l'app Watch
  (ex. com.supotsu.app.watchkitapp) ; provisioning/signature via EAS.
- Note : l'app Watch a sa propre soumission/traitement TestFlight — documente
  la marche à suivre (build EAS iOS incluant la cible watch, submit).
- docs/watch.md : architecture, contrat de données, comment tester au simulateur
  (paire iPhone+Watch) et sur device.

============================================================
QUALITÉ & RÈGLES
============================================================
- Côté RN : pnpm typecheck && pnpm lint && pnpm test verts ; le mapping
  WatchSession/Result (pur) est testé (Vitest).
- Côté Swift : compile sans warning dans Xcode ; teste au simulateur Watch appairé.
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- Nouvelle surface visuelle → APERÇU (captures du simulateur Watch : liste séance,
  détail exercice, minuteur de repos).
- Portée = Niveau 1 uniquement. Ne pas ajouter réseau standalone ni HealthKit
  workout (chantiers ultérieurs).
```
