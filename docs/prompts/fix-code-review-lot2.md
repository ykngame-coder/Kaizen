# Prompt — Correctifs issus du code-review (lot 2)

> Points remontés par une revue de code ciblée (moteurs de score + features).
> Les deux findings sommeil (dette/régularité non dédoublonnées) sont traités
> dans `objectif-sommeil-reglable.md` (mêmes fonctions) — NE PAS les refaire ici.
> Ce prompt couvre les 3 autres.

```
Corrige les points suivants (revue de code). Réutilise l'existant, moteurs purs,
i18n via t() dans fr/en/es/pt/de. Aucun ne nécessite de migration.

============================================================
A — Notes de séance perdues à l'édition (backend Supabase)   [🟠 correctness]
============================================================
Fichier : packages/database/src/repositories/user-programs.ts (~L131-140,
updateUserSession) + le câblage dans apps/mobile/src/lib/data/repository.ts.
Constat : addUserSession écrit bien `notes`, mais updateUserSession a un patch
`{ name, visibility }` SANS `notes` et fait `.update({ name, visibility })`. Donc
éditer/ajouter les notes d'une séance est ignoré en PROD (le mode démo, lui, écrit
les notes → le bug est invisible hors Supabase).
À faire :
- Ajoute `notes` au patch de updateUserSession (db) : type `{ name; visibility;
  notes?: string | null }` et `.update({ name, visibility, notes: patch.notes ?? null })`.
- Assure-toi que l'appelant (repository UserSessionInput → updateUserSession)
  transmet bien `input.notes`. Vérifie la colonne `notes` sur `user_sessions`
  (elle existe déjà puisque addUserSession l'écrit) → pas de migration.
- Test : éditer une séance existante en changeant les notes → notes persistées.
- ATOMICITÉ (2e finding sur la MÊME fonction, ~L137) : updateUserSession
  SUPPRIME tous les exercices/blocs puis les ré-insère, SANS transaction. Un échec
  en cours (quota, réseau, RLS) laisse la séance vidée/partielle, sans rollback.
  → rends le remplacement ATOMIQUE : idéalement une fonction RPC Postgres
  (SECURITY DEFINER, sc2 RLS) qui fait delete+insert dans UNE transaction ; à
  défaut, structure le code pour ne supprimer l'ancien contenu qu'après succès des
  insertions (ou restaure en cas d'échec). Test : simuler un échec d'insertion du
  2e bloc → l'ancienne séance reste intacte.

============================================================
B — Pagination des habitudes non déterministe (export/streaks incomplets) [🟠]
============================================================
Fichier : packages/database/src/repositories/habits.ts (~L62-75, listHabitLogs).
Constat : la boucle `.range(from, from+PAGE-1)` trie sur `completed_at` (non unique)
SANS clé secondaire. Entre deux requêtes de pages, les lignes à `completed_at`
identiques peuvent changer d'ordre → lignes sautées ou dupliquées au bord des
pages. La complétude promise (export RGPD, calendrier, streaks) n'est donc pas
garantie sur gros volume. (Peut aussi expliquer une partie du retour testeur
« habitudes des jours passés ».)
À faire :
- Ajoute une clé de tri secondaire STABLE : `.order('completed_at', { ascending:
  false }).order('id', { ascending: false })` (ou ascending, tant que c'est
  déterministe et cohérent d'une page à l'autre).
- Garde la pagination complète (boucle jusqu'à `data.length < PAGE`).
- Test : jeu de logs avec `completed_at` identiques à cheval sur une frontière de
  page → aucun doublon ni oubli.

============================================================
C — Saisie nutrition « eau seule / 0 kcal » bloquée en mode per100   [🟡]
============================================================
Fichier : apps/mobile/src/features/nutrition/AddMealScreen.tsx (~L114, submit).
Constat : le mode par défaut est passé à « per 100 g ». Une entrée hydratation
seule (description + hydrationMl, sans kcal/quantité) ou un aliment 0 kcal donne
`per100Totals === null` → submit met l'erreur 'invalid' et refuse de sauver. Le
schéma autorise kcal:0 avec hydrationMl, et l'ancien formulaire « Total » le
sauvait.
À faire :
- Autorise la sauvegarde quand il n'y a pas de calcul per100 valide mais qu'il y a
  quand même une entrée légitime : hydratation > 0, et/ou macros/kcal = 0 assumés.
  Concrètement : si aucune donnée per100 exploitable, retombe sur les totaux
  directs (0 par défaut) au lieu de bloquer — n'exige pas calories+quantité pour
  une entrée d'eau. Message d'erreur seulement si l'entrée est réellement vide
  (ni kcal, ni macros, ni hydratation, ni description).
- Test : loguer 500 ml d'eau sans calories → enregistré ; aliment 0 kcal → enregistré.
- HARMONISER les DEUX modes (finding complémentaire, ~L116) : en mode « Total »,
  un champ calories VIDE donne parseDecimal('')===0 et passe le schéma → un repas à
  0 kcal est enregistré SILENCIEUSEMENT (alors que per100 bloque trop). Rends la
  validation COHÉRENTE : une entrée « aliment » exige des calories réellement
  saisies (les deux modes), tandis qu'une entrée hydratation seule / 0 kcal assumé
  est autorisée dans les deux modes. Pas un mode laxiste + un mode trop strict.
  Test : mode Total, macros sans calories → erreur claire ; eau seule → OK.

============================================================
QUALITÉ & RÈGLES
============================================================
- pnpm typecheck && pnpm lint && pnpm test verts (ajoute les tests cités).
- pnpm --filter @supotsu/mobile export:web OK.
- i18n : toute nouvelle chaîne dans les 5 locales.
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- Si l'apparence change (saisie nutrition) → APERÇU VISUEL.

RAPPEL : les 2 findings sommeil (dédup dette + régularité) sont dans
`objectif-sommeil-reglable.md`.
```
