# Recette du Raccourci « Envoyer ma santé à Supotsu »

Recette **action par action** à recopier dans l'app **Raccourcis** (iOS, gratuite).
Complète le guide `apple-health-shortcut.md`. Aucun build, aucun Mac, pas d'expiration.

**Pré-requis** : dans l'app SUPOTSU, _Profil → Mes appareils → Apple Santé
(Raccourcis) → **Générer mon jeton**_. Note l'**URL** et le **JETON** (appui long =
copier). Ils remplacent `<URL_INGEST>` et `<TON_JETON>` ci-dessous.

- `<URL_INGEST>` ressemble à `https://xxxx.supabase.co/functions/v1/apple-health/ingest`
- Types acceptés par le serveur : `hrv`, `resting_heart_rate`, `sleep_duration`,
  `weight`, `body_fat`, `hydration`. (`stress` est accepté mais Apple Santé ne le
  fournit pas nativement — c'est une donnée Garmin ; on le laisse de côté ici.)

---

## Actions à ajouter (dans cet ordre)

> Dans Raccourcis : **+** (nouveau raccourci) → **Ajouter une action** → cherche
> chaque action par son nom et règle les paramètres indiqués.

### 1) Date du jour au format ISO (réutilisée par toutes les métriques)
1. **Date** (action « Date ») → laisse « Date actuelle ».
2. **Formater la date** :
   - Format de date : **Personnalisé**
   - Chaîne de format : `yyyy-MM-dd'T'HH:mm:ss'Z'`
   - Renomme le résultat en variable **`DateISO`** (appui long sur la variable → Renommer).

### 2) HRV (variabilité de la fréquence cardiaque)
3. **Rechercher des échantillons de santé** :
   - Type : **Variabilité de la fréquence cardiaque**
   - Trier par : **Date de fin** — **Décroissant**
   - Limite : **1**
4. **Obtenir la valeur numérique de l'échantillon de santé** (entrée = résultat de l'étape 3)
   → renomme la variable en **`HRV`**.

### 3) Fréquence cardiaque au repos
5. **Rechercher des échantillons de santé** : Type **Fréquence cardiaque au repos**,
   tri **Date de fin décroissant**, limite **1**.
6. **Obtenir la valeur numérique…** → variable **`FCrepos`**.

### 4) Poids (optionnel — si tu te pèses avec une balance connectée)
7. **Rechercher des échantillons de santé** : Type **Poids**, tri décroissant, limite **1**.
8. **Obtenir la valeur numérique…** → variable **`Poids`**.
   > ⚠️ Vérifie que ton app Santé est en **kg** (Réglages Santé). Le serveur stocke
   > la valeur telle quelle avec l'unité `kg`.

### 5) Masse grasse (optionnel — balance à impédance)
9. **Rechercher des échantillons de santé** : Type **Pourcentage de masse grasse**,
   tri décroissant, limite **1**.
10. **Obtenir la valeur numérique…** → variable **`MasseGrasse`**.
    > La valeur d'Apple Santé est une fraction (0.18 = 18 %). Le serveur attend un
    > **pourcentage** : multiplie par 100 → **Calculer** `MasseGrasse × 100` →
    > variable **`MasseGrassePct`**.

### 6) Construire le corps JSON
11. **Texte** — colle exactement ceci, puis remplace chaque `⟦…⟧` par la variable
    correspondante (appuie à l'emplacement et choisis la variable) :

```json
{ "metrics": [
  { "type": "hrv", "value": ⟦HRV⟧, "date": "⟦DateISO⟧" },
  { "type": "resting_heart_rate", "value": ⟦FCrepos⟧, "date": "⟦DateISO⟧" },
  { "type": "weight", "value": ⟦Poids⟧, "date": "⟦DateISO⟧" },
  { "type": "body_fat", "value": ⟦MasseGrassePct⟧, "date": "⟦DateISO⟧" }
] }
```

> **Important** : le JSON doit rester valide. Supprime la ligne d'une métrique que
> tu ne collectes pas (ex. pas de balance → enlève `weight` et `body_fat`), et
> veille à ce qu'il n'y ait **pas de virgule après le dernier élément**.
> Version minimale qui marche pour tout le monde (HRV + FC repos) :
>
> ```json
> { "metrics": [
>   { "type": "hrv", "value": ⟦HRV⟧, "date": "⟦DateISO⟧" },
>   { "type": "resting_heart_rate", "value": ⟦FCrepos⟧, "date": "⟦DateISO⟧" }
> ] }
> ```

### 7) Envoyer au serveur
12. **Obtenir le contenu de l'URL** :
    - URL : **`<URL_INGEST>`**
    - Développe **Afficher plus** :
      - Méthode : **POST**
      - En-têtes :
        - `X-Supotsu-Token` = **`<TON_JETON>`**
        - `Content-Type` = **`application/json`**
      - Corps de la requête : **Fichier** → sélectionne le **Texte** de l'étape 11.

### 8) (Facultatif) Confirmer que ça a marché
13. **Obtenir la valeur du dictionnaire** `ingested` depuis le résultat de l'étape 12.
14. **Afficher une notification** : `Santé envoyée : ⟦ingested⟧ mesure(s).`
    > Réponse attendue du serveur : `{ "ok": true, "ingested": N }`.

Nomme le raccourci **« Envoyer ma santé à Supotsu »** et enregistre.

---

## Automatiser (chaque matin, sans y penser)
1. Raccourcis → onglet **Automatisation** → **+** → **Créer une automatisation perso**.
2. Déclencheur : **Heure de la journée** → ex. **8:00**, **Quotidien**.
3. Action : **Exécuter le raccourci** → « Envoyer ma santé à Supotsu ».
4. Désactive **Demander avant d'exécuter** → **Exécuter immédiatement** (iOS 17+).

→ Tes données remontent toutes seules chaque matin. Autorise l'accès à Santé à la
première exécution (Raccourcis le demande une fois).

---

## Sommeil (avancé, optionnel)
`sleep_duration` attend un **nombre d'heures**. Dans Raccourcis, additionner les
phases de sommeil de la nuit est fastidieux. Deux options :
- **Le plus simple** : ne pas envoyer le sommeil ici — l'**export Garmin** (déjà
  géré par l'app) couvre très bien le sommeil détaillé.
- **Avancé** : `Rechercher des échantillons de santé` → **Analyse du sommeil**
  (échantillons « Endormi » des dernières 18 h) → pour chacun `Obtenir la durée` →
  `Additionner` → convertir en heures (`÷ 3600` si secondes) → envoyer en
  `{ "type": "sleep_duration", "value": ⟦heures⟧, "date": "⟦DateISO⟧" }`.

---

## Dépannage
| Réponse | Cause | Solution |
|---|---|---|
| `401 missing token` / `invalid token` | en-tête `X-Supotsu-Token` absent ou périmé | recolle le jeton ; régénère-le dans l'app si besoin |
| `400` / erreur de parsing | JSON invalide | vérifie les virgules et que le corps est bien le **Fichier** Texte |
| `ok:true, ingested:0` | aucun échantillon trouvé | vérifie que Santé contient bien ces données (via Garmin/Apple) |
| Valeurs de poids fausses | app Santé en lb | passe Santé en kg, ou ajoute une conversion dans le raccourci |

Le jeton n'autorise **que l'écriture de tes propres données santé**. Garde-le privé ;
tu peux le **régénérer** dans l'app à tout moment (l'ancien cesse alors de marcher).
