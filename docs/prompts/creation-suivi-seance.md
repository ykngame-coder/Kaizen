# Prompt — Améliorer la création ET le suivi de séance

> **Cibles visuelles** (maquettes d'intention à reproduire, dans `docs/prompts/assets/`) :
> - `creation-suivi-seance.png` — écran de création (prefill + suggestion de surcharge,
>   superset, ajout rapide) et suivi d'une série de force (log + repos auto, RPE, disques).
> - `suivi-amrap.png` — suivi d'un AMRAP (chrono proéminent, tours, cadence, mouvements à cocher).
> - `suivi-multibloc.png` — suivi d'une séance multi-blocs (échauffement → force → finisher AMRAP,
>   fil des blocs avec bloc actif).
> Ouvre ces images avant de commencer : elles fixent la direction visuelle (couleurs,
> densité, hiérarchie). Reproduis l'esprit avec les composants et tokens réels de l'app,
> pas au pixel.

> Style visé : **mix Fitbod (charges suggérées, échauffements guidés) + Garmin/
> CrossFit (blocs & timers, chrono proéminent)**. L'app a déjà : création en blocs
> (`sessionBuilder.ts`, `SessionBlocksEditor`), formats strength/AMRAP/EMOM/for-time,
> supersets, un runner live (`blockRunnerEngine.ts`, `workout/[id]/run.tsx`,
> `CircuitRunnerScreen`), FC de séance, et l'i18n (fr/en/es/pt/de). On AMÉLIORE
> l'existant, on ne repart pas de zéro. Toute nouvelle chaîne visible passe par t().

