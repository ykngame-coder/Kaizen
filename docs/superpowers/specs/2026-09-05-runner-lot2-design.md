# Lot 2 — Suivi de séance (runner) — design

**Date :** 2026-09-05
**Prérequis :** Lot 1 livré (modèle étendu, migration 0029, moteurs purs).
**Spec parente :** `docs/superpowers/specs/2026-09-05-session-creation-and-runner-design.md`

## Objectif

Faire passer le suivi de séance d'un affichage en lecture seule à un vrai
compagnon d'entraînement : cocher ses séries, saisir ce qu'on a réellement
fait, un repos qui démarre tout seul, et une séance qu'on peut reprendre là
où on l'a laissée.

Maquettes : `docs/prompts/assets/{creation-suivi-seance (panneau droit),
suivi-multibloc,suivi-emom,suivi-fortime}.png`.

## Découpage

Le lot couvre quatre écrans de maquette et six chantiers ; il se livre en
deux sous-lots pour ne pas tout remuer d'un coup.

| Sous-lot | Contenu | Ce que ça livre |
|---|---|---|
| **2a — Runner force** | Fondation de persistance, log par série, repos auto, référence précédente, RPE/RIR, disques, échauffement auto, badge d'adhésion, écran allumé, reprise | Le panneau droit de `creation-suivi-seance.png` |
| **2b — Formats chronométrés** | Refonte AMRAP / EMOM / For Time, fil des blocs multi-blocs, pause | `suivi-emom.png`, `suivi-fortime.png`, `suivi-multibloc.png` |

Ce document spécifie **2a** en détail et cadre 2b.

---

## Décisions structurantes

### D1 — Où vit l'état d'une séance en cours

C'est le point le plus risqué du lot : cet état doit survivre à une
fermeture de l'app, à un crash, et à un passage en arrière-plan.

L'état se sépare en deux natures, et chacune va là où elle appartient :

- **Les données de série** (reps et charge réalisées, effort, `completedAt`)
  partent **en base immédiatement**, à chaque validation. Ce sont de vraies
  données d'entraînement, pas de l'état d'écran : leur place est dans
  `workout_sets`, et `completedAt` a justement été ajouté au Lot 1 pour ça.
- **L'état d'écran éphémère** (temps écoulé, bloc actif, repos restant) va
  dans un **store local** `secureStorage`, clé `supotsu.runState.<workoutId>`.

Le bénéfice de cette séparation est qu'elle dégrade proprement : si le store
local est perdu (réinstallation, purge), la reprise fonctionne quand même —
la progression se reconstruit à partir des séries qui portent un
`completedAt`. Le store local n'est qu'une optimisation pour les minuteurs,
jamais la source de vérité de ce qui a été fait.

Une séance devient `in_progress` à l'entrée dans le runner. Rien ne pose ce
statut aujourd'hui — il n'existe que dans le `switch` d'affichage de
`WorkoutDetailScreen`, et le statut saute en pratique de `planned` à
`completed`. C'est précisément ce qui rend une séance en cours
irrécupérable après une fermeture.
La reprise se propose depuis la fiche de séance et l'accueil Sport dès qu'une
séance est `in_progress`.

### D2 — Minuteurs fondés sur l'horloge, pas sur les ticks

Le runner actuel fait `setElapsedSec((s) => s + 1)` toutes les secondes. C'est
faux dès que l'app passe en arrière-plan : iOS suspend les timers, et le
chrono prend du retard sans que rien ne le signale — un AMRAP de 12 minutes
peut en afficher 9.

Tous les minuteurs (temps écoulé, repos, minute EMOM) stockent donc un
**instant de référence** (`startedAtMs`, `restEndsAtMs`) et calculent leur
affichage par différence avec `Date.now()`. Le `setInterval` ne sert plus qu'à
rafraîchir l'affichage, plus à compter. Le retour au premier plan réaffiche
alors la valeur juste sans rattrapage.

### D3 — Les séries d'échauffement sont de vraies lignes

L'échauffement proposé par `warmupRamp` est **inséré comme de vraies séries**
(`is_warmup = true`) avant la première série de travail de l'exercice, pas
gardé en mémoire d'écran. Il survit ainsi à une reprise, s'affiche à
l'historique, et reste exclu du volume et de l'adhésion grâce au drapeau.

L'appelant filtre les marches plus légères que `barWeightKg` — le moteur ne
connaît pas le matériel (Lot 1, § 1.4).

### D4 — Nouvelle méthode de repository

Aucune méthode ne permet aujourd'hui de modifier une série individuelle. Le
runner en a besoin à chaque validation :

```ts
/** Enregistre ce qui a réellement été fait sur une série. Ne touche jamais planned_*. */
logSet(userId: string, setId: string, done: {
  reps?: number;
  weightKg?: number;
  rpe?: number;
  rir?: number;
  completedAt: string;
}): Promise<SetEntry>;

/** Ajoute des séries à une séance existante (rampe d'échauffement). */
addSetsToWorkout(userId: string, workoutId: string, sets: NewSetInput[]): Promise<SetEntry[]>;

/** Annule la validation d'une série (décochée par erreur). */
clearSetLog(userId: string, setId: string): Promise<SetEntry>;
```

Implémentées dans les deux dépôts (démo et Supabase), comme le reste.

---

## 2a — Runner force

### Écran

Reprend la structure du panneau droit de la maquette, avec les composants et
tokens existants :

