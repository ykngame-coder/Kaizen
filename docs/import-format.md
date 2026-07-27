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

## Health Auto Export (Apple Santé)

L'app iOS **[Health Auto Export](https://apps.apple.com/app/id1115567069)** exporte
Apple Santé en JSON. Comme **Garmin Connect se synchronise dans Apple Santé**, ce
fichier unique porte les données Garmin **y compris les phases de sommeil** — sans
Mac ni API Garmin. On choisit ce `.json` directement dans l'écran d'import, il est
reconnu automatiquement (`packages/connectors/src/healthAutoExport.ts`).

Forme du fichier :

```jsonc
{
  "data": {
    "metrics": [
      { "name": "sleep_analysis", "units": "hr",
        "data": [ { "sleepStart": "2026-06-26 01:30:31 +0200", "sleepEnd": "…",
                    "totalSleep": 6.57, "inBed": 7.77,
                    "deep": 2.28, "core": 3.03, "rem": 1.25, "awake": 1.2 } ] },
      { "name": "resting_heart_rate",  "units": "count/min", "data": [ { "qty": 51,  "date": "…" } ] },
      { "name": "weight_body_mass",    "units": "kg",        "data": [ { "qty": 102.7,"date": "…" } ] },
      { "name": "body_fat_percentage", "units": "%",         "data": [ { "qty": 30.5, "date": "…" } ] },
      { "name": "lean_body_mass",      "units": "kg",        "data": [ { "qty": 71.4, "date": "…" } ] },
      { "name": "dietary_water",       "units": "mL",        "data": [ { "qty": 3000, "date": "…" } ] }
    ],
    "workouts": [
      { "id": "…", "name": "Course à pied extérieure", "start": "…", "end": "…",
        "duration": 972.7, "distance": { "qty": 0, "units": "km" },
        "activeEnergyBurned": { "qty": 644, "units": "kJ" },
        "avgHeartRate": { "qty": 127, "units": "count/min" } }
    ]
  }
}
```

Mappage :
`sleep_analysis` → `sleep_duration` (= `totalSleep`, horodaté à l'heure de coucher)
et `sleep_efficiency` (= `totalSleep / inBed`, une efficacité **réelle**) ·
`resting_heart_rate` → `resting_heart_rate` · `weight_body_mass` → `weight` ·
`body_fat_percentage` → `body_fat` · `lean_body_mass` → `muscle_mass` ·
`dietary_water` → `hydration` · `heart_rate_variability` → `hrv`. Les `workouts`
deviennent des activités (le nom localisé est classé par mots-clés). Les métriques
non modélisées (pas, distance, macros nutritionnelles…) sont ignorées sans erreur.
Les phases (`deep`/`core`/`rem`/`awake`) sont lues mais pas encore stockées — c'est
l'étape suivante (stockage des phases + hypnogramme).

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
| `*_healthStatusData.json` | **HRV** (ms) + **FC de repos** (bpm) | ✅ |
| `UDSFile_*.json` (Aggregator) | **Stress** + FC de repos | ✅ |
| `*_summarizedActivities.json` (Fitness) | **Activités** (type, durée, distance, FC, calories) | ✅ |
| `*_benchmarks.json` | **Records de force (1RM)** | ✅ |
| `*_personalRecord.json` | **Records** course (temps/distance), force, pas | ✅ |

> **Le plus simple : choisis directement l'archive `.zip`** de ton export — elle
> est **dézippée dans l'app**, tous les fichiers reconnus sont importés d'un coup.
> Tu peux aussi sélectionner des `.json` isolés. Import **dédupliqué** : les
> activités le sont par identifiant Garmin, les métriques par (type, date).
