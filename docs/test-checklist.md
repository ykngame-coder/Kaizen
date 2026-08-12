# Checklist de test (testeurs TestFlight)

À dérouler sur chaque iPhone. Dès qu'un truc cloche : **capture d'écran** →
« Partager le retour » (TestFlight) + une phrase sur ce que tu faisais.

## Démarrage & compte
- [ ] Inscription (e-mail + mot de passe) → réception/validation si demandée.
- [ ] Onboarding complet (profil, objectif) jusqu'à l'Accueil.
- [ ] Déconnexion puis reconnexion → on retrouve bien ses données.
- [ ] (Backend réel) Créer un 2ᵉ compte sur l'autre iPhone → chacun ne voit **que
      ses propres données**.

## Navigation
- [ ] Les 5 onglets : Accueil · Sport · Sommeil · Nutrition · Profil.
- [ ] Entrer/sortir de chaque hub, bouton retour, pas d'écran figé/blanc.

## Sport
- [ ] Créer une séance (choix d'exercices, reps/charge) → enregistrée.
- [ ] Suggestion de surcharge progressive (si historique).
- [ ] Carte de récupération musculaire (silhouette, couleurs, muscles frais).
- [ ] Charge d'entraînement (ACWR), records, objectifs (créer + mettre à jour).

## Sommeil
- [ ] Écran sommeil (nuit précédente, phases, signaux HRV/FC).
- [ ] Check-in bien-être / humeur → enregistré + historique.
- [ ] Respiration guidée : l'animation tourne, démarrer/arrêter OK.

## Nutrition
- [ ] Ajouter un repas (recherche d'aliment / saisie manuelle).
- [ ] Ajouter de l'eau (hydratation).
- [ ] Scanner un code-barres (autorisation caméra, résultat Open Food Facts).
- [ ] Ajuster les objectifs (+/-), changement de jour.

## Import santé
- [ ] Profil → Mes appareils → Importer un fichier → export Health Auto Export
      (JSON) → « Importé : N activités, M données santé », données visibles.

## Robustesse (là où les bugs se cachent)
- [ ] Mettre l'app en arrière-plan puis revenir.
- [ ] Rotation de l'écran, petit et grand iPhone.
- [ ] Thème clair / sombre (réglages système).
- [ ] Mode avion (hors-ligne) : l'app ne plante pas, messages clairs.
- [ ] Double-tap rapide sur les boutons, scroll rapide, retours en rafale.
- [ ] Textes longs / accents / emoji dans les champs (note, titre d'objectif…).

## Cas vides
- [ ] Un tout nouveau compte, sans aucune donnée : chaque écran reste propre
      (pas de « NaN », de graphique cassé, de liste vide moche).

## À noter pour chaque bug
1. L'écran + ce que tu faisais. 2. Ce qui était attendu vs obtenu.
3. Reproductible ? (à chaque fois / parfois). 4. Modèle d'iPhone + iOS.
