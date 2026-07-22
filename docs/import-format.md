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

## Export Garmin brut — reconnu automatiquement

Les fichiers de l'export RGPD Garmin (dossier **`DI-Connect-Wellness`**) sont
**détectés et convertis automatiquement** — pas besoin de les mettre au format
ci-dessus. Sélectionne-les directement (tu peux en choisir plusieurs d'un coup) :

| Fichier Garmin | Donnée importée | État |
|---|---|---|
| `*_sleepData.json` | Durée de sommeil (deep+light+REM) | ✅ |
| `*_userBioMetrics.json` | Poids (grammes → kg) | ✅ |
| *HRV / FC de repos / stress* | — | 🔜 (fichier à identifier) |

> L'archive est un `.zip` : dézippe-la d'abord, puis choisis les fichiers `.json`
> voulus dans `DI-Connect-Wellness`. Le dézippage in-app viendra plus tard ;
> pour l'instant on importe les `.json` directement.

La HRV / FC de repos / stress ne sont pas dans `sleepData` ni `userBioMetrics` :
elles vivent dans un autre fichier (`DI-Connect-Metrics` ou un `HealthStatusData`),
qui sera ajouté à l'adaptateur une fois son format vu.
