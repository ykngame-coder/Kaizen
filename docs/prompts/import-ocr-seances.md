# Prompt — Import d'une séance depuis une capture d'écran (OCR local, Voie A)

> Voie A = OCR 100 % sur l'appareil (gratuit, hors-ligne, privé). Pas besoin de
> toucher la politique de confidentialité (traitement local). La Voie B (IA vision)
> serait un chantier séparé qui réutiliserait le parseur et l'écran de revue.

```
Objectif : permettre à l'utilisateur d'IMPORTER une séance à partir d'une CAPTURE
D'ÉCRAN, 100 % sur l'appareil (gratuit, hors-ligne, privé). Pipeline :
image → OCR natif → parseur PUR → rattachement au catalogue d'exercices →
ÉCRAN DE REVUE ÉDITABLE (avec niveau de confiance par ligne) → enregistrement via
le flux de séance existant. Fidèle à « aucune boîte noire » : rien n'est enregistré
sans que l'utilisateur ait vu et pu corriger ce qui a été lu.

CONTEXTE (réutiliser l'existant) :
- Catalogue d'exercices : packages/shared/src/exercises.ts (EXERCISE_BY_ID,
  chaque exercice a id + name + primaryMuscles). 873 exercices en base.
- Création de séance : repository addWorkout(userId, { name, sets:
  Omit<SetEntry,'id'|'workoutId'>[] }) ; une série = { exerciseId, order, reps,
  weightKg }. Écran existant : NewWorkoutScreen (sport/workout/new).
- Modèle de parseur PUR + testé à imiter : packages/connectors/src/healthAutoExport.ts
  (+ .test.ts). Même approche : fonctions pures, Vitest, aucune I/O.

============================================================
1) PARSEUR PUR — packages/connectors/src/workoutOcr.ts (+ .test.ts)
============================================================
export interface ParsedSet { reps?: number; weightKg?: number; }
export interface ParsedExercise { rawName: string; sets: ParsedSet[]; confidence: 'high'|'medium'|'to_confirm'; }
export interface ParsedWorkout { name?: string; exercises: ParsedExercise[]; }

export function parseWorkoutText(rawText: string): ParsedWorkout
- Entrée : texte brut multi-lignes issu de l'OCR.
- Gère les formats courants (FR + EN), ex. :
    "Développé couché 4×8 60 kg", "Bench Press 4x8 @60kg",
    "Squat 100 kg x5", "3 × 12 @ 20 kg", "Curl 3x10 (12kg)",
    lignes de titre de séance, superset, unités kg/lb (convertir lb→kg).
- Normalise : × / x / * comme multiplicateur ; @, parenthèses pour la charge ;
  poids du corps = weightKg absent.
- confidence par exercice selon la netteté du motif (nom + séries reconnus = high ;
  nom seul = to_confirm ; etc.).
- Tests Vitest exhaustifs sur une dizaine de chaînes réalistes (dont bruit OCR).

export function resolveExerciseByName(rawName: string):
  { exerciseId?: string; matchName?: string; score: number }
- Fuzzy-match du nom lu contre le catalogue (EXERCISE_BY_ID) : normalisation
  (minuscules, sans accents), similarité (Levenshtein/Dice ou tokens communs).
- score 0-1 ; au-dessus d'un seuil → propose exerciseId ; sinon non résolu.
- Tests sur variantes ("dev couché", "bench", "squat barre").

============================================================
2) OCR NATIF (isolé, impur) — apps/mobile/src/features/connectors/ocrClient.ts
============================================================
- Utilise un OCR ON-DEVICE : @react-native-ml-kit/text-recognition (ML Kit,
  gratuit, hors-ligne, iOS + Android) OU Apple Vision via un petit module natif.
  → ajoute la lib + son config plugin dans app.json ; nécessite un dev build
    (déjà en place pour HealthKit).
- export async function ocrImageToText(uri: string): Promise<string>
- Choix de l'image : expo-image-picker (galerie) → ajoute le plugin +
  NSPhotoLibraryUsageDescription (chaîne d'usage FR claire) dans app.json.
- Dégradation propre : sur web / si le module est indisponible, la fonctionnalité
  est masquée (feature-flag OCR dispo), pas de crash.

============================================================
3) ÉCRAN DE REVUE ÉDITABLE — apps/mobile/app/(tabs)/sport/workout/import.tsx
   + src/features/sport/OcrImportScreen.tsx
============================================================
Flux :
- Point d'entrée depuis le hub Sport et/ou NewWorkoutScreen : bouton
  « Importer depuis une capture ».
- Choisir l'image → ocrImageToText → parseWorkoutText → pour chaque exercice,
  resolveExerciseByName.
- Écran de revue : liste éditable des exercices/séries pré-remplis, avec pour
  chaque ligne un indicateur de CONFIANCE (couleurs état existantes) ; exercice
  non résolu → sélecteur dans le catalogue ou « créer un exercice » (flux existant
  sport/exercise/new). L'utilisateur corrige reps/charges, ajoute/supprime.
- Bouton « Ajouter la séance » → addWorkout(userId, { name, sets }) (mappe
  chaque série résolue en { exerciseId, order, reps, weightKg }). Les exercices
  non résolus ne sont pas enregistrés tant qu'ils ne sont pas rattachés.
- Titre de séance pré-rempli si détecté, éditable.

============================================================
QUALITÉ & RÈGLES
============================================================
- pnpm typecheck && pnpm lint && pnpm test verts (le parseur PUR doit être bien couvert).
- pnpm --filter @supotsu/mobile export:web valide le bundling (OCR masqué sur web).
- Rien ne quitte l'appareil : à préciser dans l'UI (mention « traitement local »).
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change → APERÇU VISUEL de l'écran de revue d'import.
```
