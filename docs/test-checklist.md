# Checklist de test SUPOTSU — exhaustive

Plan de test complet à dérouler sur chaque iPhone. À la moindre anomalie :
**capture d'écran** → TestFlight « Partager le retour » + une phrase sur ce que
tu faisais. Note à la fin de chaque bug : écran, attendu vs obtenu,
reproductible (toujours/parfois), modèle d'iPhone + version iOS.

**Légende** : `[ ]` à tester · `[x]` OK · `[!]` bug · `[~]` bizarre/à confirmer.

> Philosophie « aucune boîte noire » : partout où l'app affiche un score, une
> reco ou une analyse, vérifie qu'elle explique **pourquoi** (observation →
> analyse → action) avec un **niveau de confiance**. Un chiffre sans explication
> est un bug de conception à signaler.

---

## 1. Installation & premier lancement
- [ ] Installer via l'invitation TestFlight (mail ou lien) → app **SUPOTSU** installée.
- [ ] Premier lancement : pas de crash, splash puis écran d'accueil/connexion.
- [ ] Icône, nom (« Supotsu ») et splash corrects sur l'écran d'accueil iOS.
- [ ] Mise à jour OTA : relancer l'app après un correctif poussé → nouvelle version
      appliquée sans réinstaller (EAS Update).
- [ ] Visiteur **déconnecté** sur le web : la page **marketing** s'affiche à la racine.

## 2. Compte & authentification
- [ ] **Inscription** e-mail + mot de passe → compte créé.
- [ ] Confirmation e-mail (si activée) : message clair « confirme ton e-mail »,
      puis connexion possible après validation.
- [ ] **Connexion** e-mail/mot de passe.
- [ ] Mauvais mot de passe → message d'erreur clair (pas de plantage).
- [ ] **Continuer avec Apple** (Sign in with Apple natif).
- [ ] **Continuer avec Google**.
- [ ] **Déconnexion** puis reconnexion → on retrouve toutes ses données.
- [ ] **Supprimer mon compte** (Réglages) → suppression immédiate + retour à l'accueil,
      impossible de se reconnecter avec, données parties.
- [ ] (Backend réel) 2ᵉ compte sur l'autre iPhone → **chacun ne voit QUE ses données**.

## 3. Onboarding (6 étapes)
- [ ] Parcours complet : profil (sexe, taille, poids, niveau), sports, objectif,
      disponibilité, équipement, récap.
- [ ] Boutons Précédent/Suivant, barre de progression, validation par étape.
- [ ] Champs obligatoires manquants → blocage + message.
- [ ] Fin d'onboarding → arrivée sur l'Accueil, données reprises dans le profil.
- [ ] Relancer l'app → l'onboarding ne se redemande pas.

## 4. Navigation générale
- [ ] Les **5 onglets** : Accueil · Sport · Sommeil · Nutrition · Profil.
- [ ] Chaque hub ouvre son **mini-accueil** (Sport = séance + récup ; Sommeil =
      nuit précédente ; Nutrition = carburant du jour).
- [ ] Entrer/sortir de chaque sous-écran, **bouton retour**, pas d'écran figé/blanc.
- [ ] Double-tap rapide sur un onglet, navigations en rafale → pas de doublon d'écran.
- [ ] Recherche globale (icône 🔍) → résultats pertinents.

## 5. Accueil (Dashboard)
- [ ] En-tête « Bonjour {prénom} » + date + avatar.
- [ ] **Focus du jour** cohérent avec la récupération.
- [ ] **État du jour** : anneau Recovery, Énergie / Charge / Fatigue + conseil expliqué.
- [ ] Tuiles KPI : Sommeil (+delta), HRV, FC repos, Poids (+delta), Déficit kcal, série.
- [ ] **Objectifs du jour** : cases cochées/à faire (eau, protéines, habitudes, sommeil).
- [ ] **Personnalisation des cartes** : afficher/masquer + **glisser-réordonner**
      (écran « dashboard-customize ») → l'ordre est mémorisé au relancement.
- [ ] Compte neuf (sans données) : pas de « NaN », graphes non cassés, états vides propres.

