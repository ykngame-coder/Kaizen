# Synchro Apple Santé par ancres — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer la relecture de 3 ans à chaque synchro par des requêtes ancrées HealthKit, avec recalcul des jours touchés, gestion des suppressions et filet hebdomadaire.

**Architecture:** calculs purs dans `packages/connectors` ; Santé derrière une interface `HealthSource` (implémentée dans `healthKitClient.ios.ts`) ; un orchestrateur `runHealthSync` testé contre un faux `HealthSource` ; une file à passage unique ; le dépôt apprend à remplacer une fenêtre et à supprimer des séances par identifiant.

**Tech Stack:** TypeScript strict, Vitest, Expo SDK 54, `@kingstinct/react-native-healthkit` 14.0.2, Supabase (PostgREST).

**Spec:** `docs/superpowers/specs/2026-09-13-synchro-sante-ancree-design.md`

## Global Constraints

- Une ancre n'avance **qu'après** un enregistrement réussi.
- On ne remplace jamais une fenêtre dont la relecture est revenue vide (garde-fou permission retirée).
- Le remplacement s'exécute après les upserts, jamais avant.
- Filet : mode complet si le dernier complet date de plus de **7** jours ; fenêtre de suppression : **30** jours ; relecture sommeil : **± 36 h**.
- Seule la source `apple_health` est remplacée ; les imports de fichiers ne passent jamais `replace`.
- Interrupteur `INCREMENTAL_SYNC` : à `false`, tout part en mode complet.
- Commentaires et libellés en français ; cinq langues pour tout nouveau libellé (fr, en, es, de, pt ; JSON indenté à 1 espace).
- Vérifications à chaque tâche : `npx tsc --noEmit -p apps/mobile`, `npx vitest run`, ESLint sur les fichiers touchés. Commit + push après chaque tâche.

---

### Task 1: calculs purs de l'incrémental

**Files:**
- Create: `packages/connectors/src/healthKitIncremental.ts`
- Create: `packages/connectors/src/healthKitIncremental.test.ts`
- Modify: `packages/connectors/src/index.ts` (export)

**Interfaces:**
- Consumes: `aggregateHealthKitSleep`, `aggregateHealthKitSleepSessions`, `HKSleepSample` (`appleHealth.ts`)
- Produces:
  - `interface TimeInterval { startDate: string; endDate: string }`
  - `touchedDayKeys(intervals: TimeInterval[]): string[]` — clés locales `AAAA-MM-JJ` triées
  - `dayKeysRange(keys: string[]): { from: Date; to: Date }` — minuit du premier jour → minuit après le dernier
  - `SLEEP_REREAD_MARGIN_MS = 36 * 3600 * 1000`
  - `sleepRereadWindow(added: TimeInterval[]): { from: Date; to: Date } | null`
  - `recomputeSleep(windowSamples: HKSleepSample[], added: TimeInterval[], window: { from: Date; to: Date }): { sessions: ImportedSleepSession[]; durations: ImportedHealthMetric[]; replace: { from: string; to: string } | null }`

