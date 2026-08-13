# Fiche App Store — SUPOTSU (à coller dans App Store Connect)

> Langue de la fiche : **Français (France)**. Les longueurs sont validées au
> caractère près (limites Apple indiquées). Ne promets aucune fonction absente
> du build — Apple rejette la fiche sinon. Mets ce fichier à jour quand une
> feature apparaît/disparaît.

## Nom de l'app (30 max)
```
SUPOTSU
```

## Sous-titre (30 max) — 27 caractères
Riche en mots-clés (le titre ne contient que « SUPOTSU », donc le sous-titre
porte les termes de recherche sport/sommeil/nutrition).
```
Sport · sommeil · nutrition
```
Alternatives (au choix) :
- `Le progrès, sans boîte noire` (28) — axée philosophie
- `Vos progrès, expliqués` (22)

## Texte promotionnel (170 max) — 164 caractères
Modifiable **sans review** — sert d'accroche, à changer selon les campagnes.
```
Sport, sommeil et nutrition enfin réunis. Chaque conseil est expliqué — observation, analyse, action — avec son niveau de confiance. Vos données restent les vôtres.
```

## Mots-clés (100 max) — 97 caractères
Champ interne (invisible). Sans espaces après les virgules (Apple les compte).
Ne pas répéter le nom de l'app ni les mots du titre.
```
fitness,musculation,sommeil,nutrition,bien-être,santé,HRV,cardio,calories,forme,coach,macro,poids
```

## Description (4000 max) — 1880 caractères
```
SUPOTSU réunit votre sport, votre sommeil et votre nutrition dans une seule app claire et honnête. Fini les scores tombés du ciel : chaque recommandation vous est expliquée — ce qu'on a observé, ce qu'on en déduit, ce qu'on vous conseille — avec son niveau de confiance. Aucune boîte noire.

SPORT
• Créez vos séances, suivez vos séries, vos charges et vos temps de repos.
• Suggestions de surcharge progressive basées sur votre historique réel.
• Silhouette de récupération musculaire : voyez d'un coup d'œil quels muscles sont frais et lesquels ont besoin de repos.
• Charge d'entraînement (ratio aigu/chronique), records personnels et estimations de 1RM.
• Minuteur d'intervalles (Tabata, HIIT, EMOM ou perso).

SOMMEIL & BIEN-ÊTRE MENTAL
• Score de sommeil, phases et signaux (fréquence cardiaque, HRV) à partir de vos données importées.
• Check-in d'humeur et de stress, avec historique et tendances.
• Respiration guidée et modules de méditation pour récupérer, sur le corps comme sur la tête.

NUTRITION
• Ajoutez vos repas, scannez un code-barres (base Open Food Facts) ou saisissez à la main.
• Suivi des calories et des macros, hydratation, objectifs ajustables jour après jour.

OBJECTIFS & ANALYSES
• Fixez des objectifs et suivez vos courbes de progression dans le temps.
• Vue transversale 7 jours / 4 semaines / 1 an, avec des corrélations expliquées entre sport, sommeil et nutrition.

VOS DONNÉES, VOTRE PROPRIÉTÉ
• Chaque donnée porte sa source, sa date et sa fiabilité — rien n'est écrasé, tout est historisé.
• Connexion à Apple Santé : sommeil, HRV, fréquence cardiaque de repos, poids et composition corporelle sont lus directement (avec votre autorisation), ou importés par fichier d'export pour vos autres appareils.
• Conçue hors-ligne d'abord et en mode sombre : rapide, lisible, sans superflu.

SUPOTSU ne cherche pas à vous impressionner avec des chiffres magiques. L'app vous montre pourquoi, vous laisse décider, et respecte vos données. Le progrès, en clair.
```

## Nouveautés de cette version (4000 max)
Pour la **première** soumission :
```
Première version de SUPOTSU. Merci de tester ! Sport, sommeil, bien-être mental et nutrition réunis, avec des recommandations toujours expliquées. Vos retours nous aident à corriger les derniers détails avant la sortie.
```
Modèle pour les **mises à jour** suivantes (remplacer au fil des correctifs) :
```
• Corrections de bugs remontés par les testeurs.
• Améliorations de performance et de stabilité.
• [décrire ici les nouveautés visibles de la version]
```

## URL de support (obligatoire)
Apple exige une page de contact/support accessible. Options :
- Réutiliser le site web : `https://kaizen-ykn1.vercel.app/` (ajouter une
  section/contact ou une adresse e-mail visible).
- Ou une simple page « Support » avec l'e-mail : `ykngame@gmail.com`.
```
https://kaizen-ykn1.vercel.app/
```
> À confirmer : la page doit contenir un moyen de contact réel (e-mail suffit).

## URL marketing (facultative)
```
https://kaizen-ykn1.vercel.app/
```

## Politique de confidentialité (obligatoire pour publier)
Apple exige une URL de politique de confidentialité **avant la mise en vente**
(pas pour le test interne TestFlight, mais requise pour la review App Store).
À héberger, p. ex. `https://kaizen-ykn1.vercel.app/confidentialite`.
Doit couvrir : données collectées (compte, santé importée), usage, stockage
(Supabase, RLS propriétaire-seul), absence de revente, contact.
```
https://kaizen-ykn1.vercel.app/confidentialite   (à créer)
```

## Catégorie
- Principale : **Forme et santé** (Health & Fitness)
- Secondaire (facultatif) : **Style de vie**

## Classification par âge
Pas de contenu sensible → classification **4+** attendue (répondre « aucun » à
toutes les questions du questionnaire de contenu).

## App Privacy (questionnaire « nutrition label »)
À remplir dans App Store Connect → *App Privacy*. Points à déclarer :
- **Données de santé et forme** : **lues via HealthKit** (sommeil, HRV,
  fréquence cardiaque de repos, poids, masse grasse/maigre), saisies par
  l'utilisateur (nutrition), ou importées par fichier (Garmin) — liées au
  compte, **non utilisées pour le suivi publicitaire**.
- **Coordonnées** : e-mail (compte).
- **Identifiants** : identifiant utilisateur (compte Supabase).
- Aucune donnée vendue, aucun tracking tiers.
> ✅ **Lecture HealthKit native active** (`healthKitClient.ios.ts`, catégories :
> HRV SDNN, FC de repos, poids, % masse grasse, masse maigre, analyse du
> sommeil, séances). Vérifier que le build embarque bien les chaînes
> `NSHealthShareUsageDescription` (justification d'usage) et l'entitlement
> HealthKit — Apple les contrôle. Déclarer l'accès HealthKit dans *App
> Privacy* de façon cohérente avec la politique de confidentialité.

## Rappels de cohérence
- Tout ce qui est décrit ci-dessus doit exister dans le build soumis.
- Captures d'écran requises (au moins 6,7" iPhone) : prévoir Accueil, Sport
  (silhouette de récup), Sommeil, Nutrition, Analytics.
