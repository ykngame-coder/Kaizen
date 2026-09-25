# Prompt — Corriger la transcription du programme « Test Luc Léger »

> **Cible visuelle** (maquette d'intention à reproduire) :
> `docs/prompts/assets/corriger-programme-luc-leger.png` — les 6 séances telles
> qu'elles doivent s'afficher après correction (Phase 1 à gauche, Phase 2 à
> droite : échauffements visibles, blocs `tabata` pour les intervalles, footing
> extérieur, navettes 20 m, circuit pliométrie ×4, récup entre séries). Ouvre
> cette image avant de commencer : elle fixe la structure attendue. Reproduis
> l'esprit avec les composants/tokens réels de l'app, pas au pixel. Le libellé
> « Tabata » vient du **format de bloc** (intervalles travail/repos) — c'est le
> bon format technique ; si un wording « Fractionné » est préféré à l'écran pour
> une séance de course, c'est un simple choix de libellé i18n.

> L'utilisateur a créé un programme (PDF ci-dessous) qui a été **mal retranscrit**
> dans l'app (données `user_programs` / `user_sessions` de SON compte, pas du code).
> C'est un programme de **course / endurance** (VMA, footing, navettes, test Luc
> Léger) ; il a été mappé sur des exercices force/Hyrox du catalogue avec des
> structures fausses (Tabata isolé, « Wind Sprints » partout, tags Hyrox, tapis).
> Ci-dessous : (1) le contenu RÉEL du PDF (source de vérité), (2) ce qui est faux
> aujourd'hui, (3) la structure CIBLE exacte à saisir. i18n en place → toute chaîne
> visible via t() (fr/en/es/pt/de).

---

## 1) CONTENU RÉEL DU PROGRAMME (extrait fidèlement du PDF de l'utilisateur)

**Programme de Préparation : Test Luc Léger**
Plan d'entraînement sur **4 semaines — 3 séances hebdomadaires**.

### Phase 1 : Semaines 1 & 2 — Développement de la VMA & Technique

| Séance | Contenu de la séance | Objectif clé |
|---|---|---|
| **1. VMA Courte** | 10 min d'échauffement + **2 séries de (8 × 30 s effort / 30 s repos)**. **3 min de récupération entre les séries.** | Développer la capacité aérobie et le système cardiovasculaire. |
| **2. Spécifique Luc Léger** | 10 min d'échauffement + **3 séries de 6 allers-retours de 20 m** avec demi-tour net. **2 min de récupération** (entre séries). | Travailler le freinage, l'ancrage du pied et la relance explosive. |
| **3. Endurance de Base** | **40 à 45 min de footing continu** à aisance respiratoire (capable de tenir une conversation). | Développer la caisse aérobie globale et favoriser la récupération. |

### Phase 2 : Semaines 3 & 4 — Intensification & Gestion des Paliers

| Séance | Contenu de la séance | Objectif clé |
|---|---|---|
| **1. Fractionné 15/15** | 10 min d'échauffement + **2 séries de (10 × 15 s sprint / 15 s repos)**. **3 min de récupération.** | Simuler les exigences métaboliques des paliers élevés. |
| **2. Test à Blanc** | Échauffement complet + **Test Luc Léger dans les conditions réelles** avec bande sonore officielle. | Caler la gestion de l'allure sur le bip et la résistance mentale. |
| **3. Endurance + Pliométrie** | **30 min de footing** + **4 séries de (10 fentes sautées et 10 squats sautés)**. | Renforcer l'explosivité musculaire des membres inférieurs. |

### Consignes tactiques & techniques (à mettre dans les `notes` de séance / du programme)
- **Technique du demi-tour** : ne pas ralentir trop tôt ; franchir la ligne d'un
  seul pied, pivoter sur le bassin et relancer immédiatement ; alterner la jambe
  de pivot à chaque aller-retour.
- **Gestion de l'allure** : s'économiser sur les 4 premiers paliers ; caler la
  foulée exactement sur le bip sans anticiper ni partir trop vite.
- **Jour du test** : échauffement spécifique 15 min (montées de genoux, pas
  chassés, mobilité des chevilles) ; chaussures de course légères à bonne
  adhérence pour ne pas glisser lors des demi-tours.

---

## 2) CE QUI EST FAUX AUJOURD'HUI (constaté à l'écran SEMAINE 1 / SEMAINE 2)

- **VMA Courte** affiché « Tabata 0 min 30 s / Wind Sprints / libre » → perd les
  **2 séries**, les **8 tours**, l'**échauffement 10 min** et la **récup 3 min**.
- **Spécifique Luc Léger** affiché « Hyrox / Wind Sprints 20 m ×3 » → « ×3 » au
  lieu de **3 séries de 6 allers-retours** ; tag **Hyrox** erroné ; pas d'échauffement.
- **Endurance de Base** affiché « Hyrox / Course sur tapis 45:00 » → c'est un
  **footing extérieur 40-45 min**, pas du tapis ; tag **Hyrox** erroné.
