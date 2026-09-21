# Recettes — conception

Validée avec l'utilisateur le 2026-09-21, section par section.

## Le besoin

Aujourd'hui, journaliser un plat maison mangé plusieurs fois oblige à ressaisir
chaque aliment à chaque fois — soit via la recherche Open Food Facts/aliments
personnalisés, soit à la main. L'utilisateur veut composer une **recette** une
fois (les aliments et leurs quantités), laisser l'app calculer sa valeur
nutritionnelle, puis, au moment de manger, ne plus saisir que la quantité
mangée en grammes — exactement comme pour un aliment simple.

## Le principe

Une recette est un panier d'ingrédients, chacun avec ses macros **par 100 g**
(capturées au moment de l'ajout — jamais une référence live vers Open Food
Facts, qui pourrait changer sa fiche demain) et la quantité en grammes utilisée
dans la recette. Une fois ses ingrédients connus, la recette **devient un
`FoodItem`** comme n'importe quel aliment OFF ou personnalisé : mêmes macros
par 100 g (calculées), même `scaleMacros` pour une portion, même écran de
saisie « quantité mangée → repas → journal ». Aucun nouveau mécanisme de
portion à inventer.

Les totaux de la recette ne sont **pas stockés** : ils se recalculent à la
lecture à partir de `recipe_ingredients`, en pure fonction testable. Les
stocker en plus créerait une deuxième source de vérité qui pourrait diverger
si un ingrédient est modifié sans tout recalculer (même raisonnement que
`quantity_g` sur `nutrition_entries`).

## Modèle de données

Deux tables, sur le schéma déjà utilisé pour les séances (`user_sessions` /
`user_session_exercises` — visibilité privée/publique, lignes enfants qui
suivent la visibilité du parent) :

```sql
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  barcode text,                    -- absent si saisi à la main
  description text not null,
  kcal_per100g numeric not null check (kcal_per100g >= 0),
  protein_g_per100g numeric check (protein_g_per100g >= 0),
  carb_g_per100g numeric check (carb_g_per100g >= 0),
  fat_g_per100g numeric check (fat_g_per100g >= 0),
  quantity_g numeric not null check (quantity_g > 0),
  "order" smallint not null default 0
);
```

RLS — même formule que `user_sessions`/`user_session_exercises` :

- `recipes` : lisible si `visibility = 'public' OU auteur` ; modifiable
  seulement par l'auteur.
- `recipe_ingredients` : lisible/modifiable via une sous-requête sur la
  recette parente (même visibilité/propriété).

Types `@supotsu/core` (nouveau fichier `packages/core/src/recipes.ts`) :

```ts
export interface RecipeIngredient {
  id: string;
  barcode?: string;
  description: string;
  kcalPer100g: number;
  proteinGPer100g: number;
  carbGPer100g: number;
  fatGPer100g: number;
  quantityG: number;
  order: number;
}

export interface Recipe extends OwnedEntity {
  name: string;
  visibility: Visibility;
  ingredients: RecipeIngredient[];
}
```

## Calcul des macros (pure, testé)

Nouveau module `packages/engines/src/recipes.ts` :

- `recipeMacrosPer100g(ingredients: RecipeIngredient[]): Macros` — moyenne
  pondérée par quantité : `Σ(macro_i × quantité_i) / Σ(quantité_i) × 100`.
  Rend des zéros sur une liste vide (recette sans ingrédient encore ajouté —
  jamais une division par zéro qui plante l'aperçu live).
- `recipeTotalWeightG(ingredients: RecipeIngredient[]): number` —
  `Σ(quantité_i)`.
- `recipeToFoodItem(recipe: Recipe): FoodItem` — combine les deux ;
  `servingSizeG = recipeTotalWeightG(...)` (défaut : « manger toute la
  recette », comme le `servingSizeG` d'un produit OFF préremplit déjà la
  quantité).

Tests : liste vide, un ingrédient, plusieurs ingrédients de quantités très
différentes (vérifie la pondération, pas une simple moyenne), arrondis
cohérents avec `scaleMacros`.

## Le sélecteur d'aliment partagé (refactor)

`FoodSearchScreen` contient déjà toute la logique de recherche (nom,
code-barres, scan, repli en saisie manuelle si introuvable — cf. commit
`7faca6d`). Elle est extraite en un composant `FoodPickerSheet` :

```ts
interface FoodPickerSheetProps {
  visible: boolean;
  onPick: (food: FoodItem) => void;
  onClose: () => void;
}
```

`FoodSearchScreen` l'utilise pour son propre flux (aliment choisi → quantité
→ repas → journal, inchangé). Le nouvel écran de recette l'utilise pour
chaque ingrédient : aliment choisi → petit prompt « quantité utilisée dans la
recette (g) » → ajouté à la liste d'ingrédients.