```
Objectif : améliorer la CRÉATION et le SUIVI de séance de Kaizen Supotsu.
Deux volets, réutiliser au maximum l'existant. Moteurs/maths purs et testés,
offline-first, i18n dès l'écriture (clés dans les 5 locales : fr/en/es/pt/de).

CONTEXTE (existant à réutiliser, NE PAS réécrire) :
- Création : apps/mobile/src/features/training/{sessionBuilder.ts (SetDraft{exerciseId,
  reps,weight,rest}, BlockDraft{format,timeCapSec,targetRounds,order,selected,
  supersetGroups}, useSessionBlocks, blocksToSessionInput), SessionBlocksEditor.tsx,
  NewWorkoutScreen.tsx, EditWorkoutScreen.tsx} ; marketplace/{SessionBuilderScreen,
  ProgramBuilderScreen}.
- Runner : training/blockRunnerEngine.ts (computeAmrap/Emom/ForTime, formatClock,
  supersetPartners) ; app/(tabs)/sport/workout/[id]/run.tsx ; CircuitRunnerScreen.tsx ;
  WorkoutDetailScreen.tsx.
- Données : repository.addWorkout(userId,{name,sets:[{exerciseId,order,reps,weightKg}]}),
  lastSessionSetsByExercise(userId) (DÉJÀ là → base du prefill), queries.ts hook associé.
- Progression : packages/engines/src/training.ts → suggestProgression (double
  progression) + contrat. À utiliser pour les suggestions.
- Modèle : packages/core/src/training.ts → SetEntry a déjà reps/weightKg/restSec/rpe
  + superset. Catalogue : exercises.data.json (873) / EXERCISE_BY_ID.

============================================================
VOLET A — CRÉATION
============================================================
A1. PREFILL INTELLIGENT + SUGGESTION (Fitbod-like)
- À l'ajout d'un exercice / ouverture du builder : pré-remplir reps/charge/repos
  depuis lastSessionSetsByExercise. Afficher, sous chaque exercice, une SUGGESTION
  issue de suggestProgression (ex. « Suggéré : 62,5 kg × 8 (+2,5) ») que l'user
  ACCEPTE d'un tap ou modifie. Distinguer clairement « prévu » vs « suggéré ».
- Jamais imposé : c'est une proposition éditable (prefill + suggestion, pas pilotage forcé).

A2. AJOUT D'EXERCICES PLUS RAPIDE
- Sélecteur d'exercices : recherche INSTANTANÉE sur le catalogue 873 (normalisée,
  sans accents), sections « Récents » (dérivés de l'historique) et « Favoris »
  (nouveau store persistant, ex. supotsu.favoriteExercises.<userId> ; étoile pour
  (dé)favoriser). AJOUT MULTIPLE : cocher plusieurs exercices puis « Ajouter » d'un coup.

A3. MODÈLES & DUPLICATION
- « Dupliquer » une séance passée → pré-remplit le builder (reprend blocs/séries).
- Petite BIBLIOTHÈQUE DE MODÈLES prêts à l'emploi (Full body, Push/Pull/Legs,
  Haut/Bas, un WOD type) comme points de départ. « Enregistrer comme modèle » pour
  ses propres séances. (Réutilise les patterns de packages/shared/src/programs.ts.)

A4. SUPERSET / CIRCUIT / BLOCS — UX plus claire
- Grouper en superset d'un tap (sélection multi-slots → « Grouper »), rendu visuel
  du groupe (accolade/bracket + couleur), dégrouper facilement.
- Sélecteur de format de bloc avec texte d'aide (strength/AMRAP/EMOM/for-time),
  réorganisation des slots par glisser, nombre de tours pour les circuits.
- S'appuyer sur SessionBlocksEditor + useSessionBlocks (ne pas dupliquer la logique).

============================================================
VOLET B — SUIVI (RUNNER)
============================================================
B1. LOG RÉEL + REPOS AUTO
- Cocher chaque série ; saisir reps/charge RÉELS en ligne (pré-remplis par le prévu).
- MINUTEUR DE REPOS qui démarre AUTOMATIQUEMENT à la validation d'une série
  (repos de la série, sinon défaut réglable) ; haptique + son en fin ; boutons
  +15 s / passer. Enregistre les séries réalisées (SetEntry : reps, weightKg, restSec).

B2. RÉFÉRENCE PRÉCÉDENTE + RPE/RIR
- Pour chaque exercice, afficher la perf de la DERNIÈRE FOIS (« Précédent : 60 kg × 8 »).
- Saisie d'effort par série : RPE (1-10) OU RIR (reps en réserve), AU CHOIX via un
  réglage (préférence effortMetric: 'rpe'|'rir'). SetEntry a déjà rpe → AJOUTER rir?
  (+ migration). Afficher/stocker selon le réglage.

B3. REPRISE & ÉCRAN ALLUMÉ + PROCHAIN
- expo-keep-awake pendant le run (à ajouter). PERSISTER la progression du run
  (séries cochées, minuteur) pour REPRENDRE une séance en cours après fermeture/
  crash (« Reprendre la séance »). Aperçu « Prochain : <exercice/série> ».

B4. BONUS
- CALCULATEUR DE DISQUES : pour une charge cible, afficher les disques par côté
  (réglages : poids de la barre + disques disponibles). Maths PURES + testées.
- SÉRIES D'ÉCHAUFFEMENT AUTO : à partir de la charge de travail, proposer une rampe
  d'échauffement (ex. ~40/60/80 % avec reps dégressives) ajoutable avant la 1re série
  de travail. AJOUTER un flag isWarmup? sur SetEntry/SetDraft (+ migration) pour
  distinguer échauffement vs séries comptabilisées. Maths PURES + testées.

============================================================
DONNÉES / MODÈLE / MOTEURS
============================================================
- Étendre SetEntry (+ SetDraft) : rir?, isWarmup? ; migration Supabase pour rir +
  is_warmup (les migrations vont jusqu'à ~0028 ; ajoute la suivante). Ne pas casser
  l'existant (colonnes nullable, valeurs par défaut).
- Préférences : effortMetric ('rpe'|'rir'), barWeightKg, availablePlates[], repos
  par défaut. Store favoris. Persistance de la progression de run.
- Logique pure & testée (Vitest) : suggestion (via suggestProgression), calcul de
  disques, rampe d'échauffement. Les moteurs restent purs (pas d'UI).

============================================================
QUALITÉ & RÈGLES
============================================================
- pnpm typecheck && pnpm lint && pnpm test verts (couvre disques, échauffement,
  prefill/suggestion, reprise).
- pnpm --filter @supotsu/mobile export:web pour valider le bundling.
- i18n : toutes les nouvelles chaînes via t(), remplies dans fr/en/es/pt/de.
- Tester sur device : repos auto, haptique, reprise après fermeture, écran allumé.
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change → APERÇU VISUEL : builder (prefill+suggestion, ajout rapide,
  superset) et runner (log+repos, ref précédente+RPE/RIR, calculateur de disques).

DÉCISIONS ACTÉES :
- Prefill + suggestion éditable (pas de pilotage forcé).
- Effort : RPE ou RIR au choix (réglage).
- Modèles : séances passées (dupliquer) + bibliothèque de modèles fournis.
- Bonus runner : calculateur de disques + échauffement auto (FC live déjà en place, non refaite ici).
- Style : mix Fitbod + Garmin/CrossFit.
```