- [ ] **Step 1: tests** — jours touchés (à cheval sur minuit ; fin pile à minuit ; changement d'heure) ; fenêtre ± 36 h ; `recomputeSleep` : garde la nuit touchée, écarte une nuit non touchée, recalcule la durée du jour de réveil en comptant une sieste non touchée, ne rend pas la durée d'un jour mal couvert par la fenêtre, étendue de remplacement = [début min, fin max].
- [ ] **Step 2:** `npx vitest run packages/connectors/src/healthKitIncremental.test.ts` → FAIL (module absent).
- [ ] **Step 3: implémentation** (code dans le fichier, voir `healthKitIncremental.ts` du commit).
- [ ] **Step 4:** tests PASS sous `TZ=Europe/Paris` et `TZ=America/New_York`.
- [ ] **Step 5:** commit « Calculs purs de la synchro Santé incrémentale ».

### Task 2: remplacement généralisé et suppression de séances

**Files:**
- Create: `packages/database/src/repositories/replace.ts` (+ `replace.test.ts`)
- Modify: `packages/database/src/repositories/sleep.ts` — `listSleepSessionKeys(client, userId, source, fromIso, toIso)` rend `{ id, at }[]` ; `staleSleepSessionIds` retiré (remplacé par `staleRowIds`) et ses tests déplacés
- Modify: `packages/database/src/repositories/health.ts` — `listHealthMetricKeys`, `deleteHealthMetrics`
- Modify: `packages/database/src/repositories/activities.ts` — `deleteActivitiesByExternalIds`
- Modify: `apps/mobile/src/lib/data/repository.ts` — `ImportPayload.replace`, `ImportPayload.deletedActivityExternalIds`, retrait de `replaceSleepSource`, implémentations Supabase et locale
- Create: `apps/mobile/src/features/connectors/replaceWindows.ts` (+ test) — `fullReplaceWindows`
- Modify: les trois appelants (`useHealthKitAutoSync.ts` ×2, `DevicesScreen.tsx`) et `useImportHealth` dans `queries.ts`

**Interfaces:**
- Produces:
  - `interface KeyedRow { id: string; at: string }`
  - `staleRowIds(existing: KeyedRow[], keepAts: string[], from: string, to: string): string[]` — lignes de [from, to) absentes du lot ; `[]` si aucune valeur du lot dans la fenêtre
  - `type ReplaceKind = 'sleep_session' | HealthMetricType` ; `interface ReplaceWindow { kind: ReplaceKind; from: string; to: string }`
  - `FULL_REPLACE_KINDS: ReplaceKind[]` ; `fullReplaceWindows(result: { healthMetrics; sleepSessions }, now: Date): ReplaceWindow[]`

- [ ] **Step 1: tests** `staleRowIds` (fenêtre, comparaison en ms, garde-fou) et `fullReplaceWindows` (une fenêtre par type présent, aucune pour un type absent, fin à demain).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implémentation ; les appelants passent `replace: fullReplaceWindows(result, new Date())` en attendant la tâche 6.
- [ ] **Step 4:** tsc + vitest + eslint PASS.
- [ ] **Step 5:** commit « Généraliser le remplacement Santé à tous les types ».

### Task 3: `HealthSource` et son implémentation native

**Files:**
- Create: `apps/mobile/src/features/connectors/healthSource.ts` (types seuls, aucun import natif)
- Modify: `apps/mobile/src/features/connectors/healthKitClient.ios.ts` — `nativeHealthSource`, extraction de `requestHealthKitAuthorization` et `readStepTotals`, retrait de l'option `days`
- Modify: `apps/mobile/src/features/connectors/healthKitClient.ts` (bouchon web)

**Interfaces:**
- Produces:
  - `type PointMetricKey` = les 5 identifiants de `QUANTITY_TYPES` ; `type HealthTypeKey = 'workouts' | 'sleep' | 'steps' | PointMetricKey`
  - `type Added = { kind: 'workouts'; workouts: HKWorkout[] } | { kind: 'sleep'; samples: HKSleepSample[] } | { kind: 'steps'; intervals: TimeInterval[] } | { kind: 'quantity'; samples: HKQuantitySample[] }`
  - `interface ChangeSet { added: Added; deletedUuids: string[]; newAnchor: string }`
  - `interface FullRead { activities; healthMetrics; sleepSessions }`
  - `interface HealthSource { types; authorize(); currentAnchor(type): Promise<{ anchor: string; via: 'empty-query' | 'paged' } | null>; changesSince(type, anchor): Promise<ChangeSet>; readSleep(from, to); stepTotals(from, to); readQuantity(type, from, to); fullRead() }`

- [ ] **Step 1:** implémentation (natif non testable ici ; la logique testable est dans les tâches 1, 4, 5).
- [ ] **Step 2:** tsc + eslint PASS.
- [ ] **Step 3:** commit « Exposer Santé derrière une interface HealthSource ».

### Task 4: orchestrateur `runHealthSync`

**Files:**
- Create: `apps/mobile/src/features/connectors/healthSyncEngine.ts` (+ `healthSyncEngine.test.ts`)

**Interfaces:**
- Consumes: tâches 1 à 3, `syncWindow`/`trimToWindow`, `normalizeHealthKitSamples`, `normalizeHealthKitWorkout`, `aggregateHealthKitSleep*`
- Produces:
  - `INCREMENTAL_SYNC`, `FULL_SYNC_EVERY_DAYS = 7`, `DELETION_REFRESH_DAYS = 30`
  - `interface AnchorStore { get(type); set(type, anchor); clear(); lastFullAt(); setLastFullAt(at) }`
  - `interface SyncPayload extends FullRead { replace: ReplaceWindow[]; deletedActivityExternalIds: string[] }`
  - `interface SyncReport { mode; startedAt; durationMs; perType: Record<string, { added: number; deleted: number; error?: string }>; anchorsVia: Record<string, 'empty-query' | 'paged' | 'existing'> }`
  - `runHealthSync(deps: { source; anchors; persist(p: SyncPayload): Promise<void>; now(): Date }, requested: SyncMode): Promise<SyncReport>`

- [ ] **Step 1: tests** — les 9 scénarios de la spec, contre un faux `HealthSource` et un `AnchorStore` en mémoire.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implémentation.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit « Orchestrer la synchro Santé par ancres ».

### Task 5: file à passage unique

**Files:**
- Create: `apps/mobile/src/features/connectors/healthSyncQueue.ts` (+ test)

**Interfaces:**
- Produces: `type SyncMode = 'incremental' | 'full'` ; `createSyncQueue(run: (mode: SyncMode) => Promise<void>): (mode: SyncMode) => Promise<void>`

- [ ] **Step 1: tests** — dix demandes simultanées → deux exécutions ; une demande complète en attente l'emporte ; chaque promesse se résout après l'exécution qui la couvre ; une exécution qui échoue ne bloque pas la suivante.
- [ ] **Step 2:** FAIL. **Step 3:** implémentation. **Step 4:** PASS.
- [ ] **Step 5:** commit « Une seule synchro Santé à la fois ».

### Task 6: câblage, stockage des ancres, diagnostic

**Files:**
- Create: `apps/mobile/src/features/connectors/healthSyncStore.ts` — `createAnchorStore(userId)`, `saveSyncReport`, `loadSyncReport`
- Modify: `useHealthKitAutoSync.ts` — une file partagée ; ouverture, arrivée de données et bouton → `'incremental'` ; retrait de `MANUAL_SYNC_DAYS`
- Modify: `DevicesScreen.tsx` — bouton → `'full'` ; ligne « Dernière synchro »
- Modify: `queries.ts` — `useImportHealth` accepte `replace` et `deletedActivityExternalIds`
- Modify: les cinq fichiers de langue — `connectors.devices.healthKit.lastSync.*`

- [ ] **Step 1:** implémentation.
- [ ] **Step 2:** tsc + vitest + eslint PASS.
- [ ] **Step 3:** commit « Brancher la synchro Santé par ancres ».

### Task 7: vérification finale

- [ ] `npx vitest run` sous trois fuseaux pour `packages/connectors` et `apps/mobile/src/features/connectors`.
- [ ] Relecture du diff complet contre la spec (règle d'or, garde-fou, ordre upsert → remplacement).
- [ ] Liste de recette : section « Synchro Santé » dans l'artifact de recette.
