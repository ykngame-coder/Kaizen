# Prompt — Correctifs retours TestFlight (lot 1)

> Issu de l'investigation des retours testeurs (builds 44/45). Chaque point cite
> le fichier/fonction en cause. Investigation déjà faite — ce prompt dit quoi
> corriger. i18n en place : toute nouvelle chaîne visible passe par `t()` dans
> fr/en/es/pt/de.

```
Corrige les retours TestFlight suivants. Réutilise l'existant, garde les moteurs
purs, respecte le design system. i18n obligatoire (clés dans les 5 locales).

============================================================
#3 — PLANNING : rendre la séance cliquable pour l'ouvrir / la lancer  (BUG NET)
============================================================
Fichier : apps/mobile/src/features/planning/PlanningScreen.tsx (~L570) +
le composant SessionCard qu'il utilise.
Constat : SessionCard reçoit seulement onDone/onSkip/onDelete/onReprogram —
AUCUN moyen d'ouvrir la séance ni de la lancer.
À faire :
- Ajoute une action « ouvrir/lancer » : rendre le corps de la carte tappable
  (Pressable) → router.push({ pathname: '/sport/workout/[id]', params: { id: w.id }}).
- Ajoute aussi un accès direct « Lancer » vers le runner
  ('/sport/workout/[id]/run') pour la séance du jour / à venir.
- Ne casse pas les boutons existants (Fait/Passer/Supprimer/Reprogrammer) :
  l'ouverture se fait sur la zone principale de la carte, distincte des boutons.

============================================================
#4 — NUTRITION : réattribuer un aliment à un autre repas  (FEATURE)
============================================================
Fichiers : apps/mobile/src/features/nutrition/MealDetailScreen.tsx ;
repository.updateNutritionEntry + updateNutritionEntryDb (packages/database) +
types générés.
Constat : updateNutritionEntry(userId, entryId, patch) existe mais son patch ne
gère QUE { kcal, proteinG, carbG, fatG } — pas le repas.
À faire :
- Étends le type du patch de updateNutritionEntry pour inclure
  `mealType?: MealType` (côté interface repo, impl démo ET impl Supabase
  updateNutritionEntryDb). La colonne `meal_type` EXISTE DÉJÀ
  (migration 0003, check 'breakfast'|'lunch'|'dinner'|'snack') → AUCUNE
  migration nécessaire, il suffit d'ajouter `meal_type` au patch de
  updateNutritionEntryDb. Ne rends pas les autres champs obligatoires (patch partiel).
- Dans MealDetailScreen, ajoute un sélecteur de repas (SegmentedControl :
  Petit-déj / Déjeuner / Dîner / Collation) pré-positionné sur le repas actuel ;
  « Enregistrer » applique mealType en plus des macros.
- Invalide la query nutrition après sauvegarde (déjà géré par le hook update).

============================================================
#5 — HABITUDES : auto-cocher « Pesée » depuis une pesée dans Santé  (FEATURE)
============================================================
Fichiers : apps/mobile/src/features/gamification/linkedHabits.ts +
HabitsScreen.tsx (liveProgress/progressFor + auto-log effect).
Constat : les habitudes « liées / suivi auto » ne connaissent que
hydration | steps | workout. Pas de poids.
À faire :
- linkedHabits.ts : ajoute LinkedKind 'weight' ; linkedKindFor renvoie 'weight'
  si le nom contient 'pesée'/'pesee'/'poids'/'weigh'. Ajoute LINKED_LABEL['weight']
  (ex. « ta pesée (Apple Santé / balance) »).
- HabitsScreen : dans liveProgress, gère 'weight' → { value: 1, target: 1 } si un
  HealthMetric de type 'weight' existe pour le jour affiché (via useHealthMetrics,
  filtré sur viewedK), sinon { value: 0, target: 1 }. L'auto-log existant cochera
  l'habitude quand la donnée est présente (même mécanique que hydration).
- Vérifie que le suivi auto fonctionne aussi le jour même (isToday) comme les
  autres kinds.

============================================================
#2 — SPORT : activités absentes des « 3 dernières activités »  (À CONFIRMER)
============================================================
Fichier : apps/mobile/src/features/sport/SportScreen.tsx (~L204 `recent`).
Constat : `recent` fusionne bien workouts + activities puis trie desc et slice(0,3).
En théorie les activités doivent apparaître. Deux causes possibles à vérifier :
- (a) les 3 slots sont monopolisés par des SÉANCES (workouts) plus récentes que
  les activités → dans ce cas, décide du comportement voulu (ex. garantir au
  moins les activités récentes, ou renommer le bloc). 
- (b) tri par date incohérent : workouts utilisent completedAt, activities
  startedAt — assure-toi que les deux sont des ISO comparables par localeCompare
  (même format/longueur) ; normalise si besoin (Date.parse + comparaison
  numérique) avant slice(0,3).
Reproduis d'abord avec des activités importées (Apple Santé) comme dans le retour
(Pilates, Cardio mixte) ; corrige la cause réelle trouvée. Vérifie aussi que le
libellé affiché (r.name = x.type) est bien traduit/humantisé, pas la clé brute.

============================================================
#1 — HABITUDES : valider les jours passés  (NE PAS RE-CODER POUR L'INSTANT)
============================================================
Le code actuel est CORRECT (toggle écrit completedAt = jour sélectionné, relecture
groupée sur le même instant ; backend habit_logs accepte une date passée ; fix
commit 2b8b39e présent). Les builds testés (44/45) sont probablement ANTÉRIEURS à
ce fix. → NE change rien : assure-toi juste que le prochain build TestFlight
contient 2b8b39e, et fais re-tester la validation d'un jour passé. Si ça échoue
ENCORE sur un build qui contient 2b8b39e, alors debug on-device (la mutation
part-elle ? erreur silencieuse ? case cochée puis dé-cochée ?).

============================================================
QUALITÉ & RÈGLES
============================================================
- pnpm typecheck && pnpm lint && pnpm test verts (ajoute des tests là où c'est
  pur : mapping mealType, détection linkedKind 'weight').
- pnpm --filter @supotsu/mobile export:web valide le bundling.
- i18n : nouvelles chaînes dans fr/en/es/pt/de.
- Pas de migration pour #4 (meal_type existe déjà). Pas de migration pour #5
  (lecture seule de health metrics). #3 ne touche pas la base.
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change → APERÇU VISUEL : carte planning cliquable, sélecteur de repas,
  habitude Pesée auto-cochée.
```
