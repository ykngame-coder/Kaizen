# Format d'import de fichier santé (JSON Supotsu)

L'écran _Mes appareils → Importer un fichier_ accepte un **fichier JSON** à ce
format. C'est la voie **gratuite, sans build, sans compte tiers** pour centraliser
un export Garmin ou Apple Santé. La normalisation est pure et testée
(`packages/connectors/src/healthImport.ts`) ; l'import est **idempotent** (les
mêmes points renvoyés deux fois ne créent pas de doublon).

## Schéma

```jsonc
{
  "source": "garmin",           // garmin | apple_health | manual | strava | oura | withings | ...
  "metrics": [
    { "type": "hrv",                 "value": 61,   "date": "2026-07-20T05:00:00Z" },
    { "type": "resting_heart_rate",  "value": 48,   "date": "2026-07-20T05:00:00Z" },
    { "type": "sleep_duration",      "value": 7.5,  "date": "2026-07-20T06:30:00Z" },
    { "type": "stress",              "value": 30,   "date": "2026-07-20T12:00:00Z" },
    { "type": "weight",              "value": 74.3, "date": "2026-07-20T07:00:00Z" }
  ],
  "activities": [
    { "type": "running", "startedAt": "2026-07-20T18:00:00Z", "durationSec": 1800,
      "distanceM": 6500, "calories": 420, "avgHeartRate": 151, "externalId": "garmin-123" }
  ]
}
```

### Types de métriques acceptés
`hrv` (ms) · `resting_heart_rate` (bpm) · `sleep_duration` (h) · `sleep_efficiency` ·
`stress` · `weight` (kg) · `body_fat` (%) · `muscle_mass` (kg) · `hydration` (ml).

### Types d'activité acceptés
`walking` · `running` · `cycling` · `swimming` · `strength` · `cross_training` ·
`hyrox` · `mobility` · `yoga` · `other` (inconnu → `other`).

Les lignes invalides (type inconnu, valeur non numérique, date illisible) sont
**ignorées** — jamais de donnée inventée.

## Et l'export Garmin brut (.zip) ?

L'export RGPD Garmin est une **archive `.zip` de fichiers JSON** au format Garmin
(différent de celui-ci). Pour l'importer directement, il faut un **adaptateur
Garmin → format Supotsu** (dézippage + conversion). Il sera codé **dès que le
format exact aura été vu** (arborescence + un extrait d'un fichier sommeil/HRV).
En attendant, tout JSON déjà au format ci-dessus s'importe immédiatement.
