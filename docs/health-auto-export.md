# Apple Santé via Health Auto Export (gratuit, automatisable)

[Health Auto Export](https://apps.apple.com/app/health-auto-export/id1115567069)
est une app iOS qui exporte tes données Apple Santé en **JSON**, soit vers un
**fichier**, soit en **POST automatique vers une URL** (REST API). C'est le pont
le plus pratique : gratuit, sans build, et **automatisable**.

Le parsing est **déjà codé et testé** (`packages/connectors/src/healthAutoExport.ts`,
7 tests) et branché sur l'import existant : dès que le JSON a la forme Health Auto
Export, il est reconnu et converti automatiquement.

## Ce qui est importé (vérifié sur un export réel)
- **Sommeil** → durée (`sleep_duration`) + efficacité (`sleep_efficiency`)
- **FC au repos** (`resting_heart_rate`)
- **Poids** (`weight`), **masse grasse** (`body_fat`), **masse maigre** (`muscle_mass`)
- **Hydratation** (`dietary_water` → `hydration`)
- **Séances** (workouts → activités, énergie kJ convertie en kcal, FC moyenne)

> ⚠️ **HRV** : absente de cet export, car **Garmin ne pousse pas la HRV vers Apple
> Santé**. Aucune app tierce ne peut la re-partager. Pour la HRV, garde la voie
> **export Garmin** (déjà gérée par l'app).

Les données sont marquées `source = apple_health` et **dédupliquées** (réimporter
le même point n'ajoute rien).

---

## Mode A — Import fichier (marche **dès maintenant**, même en démo, sans backend)

1. Dans **Health Auto Export** : onglet **Export** → choisis tes métriques et la
   période → format **JSON** → **Enregistrer dans Fichiers**.
2. Dans **SUPOTSU** : _Profil → Mes appareils → Importer un fichier_ → sélectionne
   le `.json`. Tes métriques et séances apparaissent (Dashboard, Récupération, …).

C'est le moyen le plus simple pour tester tout de suite.

---

## Mode B — POST automatique (REST API) — quand le backend Supabase sera en ligne

Health Auto Export envoie le JSON tout seul, sur un rythme choisi.

**Pré-requis** (une fois) : projet Supabase déployé + fonction `apple-health`
(voir `apple-health-shortcut.md`). Puis dans l'app : _Profil → Mes appareils →
Apple Santé → Générer mon jeton_ (récupère l'**URL** et le **JETON**).

Dans **Health Auto Export** : onglet **Automations** → **+** :
- **Automation type** : *REST API*
- **URL** : *(l'URL d'ingestion affichée dans l'app, `…/functions/v1/apple-health/ingest`)*
- **Method** : **POST**
- **Headers** : `X-Supotsu-Token` = *(ton jeton)*
- **Data format** : **JSON** (Aggregated — 1 point/jour suffit)
- **Metrics / Workouts** : coche ce que tu veux envoyer
- **Fréquence** : ex. *Daily* (ou *Every 6 hours*)

L'endpoint accepte **directement** le format natif Health Auto Export
(`{ "data": { "metrics": […] } }`) — rien à transformer côté iPhone. Réponse
attendue : `{ "ok": true, "ingested": N }`.

> Côté automatique, l'endpoint ingère les **métriques santé** (sommeil, FC repos,
> poids, masse grasse/maigre, hydratation). Les **séances** passent par l'import
> fichier (Mode A) — l'app les gère mais l'endpoint reste focalisé santé.

---

## Où c'est dans le code
- `packages/connectors/src/healthAutoExport.ts` — parsing natif → forme générique
  (`isHealthAutoExport`, `healthAutoExportToSupotsu`, `haeDateToIso`).
- `packages/connectors/src/healthImport.ts` — `parseHealthExport` détecte la forme
  Health Auto Export et délègue automatiquement.
- `supabase/functions/apple-health/index.ts` — l'Edge Function accepte aussi le
  format `{ data: { metrics } }` (voie REST API).

## Dépannage
| Symptôme | Cause | Solution |
|---|---|---|
| `ingested: 0` | métriques non mappées ou vides | vérifie que l'export contient bien sommeil/FC/poids… |
| Pas de HRV | Garmin ne l'exporte pas vers Santé | utilise l'export Garmin pour la HRV |
| `401` | jeton absent/périmé | recolle/régénère le jeton dans l'app |
| Poids en lb | app Santé en unités impériales | passe Santé en kg |
