# Restructuration de la navigation en 3 hubs (Sport, Sommeil, Nutrition)

## Objectif

Remplacer la barre du bas actuelle (Accueil · Entraînements · Santé · Progression · Profil) par
cinq onglets — **Accueil · Sport · Sommeil · Nutrition · Profil** — où la première page de
chaque hub est un **mini-accueil vivant** (résumé avec de vraies données, pas un menu), et les
écrans détaillés restent accessibles depuis ce mini-accueil.

**Règle non négociable :** l'Accueil global (`(tabs)/index.tsx` / `DashboardScreen`) ne change
pas — ni son contenu, ni son comportement. Note de portée : quand un écran cible déplacé par ce
projet (ex. `/habits` → `/profile/habits`, `/muscles` → `/sport/muscles`) est lié depuis
l'Accueil, la chaîne de route dans `DashboardScreen.tsx` doit être mise à jour pour que le lien
continue de fonctionner — ce n'est pas un changement de contenu/comportement de l'Accueil, juste
la maintenance mécanique nécessaire pour ne pas casser un lien existant.

## Contexte découvert pendant le brainstorming

Deux écrans existants sont déjà, presque mot pour mot, ce que "mini-accueil vivant" veut dire :

- **`TrainingScreen`** (aujourd'hui `/training`) : ring de récupération, stats de la semaine,
  historique — déjà un résumé vivant, pas un menu.
- **`SleepScreen`** (aujourd'hui `/sleep`, jusqu'ici un écran de *détail* lié depuis "Santé") :
  score de sommeil sur 100, durée + sommeil profond, 7 dernières nuits en barres, heure de
  coucher optimale, conseil du jour, détail du score, **carte Phases de sommeil déjà codée**
  (`PhasesCard`, alimentée par `SleepSession.deepMin/lightMin/remMin/awakeMin`), prévision
  d'énergie du lendemain, signaux HRV/FC repos/Stress.

`NutritionScreen` (déjà mini-accueil) et `TrainingScreen` ont juste besoin d'extensions
ciblées. `SleepScreen`, lui, est promu au rang de mini-accueil du hub Sommeil — c'est le plus
gros morceau du projet mais il consiste surtout à **déplacer et compléter de l'existant**, pas
à écrire un nouvel écran de zéro.

En revanche, `SanteScreen` (le catch-all actuel "Santé") disparaît : son contenu est réparti
entre Sommeil, Sport, Nutrition et Profil (détail ci-dessous), et le fichier est supprimé.

## Hors scope (explicitement)

Une référence visuelle partagée pendant le brainstorming (écran de sommeil très riche : SpO2,
température nocturne, répartition par position de sommeil, mouvements, moteur de corrélation
avec alcool/caféine, records de sommeil, conseils personnalisés) **n'est pas construite dans ce
projet**. Décision explicite de l'utilisateur : rester sur une version plus sobre maintenant.
Détail de ce qui est/n'est pas faisable :

- Position pendant le sommeil et mouvements détaillés : **pas d'API HealthKit publique** pour
  ça — probablement jamais faisable via Apple Santé.
- SpO2, température nocturne : de vraies métriques HealthKit, faisables dans un futur projet.
- Analyse de corrélation, records de sommeil, conseils personnalisés : nouveau sous-système à
  concevoir séparément (nécessiterait par ex. le suivi de l'alcool/caféine, absent aujourd'hui).

La seule extension de données incluse dans ce projet : faire produire des `SleepSession`
(avec détail par phase) à la synchro HealthKit native, au lieu de la seule durée totale — décrit
plus bas.

## Approche : réorganisation en groupes de routes imbriqués

Chaque hub devient un dossier avec son propre `Stack` imbriqué sous `(tabs)/`, pour que
`useSegments()` sache "je suis dans Sport" même en survolant un écran de détail (`/sport/muscles`)
— bénéfice concret : la barre du bas peut désormais surligner le bon onglet sur ces pages, ce
qu'elle ne fait pas aujourd'hui (les écrans de détail vivent hors de `(tabs)/`).

### Arborescence cible

```
(tabs)/
  index.tsx                     Accueil — INCHANGÉ
  sport/
    _layout.tsx                 Stack
    index.tsx                   ← était training.tsx (mini-accueil Sport, voir plus bas)
    activities.tsx               ← déplacé depuis app/activities.tsx
    muscles.tsx, muscle-progress.tsx, records.tsx, exercises.tsx,
    load.tsx, calendar.tsx, planning.tsx, photos.tsx    ← déplacés depuis app root
    exercise/[id].tsx, workout/[id].tsx, workout/new.tsx,
    activity/new.tsx            ← déplacés depuis app root
  sommeil/
    _layout.tsx                 Stack
    index.tsx                   ← était sleep.tsx / SleepScreen, promu mini-accueil
    breathing.tsx, circadian.tsx, neuro-recovery.tsx,
    bilateral.tsx, sound.tsx, wellness.tsx   ← déplacés depuis app root
  nutrition/
    _layout.tsx                 Stack
    index.tsx                   ← était nutrition.tsx, + carte Poids & composition
    weight.tsx, journal.tsx     ← déplacés depuis app root
    food/search.tsx, food/scan.tsx, meal/new.tsx   ← déplacés depuis app root
  profile/
    _layout.tsx                 Stack
    index.tsx                   ← était profile.tsx, contenu inchangé + nouvelles entrées
    edit.tsx                    ← déplacé depuis app/profile/edit.tsx
    connectors.tsx, integrations.tsx, data-quality.tsx, import.tsx,
    community.tsx, marketplace.tsx, challenge/new.tsx,
    habits.tsx, habit/new.tsx, goals.tsx,
    progression.tsx             ← était (tabs)/progression.tsx, ALLÉGÉ (voir plus bas)
    notifications.tsx, settings.tsx, support.tsx   ← déplacés depuis app root

Reste partagé / hors dossier de hub (utilisé depuis plusieurs hubs) :
  health/[metric].tsx           fiche détail par métrique, liée depuis le hub où elle est
                                 pertinente (hrv/stress principalement depuis Sommeil, vo2max
                                 principalement depuis Sport) — reste une route partagée, pas
                                 la propriété exclusive d'un hub
  comprendre/index.tsx, comprendre/[id].tsx   articles tagués par Pillar, liés contextuellement
  search.tsx                    ouvert depuis les icônes recherche de plusieurs hubs
```

`sante.tsx` et l'ancien `SanteScreen.tsx` sont supprimés (contenu réparti ci-dessous).
`(tabs)/activities.tsx` et `(tabs)/nutrition.tsx` (fichiers plats actuels) sont remplacés par
leurs équivalents dans les nouveaux dossiers.

### Barre du bas

`AppTabBar.tsx` : `TABS` passe à 5 entrées — `index`, `sport`, `sommeil`, `nutrition`, `profile`
— avec les chemins `/sport` et `/sommeil`. La détection du tab actif (`segments[1] ?? 'index'`)
fonctionne sans changement avec les nouveaux dossiers imbriqués.

`(tabs)/_layout.tsx` : les 8 `Tabs.Screen` plats sont remplacés par 5 groupes.

**Icônes** — passage de glyphes emoji-texte à de vraies icônes vectorielles pour 4 des 5 onglets
(le reste de l'app garde ses emoji ; changement scopé à la barre du bas). `@expo/vector-icons`
est déjà présent (dépendance transitive d'`expo`), aucun package à ajouter :

| Onglet | Avant | Après |
|---|---|---|
| Accueil | `◎` (texte) | `MaterialIcons` `dashboard` |
| Sport | `⚡` (texte) | `MaterialCommunityIcons` `dumbbell` |
| Sommeil | `♥` (texte) | `MaterialIcons` `bedtime` |
| Nutrition | `◍` (texte) | `MaterialCommunityIcons` `food-apple` |
| Profil | `☰` (texte) | inchangé |

Teinte dynamique actif/inactif conservée (mêmes couleurs `colors.primary`/`colors.textSubtle`
qu'aujourd'hui, passées en prop `color` aux composants d'icône).

## Contenu du mini-accueil Sport

Base : `TrainingScreen` existant, réordonné et complété (aucune réécriture from scratch).

1. **Séance prévue aujourd'hui** — même donnée que la carte "Prochaine séance" de l'Accueil
   (workout planifié le plus proche), reformulée pour le jour même, avec action principale
   Commencer / Planifier.
2. **État du corps** — ring de récupération globale (`computeRecoveryScore`, déjà présent) **+**
   silhouette `MuscleBody` colorée par muscle (réutilise le `colorFor` déjà utilisé sur
   `/sport/muscles`), côte à côte.
3. **3 dernières activités** — séances + activités fusionnées (pas seulement les séances comme
   aujourd'hui), triées par date, lien vers l'historique complet (`/sport/activities`).
4. Le reste, inchangé dans l'esprit : stats de la semaine (séances, temps, calories, RPE), puis
   deux nouvelles tuiles compactes **Charge (ACWR)** et **VO2 Max** à côté du ring de
   récupération (valeurs seules, pas de graphique — le détail complet reste dans `/sport/load`
   et la fiche métrique VO2 Max), puis les sections existantes (Planification, Calendrier,
   Programmes, Récupération musculaire, Records, Exercices, Progression musculaire).
5. Carte **Comprendre** contextuelle (voir mécanisme commun plus bas) et carte **Objectifs**
   filtrée sur les types performance/strength/endurance.

## Contenu du mini-accueil Sommeil

Base : `SleepScreen` existant, promu en page d'accueil du hub, réordonné, complété avec les
signaux qui vivaient dans "Santé" (stress, bien-être mental) et les outils de relaxation.

Ordre final :

1. **Score de sommeil** (ring 0-100, durée + sommeil profond) — inchangé de `SleepScreen`.
2. **Stress + Bien-être mental** — nouvelles tuiles de stats rapides (stress existe déjà comme
   `HealthMetricType` ; bien-être mental vient de `computeWellnessIndex`/`wellnessBand`, déjà
   utilisés ailleurs via `useWellnessCheckins`).
3. **7 dernières nuits** (barres) — inchangé de `SleepScreen`.
4. **Phases de sommeil** — `PhasesCard`, déjà codée, déjà alimentée par `SleepSession` pour les
   données importées (Health Auto Export). Voir extension pipeline HealthKit ci-dessous pour
   que la synchro native alimente aussi cette carte.
5. **Coucher optimal** (chronotype) — inchangé de `SleepScreen`.
6. **Conseil du jour** — inchangé de `SleepScreen` (`sleepExplanation`/`sleepCoaching`).
7. **Détail du score** + **Prévision de demain** — conservés mais repoussés en fin de page
   (contenu plus analytique, moins "coup d'œil" que les 6 premières cartes).
8. **Rythme circadien** — carte dédiée (déjà présente dans `SleepScreen`, lien vers
   `/circadian`).
9. **Outils de récupération** — grille : Respiration, Neuro-récupération, Sons (Rythme
   circadien sort de cette grille puisqu'il a sa propre carte au point 8).
10. Carte **Comprendre** contextuelle (pilier `sleep`/`recovery`/`understanding`) et carte
    **Objectifs** filtrée sur le type `health` lié au sommeil.

### Extension pipeline requise (seule extension de données de ce projet)

`packages/connectors/src/appleHealth.ts` : ajouter une fonction `aggregateHealthKitSleepSessions`
(à côté de `aggregateHealthKitSleep`, sans le modifier) qui groupe les mêmes échantillons de
catégorie sommeil par nuit mais **conserve** le détail par stade (`deepMin`/`lightMin`/`remMin`/
`awakeMin`) au lieu de tout fusionner en une seule durée — produit un `SleepSession` par nuit,
même forme que ce que le chemin d'import fichier (Health Auto Export) produit déjà.

`apps/mobile/src/features/connectors/healthKitClient.ios.ts` : appelle aussi cette nouvelle
fonction et inclut les `sleepSessions` dans le payload persisté (`useImportHealth` accepte déjà
ce champ). Tests unitaires à ajouter dans `appleHealth.test.ts`, même style que l'existant.

## Contenu du mini-accueil Nutrition

Base : `NutritionScreen` existant, un seul ajout.

- Nouvelle carte **Poids & composition** (poids, masse grasse, masse musculaire + variation 7
  jours — même données que la carte "Corps & récupération" de l'Accueil) insérée après la carte
  Nutrition Score, lien vers `/nutrition/weight` pour l'historique complet.
- Carte **Comprendre** contextuelle (pilier `nutrition`) et l'**Objectifs** existant de
  `NutritionScreen` reste tel quel (déjà scopé nutrition).

## Comprendre & Objectifs éclatés par pilier (mécanisme commun aux 3 hubs)

Aucune nouvelle UI de gestion à construire — les deux écrans partagés existants sont réutilisés,
seulement **filtrés** :

- **Comprendre** : `articlesByPillar()` (déjà utilisé par `LearnScreen`) groupe déjà les
  articles par `Pillar` (`sleep`, `recovery`, `performance`, `nutrition`, `habits`,
  `understanding`, `decision`). Chaque hub affiche une petite carte avec les articles de son/ses
  pilier(s), lien "Tout voir" vers `/comprendre` pour la bibliothèque complète.
- **Objectifs** : `GoalsScreen` (`/profile/goals`) garde toute la logique de gestion. Chaque hub
  affiche une carte compacte filtrée par `GoalType` pertinent (Sport : performance/strength/
  endurance ; Nutrition : body_composition ; Sommeil : health, sous-filtré sur les objectifs dont
  la métrique cible est liée au sommeil/HRV/stress), avec lien vers l'écran complet pour créer/
  éditer.

## Profil

Contenu existant (`ProfileScreen`) inchangé dans sa structure (compte, stats rapides, groupes
"Compte & données" / "Préférences"), mais :

- Chemins mis à jour vers les nouveaux emplacements imbriqués (`/connectors` →
  `/profile/connectors`, `/goals` → `/profile/goals`, `/notifications` → `/profile/notifications`,
  `/integrations` → `/profile/integrations`, `/settings` → `/profile/settings`).
- Nouvelles entrées `ListRow` : **Communauté** (`/profile/community`), **Marketplace**
  (`/profile/marketplace`), **Habitudes & discipline** (`/profile/habits`), **Bilan &
  badges** (`/profile/progression`), **Support** (`/profile/support`), **Qualité des
  données** (`/profile/data-quality`), **Importer un fichier** (`/profile/import`).

### Écran Progression → allégé en "Bilan & badges"

`ProgressionScreen` (déplacé vers `/profile/progression`) perd ce qui part par pilier :

- **Retiré** : Objectifs (éclaté), Records (déjà dans Sport via `TrainingScreen`), Photos
  d'évolution (rejoint Sport — progression physique).
- **Conservé** (contenu réellement transversal, pas rattachable à un seul pilier) : bilan 7
  jours (séances/sommeil/récup/poids), Rapport hebdomadaire, Statistiques, Tendances &
  corrélations, Badges, Comparaisons.

## Coach IA

`coach.tsx` reste joignable uniquement depuis l'Accueil (inchangé) — non demandé dans ce
projet, je n'y touche pas.

## Risques & validation

- **`typedRoutes` activé** (`app.json` : `experiments.typedRoutes: true`) spécifiquement parce
  que ce refactor déplace ~30 fichiers et touche toutes les chaînes `router.push`/`Href` qui les
  ciblent (Accueil, Support, chaque hub, etc.) — sans ça, un lien cassé ne se voit qu'en cliquant
  dans l'app puisque les routes sont aujourd'hui de simples chaînes non typées. Effet de bord
  accepté : toute autre `Href` mal typée ailleurs dans l'app remontera aussi en erreur `tsc`, à
  nettoyer au passage.
- Après le déplacement des fichiers, auditer par recherche texte toutes les occurrences des
  anciens chemins (`/training`, `/sante`, `/muscles`, `/sleep`, `/weight`, `/breathing`,
  `/circadian`, `/neuro-recovery`, `/bilateral`, `/sound`, `/wellness`, `/records`, `/exercises`,
  `/muscle-progress`, `/load`, `/calendar`, `/planning`, `/photos`, `/activities`, `/journal`,
  `/food/search`, `/food/scan`, `/meal/new`, `/connectors`, `/integrations`, `/data-quality`,
  `/import`, `/community`, `/marketplace`, `/habits`, `/goals`, `/notifications`, `/settings`,
  `/support`, `/profile/edit`) dans tout `apps/mobile/src` et `apps/mobile/app`, y compris
  `SupportScreen.tsx` (lien vers l'ancien `/sante`) et `DashboardScreen.tsx` (lien vers
  `/progression`, `/muscles`, `/nutrition`, `/habits` — ces chemins-là restent valides tels
  quels sauf `/muscles`→`/sport/muscles` et `/habits`→`/profile/habits`).
- Empty states : réutiliser les patterns `EmptyState` déjà présents (ex. `SleepScreen` en a un)
  plutôt que d'en inventer de nouveaux.
- Après implémentation : `pnpm typecheck && pnpm lint && pnpm test` (couvre aussi les nouveaux
  tests `appleHealth.test.ts` pour `aggregateHealthKitSleepSessions`), `pnpm --filter
  @supotsu/mobile export:web` pour confirmer que le build web n'est pas cassé par la
  réorganisation de routes, puis parcours manuel de chaque hub et de chaque écran déplacé
  (aucun test end-to-end existant dans ce repo pour la navigation).

## Références visuelles

Maquettes explorées pendant le brainstorming (structure du mini-accueil Sommeil) :
`.superpowers/brainstorm/1847-1785802305/content/sommeil-hub-v2.html` (version retenue comme
point de départ, avant la découverte que `SleepScreen` couvrait déjà la majorité du contenu).