- (Phase 2 : mêmes types d'erreurs — à refaire proprement selon §3.)

Cause racine : programme de **course/endurance** mappé sur un catalogue
force/Hyrox, avec formats de bloc et volumes inventés. La bonne représentation
utilise **format `tabata`** pour les intervalles travail/repos, des exercices
cardio existants, et des **durées/reps fidèles** au PDF.

---

## 3) STRUCTURE CIBLE À SAISIR (modèle app : blocs + exercices + notes)

> Rappel modèle (`packages/core/src/user-programs.ts`) : un `UserProgram`
> (title/focus/level/weeks/description) contient des `UserProgramSession`
> (weekNumber, dayIndex, order → pointe vers une `UserSession`). Une `UserSession`
> a des `UserSessionBlock` (format, timeCapSec, restSec, targetRounds) et des
> `UserSessionExercise` (exerciseId, order, reps?, durationSec?, distanceM?, restSec?).
> `BlockFormat = 'strength' | 'amrap' | 'emom' | 'for_time' | 'tabata' | 'hyrox'`.

**Programme** : title « Test Luc Léger », **focus `endurance`** (PAS hyrox),
level = celui choisi par l'utilisateur, **weeks = 4**, description = résumé + les
consignes tactiques du §1. Planning : Semaines 1-2 → séances A1/A2/A3 ;
Semaines 3-4 → séances B1/B2/B3 (3 séances/semaine).

IDs catalogue à utiliser (présents dans `exercises.data.json`) :
- Course footing extérieur → **`Trail_Running_Walking`** (« Course / Footing »),
  PAS `Running_Treadmill` (tapis).
- Sprints / intervalles course → **`Wind_Sprints`** (ou un exercice « Sprint / Course rapide »).
- Navette / allers-retours → **`Wind_Sprints`** avec `distanceM = 20` (à défaut d'un
  « shuttle run » dédié ; si tu ajoutes un exercice « Navette 20 m », encore mieux).
- Fentes sautées → **`Split_Jump`**. Squats sautés → **`Freehand_Jump_Squat`**.

### Phase 1

**A1 — VMA Courte**
- Bloc 1 (échauffement) : format `strength`, 1 exo `Trail_Running_Walking`, `durationSec = 600` (10 min, allure facile).
- Bloc 2 : format **`tabata`**, `timeCapSec = 30` (effort), `restSec = 30` (repos), `targetRounds = 8`, exo `Wind_Sprints`.
- Bloc 3 : identique au bloc 2 (la **2ᵉ série** de 8×30/30).
- **Récup 3 min entre les séries** : `restSec = 180` sur le bloc 2 (repos après série) OU note explicite. notes séance : « 3 min de récupération entre les 2 séries ».

**A2 — Spécifique Luc Léger**
- Bloc 1 (échauffement) : `Trail_Running_Walking`, `durationSec = 600`.
- Blocs 2-3-4 (**3 séries**) : chacun format `for_time` (ou `strength`), 1 exo
  `Wind_Sprints`, `reps = 6` (allers-retours), `distanceM = 20`, `restSec = 120`
  (2 min entre séries). notes : « demi-tour net, alterner la jambe de pivot ».

**A3 — Endurance de Base**
- Bloc unique : format `strength`, 1 exo `Trail_Running_Walking`,
  `durationSec = 2700` (45 min). notes : « footing continu à aisance respiratoire
  (capable de tenir une conversation) ».

### Phase 2

**B1 — Fractionné 15/15**
- Bloc 1 (échauffement) : `Trail_Running_Walking`, `durationSec = 600`.
- Bloc 2 : format `tabata`, `timeCapSec = 15`, `restSec = 15`, `targetRounds = 10`, exo `Wind_Sprints`.
- Bloc 3 : identique (2ᵉ série). Récup 3 min entre séries (`restSec = 180` / note).

**B2 — Test à Blanc**
- Bloc 1 (échauffement) : `Trail_Running_Walking`, `durationSec = 600` (échauffement complet).
- Bloc 2 : format `strength`, 1 exo `Wind_Sprints` (ou « Test Luc Léger »),
  notes : « Test Luc Léger en conditions réelles, bande sonore officielle ;
  caler l'allure sur le bip ». (Pas de reps chiffrées : effort jusqu'à épuisement.)

**B3 — Endurance + Pliométrie**
- Bloc 1 : format `strength`, `Trail_Running_Walking`, `durationSec = 1800` (30 min footing).
- Bloc 2 : format `for_time` (ou `strength`), `targetRounds = 4` (**4 séries**),
  exos : `Split_Jump` `reps = 10` (fentes sautées) + `Freehand_Jump_Squat`
  `reps = 10` (squats sautés).

---

## 4) COMMENT APPLIQUER LA CORRECTION

⚠️ Ce sont les **données du compte de l'utilisateur** (RLS owner-only), pas du code.
- **Ne JAMAIS** utiliser la clé Supabase `service_role`.
- Voie recommandée : corriger **via le Program Builder de l'app** (l'utilisateur
  connecté), ou via la couche repository `user-programs.ts` avec sa session — en
  **éditant** les séances existantes plutôt qu'en créant des doublons (repère le
  `UserProgram` « Test Luc Léger » et ses 6 `UserSession`, puis remplace blocs +
  exercices selon §3, et écris les `notes`).
- Vérifie que `updateUserSession` écrit bien les `notes` et remplace les
  exercices/blocs **atomiquement** (cf. `fix-code-review-lot2.md` §A — si ce
  correctif n'est pas encore passé, fais-le d'abord, sinon l'édition peut vider
  une séance en cas d'échec).
- Après correction : rouvrir SEMAINE 1 → 3 séances conformes au §3 (échauffement
  visible, 2 séries de 8×30/30 pour VMA Courte, footing 45 min extérieur, etc.).

---

## QUALITÉ & RÈGLES
- Pas de tag **Hyrox** ni de **tapis** : focus `endurance`, footing extérieur.
- pnpm typecheck && pnpm lint && pnpm test verts ; export:web OK.
- i18n : toute chaîne visible dans fr/en/es/pt/de.
- Branche `claude/spot-wellness-app-r6l5bj` uniquement ; `git pull --rebase` avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase `service_role`.
- L'apparence change (séances du programme) → **APERÇU VISUEL** de SEMAINE 1 & 2
  après correction.
