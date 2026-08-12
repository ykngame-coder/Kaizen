# Tester sur iPhone via TestFlight (avant l'App Store)

TestFlight = la voie officielle pour faire tester l'app à plusieurs personnes
avant publication. Builds valides **90 jours**, mises à jour automatiques.
On compile avec **EAS Build** (dans le cloud d'Expo — pas de signature Xcode
manuelle), puis on envoie sur TestFlight avec **EAS Submit**.

Pré-requis : un **Mac** (ou n'importe quelle machine pour EAS Build cloud), un
**compte Expo** (gratuit), un **compte Apple Developer** (99 $/an), et
`eas-cli`. Le repo est déjà prêt : `ios.bundleIdentifier` = `com.supotsu.app`,
icône + splash présents, profil `production` dans `eas.json`.

## 1. Installer & se connecter
```bash
npm i -g eas-cli
eas login
cd apps/mobile
```

## 2. Compiler (cloud)
```bash
eas build --platform ios --profile production
```
EAS demande de te connecter à Apple → il **crée/gère automatiquement** les
certificats, le provisioning et l'app dans App Store Connect. Compilation
~15-20 min.

## 3. Envoyer sur TestFlight
```bash
eas submit --platform ios --latest
```
Téléverse le build vers App Store Connect. Traitement Apple ~5-15 min.

## 4. Ajouter les testeurs
Sur [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → l'app →
onglet **TestFlight** :

- **Test interne** (instantané, pas de review) : *Users and Access* → ajoute les
  Apple ID des testeurs à l'équipe → TestFlight → **Internal Testing** → ajoute-les
  au groupe → coche le build. Max 100 testeurs internes.
- **Test externe** (n'importe quel e-mail) : crée un **groupe externe** → ajoute
  les e-mails → soumets à la **Beta App Review** (~1 jour, la 1ʳᵉ fois). Max 10 000.

## 5. Installer sur l'iPhone
Le testeur installe l'app **TestFlight** (App Store) → ouvre l'invitation
(e-mail ou lien) → **Installer** SUPOTSU. Les builds suivants apparaissent
automatiquement.

## Remonter les bugs (intégré)
Dans l'app, une **capture d'écran** → TestFlight propose « Partager le retour »
→ note + capture partent dans App Store Connect (TestFlight → **Feedback**),
avec l'appareil et la version. Voir `test-checklist.md` pour un plan de test.

## Mettre à jour (après un correctif)
```bash
eas build --platform ios --profile production   # numéro de build auto-incrémenté
eas submit --platform ios --latest
```

## Notes
- **Backend** : sans variables Supabase, le build tourne en **mode démo**
  (données locales par appareil). Pour un vrai test multi-comptes, injecte les
  clés Supabase dans le build — voir `backend.md` §« EAS / TestFlight ».
- **Monorepo pnpm** : géré par EAS + `metro.config.js`. En cas d'échec de
  résolution des packages workspace, vérifier la config monorepo Expo.
- **`eas submit`** peut demander une **clé API App Store Connect** (Users and
  Access → Integrations → App Store Connect API) — plus simple que le mot de
  passe Apple pour l'automatisation.