## 6. Hub Sport
### Mini-accueil
- [ ] Sélecteur de jour (DayNav) + **tap-to-jump** sur une date.
- [ ] Carte « Séance du jour » (prévue ou « aucune séance »).
- [ ] **État du corps** : anneau récup, muscles « encore fatigués », Charge (ACWR), VO₂.
- [ ] **Récupération musculaire** : silhouette colorée par groupe (face + dos), tap → détail.
- [ ] 3 dernières activités.
### Séances & exercices
- [ ] **Nouvelle séance** : ajout d'exercices, séries (reps/charge), repos → enregistrée.
- [ ] **Bibliothèque d'exercices** (catalogue **873 exercices**) : recherche, filtres, détail.
- [ ] **Détail exercice** : muscles ciblés, instructions.
- [ ] **Créer un exercice perso** → apparaît dans la bibliothèque et sélectionnable.
- [ ] **Détail d'une séance** passée (récap séries/charges).
- [ ] Suggestion de **surcharge progressive** (si historique).
### Suivi & outils
- [ ] **Muscles** (récupération) : silhouette + lecture par groupe (fraîcheur %, état).
- [ ] **Muscle-progress** (progression musculaire) : indice, tendance, radar, muscles prioritaires.
- [ ] **Records / 1RM** : liste, création, mise à jour.
- [ ] **Charge (ACWR)** : ratio aigu/chronique, zone (sous-charge/optimal/élevé/risque) expliquée.
- [ ] **Activités** : liste, détail.
- [ ] **Ajouter une activité** manuelle.
- [ ] **Calendrier** / **Planning** des séances.
- [ ] **Photos de progression** : ajout (permission), avant/après.
- [ ] **Minuteur d'intervalles** (Tabata / HIIT / EMOM / perso) : démarrage, bips, pause.
- [ ] **Stomach Vacuum** (réglage séries/tenue, minuteur).
- [ ] **Étirements** + **session d'étirement** guidée.

