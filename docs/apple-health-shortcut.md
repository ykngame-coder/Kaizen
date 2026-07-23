# Apple Santé via Raccourcis iOS (gratuit, automatique, sans build)

Cette voie récupère tes données Apple Santé (HRV, FC de repos, sommeil…) **sans
build de dev, sans Mac, sans les 99 $**. Un **Raccourci iOS** lit tes données et
les envoie à une Edge Function ; l'app les affiche ensuite normalement.

> Comme tes données Garmin transitent déjà par Apple Santé (c'est ainsi que Bevel
> voit ta HRV), cette voie te donne bien la **HRV**.

## Côté serveur (une fois)

1. Applique la migration `supabase/migrations/0007_apple_health_ingest.sql`.
2. Déploie la fonction :
   ```bash
   supabase functions deploy apple-health --no-verify-jwt
   ```
   (`--no-verify-jwt` : le Raccourci s'authentifie avec l'ingest token, pas un JWT.)

## Côté app (une fois)

_Profil → Mes appareils → Apple Santé (Raccourcis) → **Générer mon jeton**._
Note l'**URL** et le **JETON** affichés (appui long pour copier).

## Créer le Raccourci (app Raccourcis, gratuite)

> Recette détaillée **action par action** (avec le JSON multi-métriques prêt à
> coller) : voir [`apple-health-shortcut-recipe.md`](./apple-health-shortcut-recipe.md).

Crée un raccourci « Envoyer ma santé à Supotsu » avec ces actions :

1. **Rechercher des échantillons de santé** — Type *Variabilité de la fréquence
   cardiaque*, Trier par *Date de fin* décroissant, Limite *1*.
2. **Obtenir la valeur numérique** de l'échantillon → variable `hrv`.
   (Répète 1–2 pour *Fréquence cardiaque au repos*, *Analyse du sommeil*, etc.)
3. **Texte** — construis le corps JSON :
   ```json
   { "metrics": [
     { "type": "hrv", "value": [hrv], "date": "[date ISO]" },
     { "type": "resting_heart_rate", "value": [fc], "date": "[date ISO]" }
   ] }
   ```
   (Types acceptés : `hrv`, `resting_heart_rate`, `sleep_duration`, `stress`,
   `weight`, `body_fat`, `hydration`. La date en ISO 8601.)
4. **Obtenir le contenu de l'URL** :
   - URL : *(l'URL affichée dans l'app)*
   - Méthode : **POST**
   - En-têtes : `X-Supotsu-Token` = *(le jeton affiché)*, `Content-Type` = `application/json`
   - Corps de la requête : **Fichier** → le *Texte* de l'étape 3.

## Automatiser (facultatif mais recommandé)

Raccourcis → onglet **Automatisation** → **+** → *Heure de la journée* (ex. 8 h) →
lancer ce raccourci → **Exécuter immédiatement** (sans confirmation, iOS 17+).
→ Tes données remontent **chaque matin, toutes seules**.

## Vérifier

Après un envoi, la réponse doit être `{"ok":true,"ingested":N}`. Dans l'app, tes
métriques santé apparaissent (Dashboard / Récupération), chacune `source =
apple_health`, **dédupliquées** (renvoyer deux fois le même point n'ajoute rien).

## Sécurité

- Le **jeton d'ingestion** n'autorise que l'écriture de **tes** données santé.
  Garde-le privé ; tu peux le **régénérer** dans l'app (l'ancien cesse alors de
  fonctionner).
- Normalisation identique à `packages/connectors/src/appleHealth.ts` (testée).
