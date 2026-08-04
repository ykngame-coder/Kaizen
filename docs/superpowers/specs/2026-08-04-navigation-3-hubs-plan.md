# Plan d'implémentation — Restructuration navigation 3 hubs

Spec source : `docs/superpowers/specs/2026-08-04-navigation-3-hubs-design.md`. Ce plan découpe
le travail en phases séquentielles, chacune vérifiable indépendamment (`typecheck`/`lint`/`test`
après chaque phase plutôt qu'une seule fois à la fin), pour limiter le risque sur un refactor qui
déplace ~30 fichiers.

Convention : utiliser `git mv` pour chaque déplacement de fichier (préserve l'historique), jamais
`rm` + `Write` d'un nouveau fichier avec le même contenu.

## Phase 0 — Préparation

1. `apps/mobile/app.json` : passer `experiments.typedRoutes` à `true`.
2. Lancer `pnpm --filter @supotsu/mobile typecheck` immédiatement après pour voir la ligne de
   base des erreurs de route déjà existantes (s'il y en a, les lister à part — ne pas les
   confondre avec des régressions introduites par ce projet).
3. Vérifier `git status` propre avant de commencer les déplacements de fichiers (aucun travail
   en cours non commité qui pourrait se mélanger).

**Vérification** : `tsc --noEmit` tourne (peut avoir des erreurs de routes attendues à ce stade
tant que les dossiers n'existent pas encore — normal, on les corrige phase par phase).

## Phase 1 — Squelette des dossiers de hub (Stack layouts)

Créer les 4 fichiers de layout, chacun `<Stack screenOptions={{ headerShown: false }} />` (même
pattern que `app/(auth)/_layout.tsx`) :

- `apps/mobile/app/(tabs)/sport/_layout.tsx`
- `apps/mobile/app/(tabs)/sommeil/_layout.tsx`
- `apps/mobile/app/(tabs)/nutrition/_layout.tsx`
- `apps/mobile/app/(tabs)/profile/_layout.tsx`

Pas encore de déplacement de fichiers à cette étape — juste la structure vide.

## Phase 2 — Déplacement des fichiers de route (par hub, un hub à la fois)

Pour chaque hub, dans cet ordre (Sport, Sommeil, Nutrition, Profil) :

1. `git mv` chaque fichier listé dans la spec (section "Arborescence cible") vers son nouvel
   emplacement.
2. Corriger les imports relatifs à l'intérieur du fichier déplacé si besoin (la plupart
   importent déjà via l'alias `@/`, donc peu ou pas de changement attendu).
3. `git mv apps/mobile/app/activities.tsx apps/mobile/app/(tabs)/sport/activities.tsx` et
   supprimer l'ancien `apps/mobile/app/(tabs)/activities.tsx` (fichier plat existant, remplacé).
   Même chose pour `nutrition.tsx`.
4. Ne PAS toucher encore au contenu des composants (`TrainingScreen`, `SleepScreen`,
   `NutritionScreen`, `ProfileScreen`, etc.) — cette phase ne fait que déplacer les fichiers de
   route (`app/`), pas encore modifier `src/features/`.

**Détail Sport** — fichiers à déplacer vers `app/(tabs)/sport/` :
`muscles.tsx`, `muscle-progress.tsx`, `records.tsx`, `exercises.tsx`, `load.tsx`,
`calendar.tsx`, `planning.tsx`, `photos.tsx`, `exercise/[id].tsx`, `workout/[id].tsx`,
`workout/new.tsx`, `activity/new.tsx`, `activities.tsx` (remplace le fichier plat), et
`training.tsx` → renommé `index.tsx`.

**Détail Sommeil** — vers `app/(tabs)/sommeil/` :
`breathing.tsx`, `circadian.tsx`, `neuro-recovery.tsx`, `bilateral.tsx`, `sound.tsx`,
`wellness.tsx`, et `sleep.tsx` → renommé `index.tsx`. **Supprimer** `app/(tabs)/sante.tsx` et
`src/features/health/SanteScreen.tsx` (contenu absorbé ailleurs, voir phases suivantes).

**Détail Nutrition** — vers `app/(tabs)/nutrition/` :
`weight.tsx`, `journal.tsx`, `food/search.tsx`, `food/scan.tsx`, `meal/new.tsx`, et
`nutrition.tsx` (remplace le fichier plat) → renommé `index.tsx`.

**Détail Profil** — vers `app/(tabs)/profile/` :
`profile/edit.tsx` → `edit.tsx`, `connectors.tsx`, `integrations.tsx`, `data-quality.tsx`,
`import.tsx`, `community.tsx`, `marketplace.tsx`, `challenge/new.tsx`, `habits.tsx`,
`habit/new.tsx`, `goals.tsx`, `notifications.tsx`, `settings.tsx`, `support.tsx`, et
`(tabs)/progression.tsx` → `progression.tsx`, et `profile.tsx` (fichier plat) → `index.tsx`.

**Ne bougent pas** : `health/[metric].tsx`, `comprendre/index.tsx`, `comprendre/[id].tsx`,
`search.tsx` (restent à la racine `app/`, routes partagées).

**Vérification après chaque hub** : `pnpm --filter @supotsu/mobile typecheck` — avec
`typedRoutes` actif, chaque `router.push`/`Href` pointant vers un fichier qui vient de bouger
remonte maintenant comme erreur de type. Ne pas corriger les appelants tout de suite (phase 6) —
juste confirmer que le nombre d'erreurs correspond à ce qui est attendu (des `Href` vers les
anciens chemins), pas à une erreur de structure.

## Phase 3 — Barre du bas et icônes

1. `apps/mobile/app/(tabs)/_layout.tsx` : remplacer les 8 `Tabs.Screen` plats par 5
   `Tabs.Screen` (`index`, `sport`, `sommeil`, `nutrition`, `profile`), chacun pointant vers son
   groupe.
2. `apps/mobile/src/features/navigation/AppTabBar.tsx` :
   - `TABS` → 5 entrées avec les chemins `/`, `/sport`, `/sommeil`, `/nutrition`, `/profile`.
   - Remplacer les icônes texte par des composants `@expo/vector-icons` pour Accueil
     (`MaterialIcons` `dashboard`), Sport (`MaterialCommunityIcons` `dumbbell`), Sommeil
     (`MaterialIcons` `bedtime`), Nutrition (`MaterialCommunityIcons` `food-apple`) — Profil
     garde son glyphe `☰` actuel. Passer `color={tint}` (même variable `tint` déjà calculée pour
     actif/inactif) et une taille cohérente avec le rendu actuel (`fontSize: 18` équivalent →
     `size={18}` ou `20` selon rendu visuel, à ajuster à l'œil).

**Vérification** : lancer l'app (web ou simulateur) et vérifier visuellement que la barre affiche
5 onglets avec les bonnes icônes et que le surlignage actif fonctionne en naviguant, y compris
sur un écran de détail imbriqué (ex. `/sport/muscles` doit surligner Sport).

## Phase 4 — Composant partagé `DayNav`

1. Créer `apps/mobile/src/features/navigation/DayNav.tsx` : composant `‹ [label] ›` avec état
   contrôlé (`value: ISODateString`, `onChange`), bornes passées en props (`maxDaysFuture = 7`,
   passé illimité par défaut). Label : "Aujourd'hui" / "Hier" / date formatée (`toLocaleDateString`
   'fr-FR'). Si `value` ≠ aujourd'hui, afficher un petit indicateur/bouton "Aujourd'hui" pour
   revenir directement.
2. Pas de test unitaire dédié nécessaire (logique de calcul déjà couverte côté engines) — QA
   manuelle en phase 8.

**Vérification** : `pnpm --filter @supotsu/mobile typecheck && pnpm --filter @supotsu/mobile lint`.

## Phase 5 — Contenu du hub Sommeil (le plus gros morceau)

1. Renommer/déplacer la logique : `src/features/wellbeing/SleepScreen.tsx` devient la base de
   `src/features/sommeil/SommeilScreen.tsx` (nouveau nom de fonction exportée, ex.
   `SommeilScreen`). `app/(tabs)/sommeil/index.tsx` l'importe et le rend.
2. Ajouter l'état `selectedDate` piloté par `DayNav`, remplacer
   `const asOf = new Date().toISOString();` par `const asOf = selectedDate;`.
3. Réordonner les cartes selon l'ordre approuvé (spec section "Contenu du mini-accueil Sommeil",
   points 1 à 9).
4. Ajouter les nouvelles tuiles **Stress** et **Bien-être mental** (point 2) : lire
   `latestOf(metrics, 'stress')` (pattern déjà présent dans le fichier pour hrv/rhr/stress) pour
   Stress ; pour Bien-être, appeler `computeWellnessIndex`/`wellnessBand` depuis
   `@supotsu/engines` avec `useWellnessCheckins()`.
5. Ajouter la grille **Outils de récupération** (point 9, sans Rythme circadien qui garde sa
   carte dédiée existante) : 3 tuiles liant vers `/sommeil/breathing`, `/sommeil/neuro-recovery`,
   `/sommeil/sound`.
6. Ajouter la carte **Comprendre** contextuelle (point 10) : `articlesByPillar()` filtré sur
   `sleep`/`recovery`/`understanding`, 2-3 articles + lien "Tout voir" vers `/comprendre`.
7. Ajouter la carte **Objectifs** contextuelle (point 10) : lire les goals via le hook existant
   (`useGoals` si présent, sinon vérifier le hook exact dans `queries.ts`) filtrés sur le type
   `health` + métrique cible liée au sommeil/HRV/stress, lien vers `/profile/goals`.
8. Supprimer `src/features/health/SanteScreen.tsx` (son contenu est maintenant réparti — voir
   phases 6/7/9 pour les morceaux qui vont ailleurs : nutrition→déjà dans NutritionScreen,
   habitudes/bien-être→pas dupliqués, weight→phase 6).

### Extension pipeline HealthKit (sous-partie de cette phase)

9. `packages/connectors/src/appleHealth.ts` : ajouter `aggregateHealthKitSleepSessions(samples:
   HKSleepSample[]): ImportedSleepSession[]` à côté de `aggregateHealthKitSleep` (ne pas modifier
   cette dernière). Regrouper par nuit comme `aggregateHealthKitSleep` le fait déjà, mais
   construire un objet avec `deepMin`/`lightMin`/`remMin`/`awakeMin`/`inBedMin`/`asleepMin`/
   `startedAt`/`endedAt` au lieu d'une seule somme.
10. `packages/connectors/src/appleHealth.test.ts` : ajouter des cas de test pour cette nouvelle
    fonction, même style que les tests existants de `aggregateHealthKitSleep`.
11. `apps/mobile/src/features/connectors/healthKitClient.ios.ts` : appeler aussi
    `aggregateHealthKitSleepSessions` sur les mêmes échantillons de sommeil déjà récupérés,
    inclure le résultat dans le payload retourné (`sleepSessions`), et propager jusqu'à l'appel
    `useImportHealth().mutateAsync(...)` dans `HealthKitCard` (`DevicesScreen.tsx`) qui doit
    maintenant passer `sleepSessions` au lieu d'un tableau vide.

**Vérification** : `pnpm --filter @supotsu/connectors test`, puis `pnpm --filter @supotsu/mobile
typecheck`. QA manuelle de l'écran Sommeil (web ou simulateur) avec des données de démo/import.

## Phase 6 — Contenu du hub Sport

1. `src/features/training/TrainingScreen.tsx` → renommer en `src/features/sport/SportScreen.tsx`
   (fonction exportée `SportScreen`). `app/(tabs)/sport/index.tsx` l'importe.
2. Ajouter `DayNav` + état `selectedDate`, remplacer `const asOf = new Date().toISOString();`.
3. Réordonner : carte "Séance du jour sélectionné" en premier (réutilise la logique
   `usePlannedWorkouts`/`nextPlanned` déjà utilisée dans `DashboardScreen.tsx`, adaptée pour
   filtrer sur `selectedDate` au lieu de "la plus proche à venir").
4. Carte "État du corps" : ajouter `MuscleBody` avec le `colorFor` réutilisé depuis
   `MusclesScreen.tsx` (extraire cette fonction dans un utilitaire partagé si elle n'est pas déjà
   exportable proprement, pour éviter de dupliquer la logique de couleur).
5. Élargir la liste "Dernières séances" à "3 dernières activités" fusionnant `workouts` +
   `activities` triés par date, lien vers `/sport/activities` pour l'historique complet.
6. Ajouter les tuiles compactes **Charge (ACWR)** (`computeAcwr`, déjà importé) et **VO2 Max**
   (dernière valeur via `latestOf`-style lookup sur les health metrics, si disponible — sinon
   état "—" comme les autres champs optionnels du fichier).
7. Ajouter les cartes **Comprendre** (pilier `performance`) et **Objectifs** (types
   performance/strength/endurance), même mécanisme que la phase 5.

**Vérification** : `pnpm --filter @supotsu/mobile typecheck && pnpm --filter @supotsu/mobile lint`.
QA manuelle de l'écran Sport.

## Phase 7 — Contenu du hub Nutrition

1. `src/features/nutrition/NutritionScreen.tsx` : ajouter `DayNav` + `selectedDate`, remplacer
   `const asOf = new Date().toISOString();`.
2. Ajouter la carte **Poids & composition** après la carte Nutrition Score : réutiliser le calcul
   déjà présent dans `DashboardScreen.tsx` (poids/masse grasse/masse musculaire + variation 7j)
   plutôt que de le réécrire — envisager d'extraire un petit hook/util partagé si la duplication
   devient gênante. Lien vers `/nutrition/weight`.
3. Ajouter la carte **Comprendre** contextuelle (pilier `nutrition`).
4. L'"Objectifs" existant de `NutritionScreen` ne change pas.

**Vérification** : `pnpm --filter @supotsu/mobile typecheck && pnpm --filter @supotsu/mobile lint`.
QA manuelle de l'écran Nutrition.

## Phase 8 — Profil + Progression allégée

1. `app/(tabs)/profile/index.tsx` (ex-`ProfileScreen`) : mettre à jour les chemins existants
   (`/connectors`→`/profile/connectors`, `/goals`→`/profile/goals`, `/notifications`→
   `/profile/notifications`, `/integrations`→`/profile/integrations`, `/settings`→
   `/profile/settings`), ajouter les nouvelles `ListRow` : Communauté, Marketplace, Habitudes &
   discipline, Bilan & badges, Support, Qualité des données, Importer un fichier — avec icônes
   cohérentes avec le style `ListRow` existant (voir les icônes déjà utilisées dans ce fichier
   pour le ton/palette).
2. `src/features/progress/ProgressionScreen.tsx` (déplacé vers `app/(tabs)/profile/progression.tsx`) :
   retirer les sections Objectifs, Records, Photos d'évolution de la liste `sections`. Garder
   Rapport hebdomadaire, Statistiques, Tendances & corrélations, Badges, Comparaisons, et le
   bilan 7 jours.

**Vérification** : `pnpm --filter @supotsu/mobile typecheck && pnpm --filter @supotsu/mobile lint`.
QA manuelle de l'écran Profil (tous les nouveaux liens s'ouvrent correctement).

## Phase 9 — Audit des liens dans le reste de l'app

1. Grep sur tout `apps/mobile/src` et `apps/mobile/app` pour chacun des anciens chemins listés
   dans la spec (section Risques & validation) : `/training`, `/sante`, `/muscles`, `/sleep`,
   `/weight`, `/breathing`, `/circadian`, `/neuro-recovery`, `/bilateral`, `/sound`, `/wellness`,
   `/records`, `/exercises`, `/muscle-progress`, `/load`, `/calendar`, `/planning`, `/photos`,
   `/activities`, `/journal`, `/food/search`, `/food/scan`, `/meal/new`, `/connectors`,
   `/integrations`, `/data-quality`, `/import`, `/community`, `/marketplace`, `/habits`,
   `/goals`, `/notifications`, `/settings`, `/support`, `/profile/edit`.
2. Corriger chaque occurrence trouvée avec le nouveau chemin (`/sport/...`, `/sommeil/...`,
   `/nutrition/...`, `/profile/...`). Attention particulière à :
   - `SupportScreen.tsx` (lien "Comprendre mes données santé" → `/sante`, à repointer vers
     `/sommeil`).
   - `DashboardScreen.tsx` (`/muscles` → `/sport/muscles`, `/habits` → `/profile/habits` ; les
     liens `/progression`, `/nutrition` restent valides tels quels puisque ces routes existent
     toujours à ces chemins après le refactor).
3. `pnpm --filter @supotsu/mobile typecheck` doit passer à zéro erreur de route liée à ce
   refactor (avec `typedRoutes` actif, c'est la garantie qu'aucun lien cassé ne reste).

**Vérification** : `tsc --noEmit` propre.

## Phase 10 — Validation finale

1. `pnpm typecheck && pnpm lint && pnpm test` (racine du monorepo — couvre tous les packages,
   y compris les nouveaux tests `appleHealth.test.ts`).
2. `pnpm --filter @supotsu/mobile export:web` — doit se terminer par `Exported: dist`, confirme
   que la réorganisation de routes ne casse pas le build web.
3. QA manuelle complète : parcourir les 5 onglets, chaque écran déplacé, la navigation par jour
   sur les 3 hubs (bornes passé/+7j, reset au changement d'onglet, retour rapide à aujourd'hui),
   et les liens qui partent de l'Accueil (Prochaine séance, Corps & récupération, Nutrition,
   Habitudes, Badges récents) pour confirmer qu'aucun n'est cassé.
4. Commit + push, en excluant `.superpowers/` (déjà gitignoré) et sans commiter `ios/`/`android/`
   s'ils existent localement.

## Notes de portée

- Aucune modification du modèle de données `HealthMetricType` (`@supotsu/core`) — l'extension
  de cette phase 5 produit des `SleepSession`, un type qui existe déjà.
- Le mécanisme Comprendre/Objectifs éclaté (phases 5-7) ne crée aucune nouvelle UI de gestion,
  seulement des cartes de lecture filtrées renvoyant vers les écrans partagés existants.
- Si `typedRoutes: true` fait remonter des erreurs `Href` préexistantes sans rapport avec ce
  refactor (phase 0), les lister séparément et décider avec l'utilisateur si elles se corrigent
  dans ce projet ou dans un ticket séparé — ne pas les laisser bloquer la phase 10 sans un choix
  explicite.