## 7. Hub Sommeil & bien-être mental
### Mini-accueil
- [ ] Score de nuit (anneau /100) + libellé (Excellent/Correct/Moyen/Faible) + heures.
- [ ] QuickStats : VFC (HRV), FC repos, Stress.
- [ ] **7 dernières nuits** (barres).
- [ ] **Phases de sommeil** (Profond/Léger/Paradoxal/Éveillé) — masqué si la source n'a pas la donnée.
- [ ] Bien-être : niveau de confiance affiché (à confirmer / fiable).
### Modules
- [ ] **Check-in bien-être / humeur** (humeur, énergie, stress, note) → enregistré + historique.
- [ ] **Respiration guidée** : animation, démarrer/arrêter, cycles.
- [ ] **Méditation** : liste + **lecteur** (play/pause, minuteur).
- [ ] **Stimulation bilatérale** (+ son d'ambiance optionnel).
- [ ] **Rythme circadien**.
- [ ] **Récupération neuro**.
- [ ] **Sons** d'ambiance.
- [ ] (Vérifier) Stomach Vacuum accessible depuis le hub Sommeil.

## 8. Hub Nutrition
- [ ] Anneau **calories** du jour (consommé / cible), Restantes / Cible / Consommé.
- [ ] **Macros** : anneaux Protéines / Glucides / Lipides (% + g).
- [ ] **Repas du jour** par type (petit-déj / déj / dîner / collation) + kcal.
- [ ] **Chercher un aliment** (Open Food Facts) : recherche, sélection, portions.
- [ ] **Scanner un code-barres** : permission caméra, lecture, fiche produit.
- [ ] **Saisie manuelle** d'un repas.
- [ ] **Hydratation** : ajout d'eau, cible.
- [ ] **Journal** nutrition (historique).
- [ ] **Score nutrition** (/100) expliqué (calories, protéines, macros, hydratation).
- [ ] **Poids & composition** : poids, masse grasse, masse musculaire, variation 7 j.

## 9. Profil & réglages
- [ ] **Édition profil** (infos, avatar) → sauvegarde.
- [ ] **Réglages** : unités (métrique/impérial), notifications, confidentialité.
- [ ] Changement d'unité → répercuté partout (poids, distances).
- [ ] **Export de mes données** (JSON) → fichier généré/partageable.
- [ ] **Notifications** : préférences, activation/désactivation.
- [ ] **Support** (page contact, e-mail kaizensupotsu.uk).

## 10. Objectifs & progression
- [ ] **Objectifs** : création (poids / perf / habitude), cible, échéance.
- [ ] Mise à jour de la valeur courante → progression % recalculée, statut.
- [ ] **Progression** : courbes dans le temps.
- [ ] **Rapport hebdo**.

## 11. Analytics & tendances
- [ ] Vue **7 j / 4 sem / 1 an**.
- [ ] **Corrélations** multi-piliers (sport/sommeil/nutrition) **expliquées**.
- [ ] Graphes lisibles, pas de valeurs aberrantes.

## 12. Connecteurs & santé
- [ ] **Connecter Apple Santé (HealthKit natif)** : pop-ups d'autorisation par catégorie.
- [ ] **Import** : sommeil, HRV, FC repos, poids, composition, séances → visibles dans l'app.
- [ ] **Auto-sync HealthKit à l'ouverture** + livraison en arrière-plan.
- [ ] **Miroir vers Apple Santé** : une activité / un repas / de l'eau saisis dans SUPOTSU
      apparaissent dans Apple Santé.
- [ ] **Import fichier Health Auto Export (JSON)** : « Importé : N activités, M données santé ».
- [ ] **Import force Garmin (FIT)** : les séries de muscu alimentent la silhouette.
- [ ] Note quand des séances force HealthKit ne sont pas reflétées (message clair).
- [ ] **Intégrations** (Garmin / Strava) : écran de connexion.
- [ ] Doublons : ré-importer le même fichier ne duplique pas les données.

## 13. Comprendre (base de connaissances)
- [ ] Liste des articles, ouverture d'un article, lisibilité, retour.

## 14. Qualité des données
- [ ] **Data quality** : sources, fiabilité, dernière mise à jour par donnée.

## 15. Coach IA
- [ ] Écran Coach : recommandations du jour, chacune avec observation/analyse/action + confiance.

## 16. Communauté, défis & marketplace
- [ ] **Communauté** : affichage, classements.
- [ ] **Créer un défi** → apparaît, rejoindre/quitter.
- [ ] **Marketplace** : programmes, détail d'un programme, suivre/arrêter.
- [ ] **Program builder** / **Session builder** : créer un programme / une séance
      (respect du quota), édition, suppression.

## 17. Habitudes (gamification)
- [ ] **Habitudes** : liste, création (cadence, cible), validation du jour, historique.
- [ ] Badges / séries si présents.
- [ ] (Vérifier) FAB « + » ne chevauche pas la liste sur l'écran Habitudes.

## 18. Robustesse (là où se cachent les bugs)
- [ ] App en arrière-plan puis retour → état conservé.
- [ ] **Mode avion / hors-ligne** : pas de plantage, messages clairs, l'app reste utilisable (offline-first).
- [ ] Retour en ligne → synchronisation propre, pas de doublon.
- [ ] Rotation d'écran ; petit iPhone (SE/13 mini) et grand (Pro Max).
- [ ] **Thème clair / sombre** (réglage système) : lisibilité partout.
- [ ] Double-tap rapide sur les boutons, scroll rapide, retours en rafale.
- [ ] Textes longs / accents / emoji dans les champs (note, titre d'objectif, nom d'exercice).
- [ ] Valeurs extrêmes (poids 0 ou 300, très longue série de reps) → pas de casse.
- [ ] Refus des permissions (caméra, HealthKit, notifications) → l'app dégrade proprement.

## 19. Cas vides (compte tout neuf)
- [ ] Chaque écran sans aucune donnée reste propre : pas de « NaN », graphe cassé,
      anneau vide bizarre, ni liste vide moche — un message/CTA à la place.

## 20. Multi-comptes & confidentialité (2 iPhones, backend réel)
- [ ] Compte A et compte B, données distinctes.
- [ ] Aucune donnée de A visible chez B (RLS).
- [ ] Suppression du compte A n'affecte pas B.

## 21. Performance & ressenti
- [ ] Démarrage à froid raisonnable, pas de gel prolongé.
- [ ] Scroll fluide sur les longues listes (bibliothèque 873 exercices, activités).
- [ ] Consommation batterie/chaleur anormale à surveiller (auto-sync HealthKit).

---

## À noter pour chaque bug
1. L'écran + ce que tu faisais. 2. Attendu vs obtenu. 3. Reproductible ?
(à chaque fois / parfois). 4. Modèle d'iPhone + version iOS. 5. Capture d'écran.
