# Prompt — Étendre la bibliothèque d'exercices avec wger (multilingue)

> Le catalogue actuel = free-exercise-db (873, domaine public), affiché via
> `apps/mobile/src/features/exercises/exercises.data.json` + `catalog.ts`
> (images en CDN jsDelivr, instructions EN). Objectif : COMPLÉTER avec wger
> (wger.de, open-source, multilingue), en restant offline-first (JSON vendoré,
> pas d'API au runtime), sans casser les IDs existants, et avec attribution
> CC-BY-SA.

```
Étends le catalogue d'exercices de Kaizen Supotsu avec la base wger (wger.de),
GRATUITE et MULTILINGUE, pour combler les exercices manquants. Le catalogue reste
un JSON VENDORÉ (offline-first) — wger n'est appelé qu'à la génération (dev), pas
au runtime.

============================================================
0) SOURCES & SOURCE DE VÉRITÉ (à cartographier d'abord)
============================================================
- Bibliothèque affichée : apps/mobile/src/features/exercises/exercises.data.json
  (typé par catalog.ts : { id, name, primary: MuscleGroup, secondary: MuscleGroup[],
  category: 'force'|'cardio'|'mobilité', equipment (FR), level (FR), mechanic,
  instructions[], image }). C'est la SOURCE DE VÉRITÉ du runtime (ExerciseLibraryScreen,
  ExerciseDetailScreen, et le mapping muscle→silhouette du logging de séance).
- packages/shared/src/exercises.ts : petite liste curée SÉPARÉE (EXERCISE_LIBRARY,
  ids 'ex-…') — NE PAS confondre, ne pas y toucher.
- Supabase : migrations 0017/0018 seedent une table `exercises` serveur. Vérifie si
  la bibliothèque est lue depuis Supabase au runtime (a priori NON — l'UI lit le
  JSON). Si le serveur n'est pas lu pour la bibliothèque, un seed serveur est
  OPTIONNEL ; sinon, ajoute une migration de seed cohérente. Documente ta décision.

============================================================
1) SCRIPT DE GÉNÉRATION (dev/Mac, réseau requis) — scripts/build-exercises.mjs
============================================================
- Récupère les exercices wger via l'API publique (endpoints exercice + traductions ;
  langues fr, en, es, pt, de). Déterministe (mêmes entrées → même sortie).
- Mappe chaque exercice wger vers le schéma ci-dessus (tables §2).
- FUSIONNE avec le JSON existant :
  * NE CHANGE JAMAIS les IDs existants (873) — ils sont référencés dans les données
    utilisateur (workout sets, records, historique). 
  * Les exercices wger reçoivent un id préfixé stable : `wger-<idWger>`.
  * DÉDOUBLONNE par nom NORMALISÉ (minuscules, sans accents) : si un exercice wger
    correspond à un existant, ne l'ajoute pas (garde l'existant → historique intact).
- Écrit le JSON fusionné (trié de façon stable). Le script est relançable.
- Attribution : conserve par exercice wger { license, author, sourceUrl } (voir §5).

============================================================
2) TABLES DE MAPPING (wger → ton vocabulaire)
============================================================
MuscleGroup cible = chest, back, shoulders, biceps, triceps, quads, hamstrings,
glutes, calves, core, full_body.
- Muscles wger → groupe : Biceps brachii→biceps ; Triceps brachii→triceps ;
  Pectoralis major→chest ; Deltoid/Anterior deltoid→shoulders ;
  Latissimus dorsi/Trapezius/Rhomboid/Erector spinae→back ;
  Quadriceps femoris→quads ; Biceps femoris/Hamstrings→hamstrings ;
  Gluteus maximus→glutes ; Gastrocnemius/Soleus→calves ;
  Rectus abdominis/Obliquus externus/Serratus anterior→core.
  primary = 1er muscle mappé ; secondary = les autres (dédupliqués). Si aucun muscle
  mappable → full_body (ou skip si vraiment inconnu). NE crée pas de nouveau groupe.
- Catégorie wger → 'force'|'cardio'|'mobilité' : Cardio→cardio ; Stretching/
  mobilité→mobilité ; sinon force.
- Équipement wger → FR (réutilise EXACTEMENT tes libellés existants) : Barbell→Barre ;
  SZ-Bar→Barre EZ ; Dumbbell→Haltères ; Kettlebell→Kettlebell ; Cable→Poulie ;
  none (bodyweight)/Pull-up bar→Poids du corps ; Swiss Ball→Swiss ball ;
  Gym mat/Bench/Incline bench→Autre ; Resistance band→Élastique ; sinon→Autre.
- level : wger n'en fournit pas de fiable → 'Intermédiaire' par défaut.
- mechanic : null (wger ne le donne pas de façon fiable).

============================================================
3) MULTILINGUE
============================================================
- Étends le type Exercise (catalog.ts) avec un champ OPTIONNEL
  `i18n?: Partial<Record<'fr'|'en'|'es'|'pt'|'de', { name?: string; instructions?: string[] }>>`.
- Les champs de base `name`/`instructions` restent (rétrocompat) — pour un exercice
  wger, remplis-les avec la version FR (défaut), sinon EN.
- catalog.ts : à l'affichage, résous name/instructions dans la langue active
  (i18next) avec repli fr→en→base. (Les 873 existants n'ont pas de i18n → ils
  gardent leurs instructions actuelles, à traduire plus tard via le chantier i18n.)

============================================================
4) IMAGES (rester léger / offline)
============================================================
- `exerciseImageUrl` construit aujourd'hui une URL CDN jsDelivr free-exercise-db.
  Rends-le tolérant : si `image` est une URL absolue (https), passe-la telle quelle ;
  sinon garde le chemin relatif free-exercise-db.
- Pour les exercices wger : soit une URL d'image wger (CC-BY-SA, avec author), soit
  `image: null` si aucune. NE bundle PAS des milliers d'images (poids app/dépôt) —
  URL distante ou placeholder, cohérent avec l'approche actuelle.

============================================================
5) ATTRIBUTION (CC-BY-SA — obligatoire)
============================================================
- wger : contenu sous CC-BY-SA → attribution + partage à l'identique.
- Ajoute un écran/section « Crédits & licences » (Réglages/À propos ou « Comprendre »)
  créditant wger.de + le lien de licence, et mentionnant que les données d'exercices
  dérivées sont CC-BY-SA. Le free-exercise-db (domaine public) n'exige rien mais peut
  être cité aussi.
- Conserve par exercice wger { license, author, sourceUrl } (champs optionnels) et
  affiche l'auteur sur la fiche exercice quand présent.

============================================================
QUALITÉ & RÈGLES
============================================================
- Après génération : pnpm typecheck && pnpm lint && pnpm test verts ; export:web OK.
- Surveille la TAILLE du JSON / du bundle (le catalogue va grossir) — reste raisonnable.
- La recherche (ExerciseLibraryScreen) doit indexer le nom dans la langue active et
  rester fluide sur un catalogue plus grand.
- Vérifie que le mapping muscle alimente correctement la silhouette de récup pour les
  nouveaux exercices (primary/secondary bien remplis).
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change (bibliothèque enrichie, crédits) → APERÇU VISUEL.

NOTE : garde le script de génération dans le dépôt (scripts/) pour pouvoir
re-synchroniser wger plus tard.
```
