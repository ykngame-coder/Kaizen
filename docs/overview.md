# SUPOTSU — vue d'ensemble

> Récapitulatif de l'app, à lire au démarrage (utile pour toute session, y compris
> Claude Cowork). Pour l'état de dev et les prochaines actions, voir aussi
> `docs/mac-session.md` et `docs/prompts/`.

## Ce que c'est
Une app mobile **Sport + Santé + Bien-être**, tout-en-un, qui centralise
l'entraînement, le sommeil, la récupération et la nutrition, et **explique** chaque
recommandation. Philosophie « **aucune boîte noire** » : tout conseil ou score
s'accompagne d'une **Observation → Analyse → Action** et d'un **niveau de
confiance** ; chaque donnée porte sa source, sa date et sa fiabilité. Dark-mode
d'abord, **offline-first**, en français.

## Stack
Monorepo pnpm + Turborepo. App **Expo (SDK 54) / React Native 0.81** avec Expo
Router. Moteurs métier **purs et testés** (Vitest) découplés de l'UI. Backend
**Supabase** (Postgres + Auth + RLS propriétaire-seul + Edge Functions).
Déploiement web sur Vercel ; app iOS distribuée via **TestFlight** (déjà en test).

## Navigation — 5 onglets
- **Accueil** : tableau de bord (score du jour, focus, KPIs sommeil/HRV/FC/poids,
  objectifs du jour) avec **cartes personnalisables** (afficher/masquer + réordonner).
- **Sport** : séance du jour, **récupération musculaire** sur une silhouette
  anatomique (par groupe), charge d'entraînement (ACWR), records/1RM,
  **bibliothèque de 873 exercices** + création d'exercices perso, séances / planning /
  calendrier, minuteurs (Tabata/HIIT/EMOM), étirements, photos de progression.
- **Sommeil & bien-être mental** : score de nuit (durée, efficacité, **régularité,
  dette**, phases), HRV/FC/stress, check-in humeur, respiration guidée, méditation,
  stimulation bilatérale, sons, rythme circadien.
- **Nutrition** : calories + macros du jour, repas, **scan de code-barres**
  (Open Food Facts), hydratation, poids & composition, journal, score nutrition.
- **Profil** : édition profil, réglages (unités, notifs, confidentialité,
  **export JSON**), objectifs & progression, **analytics 7j/4sem/1an avec
  corrélations expliquées**, communauté / défis, marketplace de programmes,
  habitudes, connecteurs, support, base de connaissances « Comprendre ».

## Scores (moteurs)
Récupération (sommeil + HRV vs base + FC repos vs base + stress), sommeil
(`computeSleepScore2`), nutrition, et un score Supotsu global agrégé — tous
**renormalisés sur les données disponibles**, avec confiance.

## Santé & connecteurs
Lecture **HealthKit native** (HRV, FC, sommeil, poids, composition, séances) +
auto-sync à l'ouverture + **miroir vers Apple Santé** ; import **Garmin (FIT)** et
**Health Auto Export (JSON)** ; intégrations Garmin/Strava.

## Confidentialité
Compte requis, données isolées par utilisateur (RLS), pages **Confidentialité /
CGU / Support** conformes Apple, domaine **kaizensupotsu.uk**.

## État actuel
En **test TestFlight** (2 rounds de retours corrigés). Chantiers préparés (prompts
dans `docs/prompts/`) : refonte des scores (score Sport), carrousel de cartes,
import de séance par capture d'écran (OCR), suivi du sommeil par le téléphone +
réveil intelligent, app **Apple Watch** (niveaux 1 et 2).