1. **En-tête** — retour, nom de la séance, temps écoulé (D2).
2. **Exercice courant** — nom, « 2 / 3 séries », et la référence de la
   dernière fois (« Précédent : 60 kg × 8 · RPE 8 ») issue de
   `useExerciseHistory`. Absente si l'exercice n'a pas d'historique : la ligne
   disparaît, elle n'affiche pas un tiret.
3. **Liste des séries** — une ligne par série : case à cocher, numéro, champ
   reps, champ charge, état. Les lignes d'échauffement portent un libellé
   ambre. La série courante est mise en avant. Les champs sont pré-remplis
   avec le prévu et éditables.
4. **Effort** — sélecteur 1-10 sous la série active, libellé RPE ou RIR selon
   `effortMetric`.
5. **Repos** — carte avec compte à rebours circulaire, « démarré
   automatiquement », `+15 s` et « Passer ». Démarre à la validation d'une
   série, sur `restSec` de la série sinon `defaultRestSec`. Haptique à la fin.
6. **Disques** — pour la charge de la série active : `computePlates` avec
   `barWeightKg` et `availablePlates`. Masquée si la charge est absente ou
   sous le poids de la barre (haltères, poids du corps).
7. **Pied** — « Prochain : <exercice> » et bouton « Valider ».

### Comportements

**Valider une série** écrit reps/charge/effort et `completedAt` en base,
démarre le repos, et avance sur la série suivante. Décocher appelle
`clearSetLog` : la série redevient à faire, et le prévu reste intact puisque
`planned_*` n'a jamais été touché.

**Échauffement auto** : sur la première série de travail d'un exercice
chargé, une action propose la rampe ; l'accepter insère les séries (D3).
Jamais automatique sans geste de l'utilisateur — c'est une proposition, comme
la suggestion de charge du Lot 3.

**Écran allumé** : `expo-keep-awake` (déjà installé) actif pendant le run,
libéré à la sortie — même pattern `activateKeepAwakeAsync` /
`deactivateKeepAwake` que `SleepTrackingScreen`.

**Fin de séance** : passage en `completed`, purge du store local, et calcul du
badge d'adhésion.

### Badge d'adhésion

Sur la fiche d'une séance terminée, un badge « 92 % du plan » alimenté par
`computePlanAdherence`. Rien du tout quand la fonction retourne `undefined`
(séances antérieures à la 0029) — pas de « — », pas de 0 %.

Le ton suit le ratio : au moins 90 % en succès, au moins 70 % en neutre,
en dessous en avertissement. Un dépassement affiche « 120 % du plan » sans
tonalité négative : faire plus que prévu n'est pas un échec.

### Reprise

Une séance `in_progress` propose « Reprendre la séance ». À la reprise, le
runner recharge les séries depuis la base — celles qui portent `completedAt`
sont cochées — et lit le store local pour restaurer temps écoulé et bloc
actif. Store local absent : la séance reprend au premier exercice non
terminé, avec un chrono repartant de zéro. La progression réelle n'est jamais
perdue, seul le chrono l'est.

### Tests

Logique pure, extraite dans `runnerState.ts` (`apps/mobile/src/features/training/`) :

- reconstruction de la progression à partir des séries (quelle est la série
  active, l'exercice courant, le « prochain »),
- décision d'échauffement (proposé seulement sur une première série de travail
  chargée, marches sous la barre filtrées),
- calcul du repos restant à partir de `restEndsAtMs` (y compris un retour de
  l'arrière-plan après expiration),
- tonalité du badge d'adhésion aux bornes 90 % et 70 %.

Les composants d'écran ne sont pas testés unitairement (aucune infra de test
de rendu dans le repo aujourd'hui, et en installer une n'est pas au périmètre).

---

## 2b — Formats chronométrés (cadrage)

**AMRAP** — décompte proéminent, tours réalisés, mouvements à cocher,
cadence (temps moyen par tour). Maquette absente : construite par analogie
avec EMOM et For Time, à valider avant implémentation.

**EMOM** — « MINUTE 5 / 10 », décompte de la minute en cours, bande de
pastilles (faites / en cours / à venir), tâche de la minute à cocher, et un
état de repos jusqu'à la minute suivante une fois la tâche faite.

**For Time** — chrono qui monte, schéma affiché (21-15-9), round courant,
mouvements à cocher, objectif de temps optionnel.

**Multi-blocs** — écran de fil : barre de progression segmentée, blocs en
nœuds numérotés (terminé / en cours / à venir), résumé par bloc, « Continuer »
sur le bloc actif, « Passer au bloc suivant ».

**Pause** — commune aux quatre formats, elle suspend les minuteurs. Avec la
décision D2 (instants de référence), une pause se modélise en décalant
l'instant de référence à la reprise, pas en arrêtant un compteur.

## Hors périmètre

- La fréquence cardiaque live, déjà en place, n'est pas refaite (les
  maquettes l'affichent, c'est le comportement actuel).
- Pas de son de fin de repos : l'app n'a pas de canal audio pour les alertes
  courtes aujourd'hui, l'haptique suffit. À rouvrir si le besoin se confirme.
- Pas de test de rendu des composants.

## Contraintes globales

- Toute chaîne visible via `t()`, remplie dans fr/en/es/pt/de.
- Logique pure séparée des composants et testée.
- `planned_*` n'est jamais réécrit par le runner.
- Le runner doit fonctionner quand la migration 0029 n'est pas encore
  appliquée : les nouvelles colonnes reviennent `undefined`, la validation
  d'une série échoue alors proprement plutôt que de casser l'écran.
- Branche `claude/spot-wellness-app-r6l5bj`, `git pull --rebase` avant push.