Un second composant partagé, `FoodLogCard` (extrait de la partie basse de
`FoodSearchScreen` : quantité mangée, badges macros, `SegmentedControl` repas,
bouton Ajouter), sert à journaliser **n'importe quel** `FoodItem` — un
aliment OFF, un aliment personnalisé, ou une recette convertie via
`recipeToFoodItem`. `FoodSearchScreen`, `MyRecipesScreen` et
`CommunityRecipesScreen` s'en servent tous les trois.

## Écrans

- **`RecipeEditScreen`** (création/édition) : nom, liste d'ingrédients
  (description, quantité, bouton retirer), aperçu live des macros/100 g
  (`recipeToFoodItem` recalculé à chaque changement), bouton « Ajouter un
  ingrédient » → `FoodPickerSheet`, toggle Privée/Publique
  (`SegmentedControl`, même libellés que `sport.sessionBuilder.visibility.*`),
  Enregistrer/Annuler.
- **`MyRecipesScreen`** (« Mes recettes ») : liste des recettes de
  l'utilisateur (privées + publiques), accessible depuis l'écran Nouveau
  repas à côté de « Chercher dans Open Food Facts ». Tap → `FoodLogCard`
  directement (pas d'écran intermédiaire). Bouton « Nouvelle recette » →
  `RecipeEditScreen`. Chaque ligne a aussi un accès à l'édition/suppression
  (l'auteur seulement).
- **`CommunityRecipesScreen`** (« Recettes de la communauté ») : recherche +
  liste des recettes publiques des autres (`listCommunityRecipes`, même
  principe que `listCommunitySessions`). Tap → fiche en lecture (ingrédients
  + macros calculées, `FoodLogCard` pour journaliser directement) avec un
  bouton **« Copier dans mes recettes »**.

## Copier une recette publique

Pas de nouvelle méthode de dépôt : la copie se fait entièrement côté appelant
— relire les ingrédients de la recette source (déjà chargés pour l'afficher),
puis appeler `addRecipe(userId, { name, visibility: 'private', ingredients })`
avec ces mêmes ingrédients. La recette copiée est indépendante de l'originale
dès l'instant de la copie (mêmes macros figées, pas de lien vers la source).

## Dépôt (`packages/database` + `apps/mobile/src/lib/data`)

`packages/database/src/repositories/recipes.ts` — même style que
`customFoods.ts`/`user-programs.ts` : `listRecipes`, `listCommunityRecipes`,
`getRecipe` (recette + ses ingrédients), `insertRecipe` (insert la recette
puis insert en bloc ses ingrédients, sans transaction entre les deux — même
choix assumé qu'`insertUserSession` : une recette créée qui échoue à mi-chemin
reste vide et se supprime, pas de machinerie de retour en arrière pour une
création). `updateRecipe` remplace la liste d'ingrédients en entier (comme
`updateUserSession` : la recette éditée revient complète depuis l'écran,
recomposer ligne par ligne n'apporterait rien) — avec la même précaution que
`updateUserSession` : relire les anciens ingrédients avant de les effacer, les
restaurer si l'insertion des nouveaux échoue en cours de route. `deleteRecipe`
(cascade sur les ingrédients via la FK).

`DataRepository` (interface + implémentations Démo et Supabase) : mêmes
méthodes exposées à l'app. En mode démo, stockage local sous une clé globale
`supotsu.recipes` (comme `customFoodsKey` et `usKey()` pour les séances) —
`listCommunityRecipes` filtre `visibility === 'public' && userId !== self`,
vide s'il n'y a qu'un seul utilisateur local.

`apps/mobile/src/lib/data/queries.ts` : `useRecipes()`, `useCommunityRecipes()`,
`useRecipe(id)`, `useAddRecipe()`, `useUpdateRecipe()`, `useDeleteRecipe()`.

## i18n

Nouveau namespace `nutrition.recipes.*` dans les 5 langues (fr, en, es, de,
pt ; JSON indenté à 1 espace) : titres d'écran, libellés du formulaire,
`visibility.private`/`visibility.public` (calqués sur
`sport.sessionBuilder.visibility.*`), bouton copier, messages d'erreur.

## Hors périmètre (v1)

- Unités autres que le gramme (pas de « 2 œufs », « 1 tasse »).
- Recette imbriquée dans une autre recette.
- Photo ou étapes de préparation — uniquement ingrédients, quantités, calcul
  nutritionnel.
- Édition d'une recette publique par quelqu'un d'autre que son auteur (RLS
  l'interdit déjà).

## Tests

- `packages/engines/src/recipes.test.ts` : pondération, liste vide, arrondis.
- `packages/database/src/repositories/recipes.test.ts` : mêmes patterns de
  client factice que `customFoods.test.ts`/`nutrition.test.ts`.
- `npx tsc --noEmit -p apps/mobile`, `npx vitest run`, ESLint sur les fichiers
  touchés — comme pour tout le module nutrition.
