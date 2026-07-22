# Apple Santé (HealthKit) — build de dev + intégration

Apple Santé n'existe pas dans Expo Go : il faut un **build de développement**.
La **normalisation est déjà codée et testée** (`packages/connectors/src/appleHealth.ts`) ;
il reste la couche native iOS + le build, à faire **sur une machine capable de
builder** (EAS Build cloud) — idéalement via le Claude local.

## Prérequis (à connaître d'emblée)

- Un compte **Expo** (gratuit) + **EAS CLI** (`npm i -g eas-cli`).
- Pour installer le build sur un **iPhone physique** via EAS : un **compte Apple
  Developer (99 $/an)**. Le compte Apple gratuit ne fonctionne que par signature
  locale dans Xcode (Mac récent) — pas via EAS.
- `eas.json` (profil `development`) est déjà présent dans `apps/mobile/`.

## Étape 1 — Installer les dépendances natives (versions correctes via Expo)

> Ne pas les fixer à la main : `expo install` choisit les versions exactes du SDK 54.

```bash
cd apps/mobile
npx expo install expo-dev-client @kingstinct/react-native-healthkit
```

## Étape 2 — Config plugin + permission (app.json)

Ajouter le plugin HealthKit et la description de permission (obligatoire Apple) :

```jsonc
// apps/mobile/app.json → expo.plugins (en plus des plugins existants)
[
  "@kingstinct/react-native-healthkit",
  { "NSHealthShareUsageDescription": "Supotsu lit tes données santé (sommeil, HRV, FC) pour les centraliser et te les expliquer." }
]
```

(HealthKit est iOS-only ; l'entitlement est ajouté par le plugin.)

## Étape 3 — Couche native iOS (fichiers par plateforme)

Créer deux fichiers pour que le bundle web/Android ne casse pas :

- `apps/mobile/src/features/connectors/appleHealthNative.ts` (repli non-iOS) :
  chaque fonction renvoie « indisponible ».
- `apps/mobile/src/features/connectors/appleHealthNative.ios.ts` (réel) : utilise
  `@kingstinct/react-native-healthkit` puis **réutilise la normalisation testée** :

```ts
import { requestAuthorization, queryQuantitySamples, queryCategorySamples, queryWorkoutSamples } from '@kingstinct/react-native-healthkit';
import { normalizeHealthKitSamples, aggregateHealthKitSleep, normalizeHealthKitWorkout } from '@supotsu/connectors';

// 1) requestAuthorization([...types lecture: HRV, RestingHeartRate, SleepAnalysis, BodyMass, BodyFatPercentage, workouts])
// 2) queryQuantitySamples(...) → map vers { quantityType, value, unit, startDate } → normalizeHealthKitSamples()
// 3) queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', ...) → { value, startDate, endDate } → aggregateHealthKitSleep()
// 4) queryWorkoutSamples(...) → normalizeHealthKitWorkout()
// 5) renvoyer { activities, healthMetrics } et persister via repository.persistImport()
```

> Les fonctions `normalize*` sont déjà unit-testées : la couche native n'a qu'à
> mettre les échantillons au bon format et appeler `persistImport` (déjà dédupé
> côté santé via l'index unique).

## Étape 4 — Carte « Apple Santé » dans _Mes appareils_

Une carte iOS-only (`Platform.OS === 'ios'`) : bouton **Connecter** (autorisation)
+ **Synchroniser** (lecture + `persistImport`) + état.

## Étape 5 — Builder et installer

```bash
eas login
eas build --profile development --platform ios
# → suivre le lien, installer sur l'iPhone (via le compte Apple Developer)
npx expo start --dev-client   # puis ouvrir dans le build installé (plus Expo Go)
```

## Ce qui est déjà fait (côté dépôt)

- ✅ Normalisation HealthKit **testée** (`appleHealth.ts`, 8 tests) — HRV, FC de
  repos, sommeil agrégé par nuit, poids, masse grasse, entraînements.
- ✅ `eas.json` (profil development).
- ⏳ À faire sur la machine de build : étapes 1–5 ci-dessus.

> Astuce : ce fichier est un plan d'exécution pour le **Claude local** (sur ton
> Mac / avec EAS), qui peut installer les bonnes versions, builder et **tester
> sur ton iPhone** — ce que l'environnement cloud ne peut pas faire.
