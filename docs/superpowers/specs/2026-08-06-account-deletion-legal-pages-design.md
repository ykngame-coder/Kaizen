# Suppression de compte + CGU/Politique de confidentialité

## Objectif

Corriger les deux points quasi-certains de faire rejeter l'app en revue App
Store, identifiés lors d'un audit de préparation à la publication :

1. Aucune suppression de compte n'existe (Guideline 5.1.1(v), obligatoire
   depuis 2022 pour toute app avec création de compte).
2. Les liens "Conditions d'utilisation" et "Politique de confidentialité"
   dans Réglages (`SettingsScreen.tsx`) sont décoratifs — `chevron` sans
   `onPress` — et aucun contenu de CGU/politique de confidentialité n'existe
   nulle part dans le repo. Apple exige une URL de politique de
   confidentialité fonctionnelle dans App Store Connect.

**Hors scope** (identifiés dans le même audit, traités séparément si besoin) :
migration de "Continuer avec Apple" vers l'API native
`expo-apple-authentication` (Guideline 4.8), In-App Purchase pour les
programmes payants du Marketplace (Guideline 3.1.1), privacy manifest
`PrivacyInfo.xcprivacy`, crash reporting.

## Suppression de compte

### Découverte qui simplifie tout : le schéma cascade déjà correctement

Chaque table possédée par un utilisateur référence `profiles(id)` avec
`on delete cascade`, et `profiles.id` référence `auth.users(id)` avec
`on delete cascade` (vérifié sur les 19 tables user-scoped, migrations
0001 à 0011). Supprimer la ligne `auth.users` purge donc automatiquement
tout — profil, séances, données santé, sommeil, objectifs, communauté,
appareils connectés — sans suppression manuelle table par table.

### Edge Function `supabase/functions/delete-account/index.ts`

Même structure que `garmin`/`strava`/`apple-health` déjà déployées
(voir `handleDisconnect` dans `garmin/index.ts` pour le pattern exact à
reprendre) :

```
POST /functions/v1/delete-account
Authorization: Bearer <JWT de l'utilisateur>
```

1. Lit le JWT du header `Authorization`, 401 si absent.
2. `admin().auth.getUser(jwt)` pour identifier l'utilisateur appelant — 401
   si invalide. (`admin()` = client service_role, même helper que les
   3 fonctions existantes.)
3. `admin().auth.admin.deleteUser(userId)` — cascade tout via les FK
   existantes.
4. Répond `{ ok: true }` (200) ou `{ error }` (500) en cas d'échec.

Pas de désinscription cross-service (Garmin/Strava) avant suppression —
les tokens disparaissent avec `connector_accounts` (cascade), les pushs
Garmin futurs pour cet utilisateur externe ne matcheront simplement plus
personne. Amélioration possible plus tard, pas nécessaire pour la
conformité Apple.

### Client `apps/mobile/src/features/auth/accountClient.ts`

Nouveau fichier, même pattern exact que `disconnectGarmin()`
(`garminClient.ts`) :

```ts
export async function deleteAccount(): Promise<void> {
  const base = functionsBase(); // `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`
  if (!base) throw new Error('Backend Supabase non configuré.');
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Suppression impossible (${res.status}).`);
}
```

### UI — `SettingsScreen.tsx`, groupe SÉCURITÉ

Nouvelle `ListRow` destructive "Supprimer mon compte" sous "Se
déconnecter". Au tap :

- **Mode Supabase (compte réel)** : confirmation explicite via `Alert.alert`
  (React Native, aucune nouvelle dépendance) avec un bouton destructif
  ("Supprimer", `style: 'destructive'`) listant ce qui va être supprimé de
  façon irréversible → si confirmé, `deleteAccount()` → déconnexion locale
  (`signOut()`, la session est de toute façon invalide) → redirection
  automatique vers `/sign-in` (déjà géré par `RouteGuard` sur `authStatus
  === 'unauthenticated'`). Aujourd'hui "Se déconnecter" n'a aucune
  confirmation ; celle-ci est nouvelle et spécifique à la suppression,
  vu la gravité de l'action.
- **Mode Démo** : pas de vrai compte serveur — le même bouton efface les
  données démo locales (`DEMO_KEY` dans `authClient.ts`) et déconnecte,
  sans appeler l'Edge Function.
- Erreur réseau/serveur : message d'erreur affiché, compte non touché,
  aucune déconnexion (l'utilisateur peut réessayer).

## CGU / Politique de confidentialité

### Contrainte technique : exemption du garde d'authentification

`RouteGuard` (`app/_layout.tsx`) redirige tout utilisateur non connecté
vers `/sign-in`, sauf les groupes `(auth)`/`(onboarding)`. Sans
modification, `/privacy` et `/terms` seraient inaccessibles à un visiteur
non connecté ou à un reviewer Apple sur l'URL web publique — ce qui
annulerait l'intérêt de les avoir. Un nouveau groupe `(legal)` est ajouté
à la même liste d'exemptions dans `RouteGuard`.

### Routes

- `app/(legal)/_layout.tsx` — `<Stack screenOptions={{ headerShown: false
  }} />`, même pattern que `(auth)`/`(onboarding)`.
- `app/(legal)/privacy.tsx` → `/privacy`
- `app/(legal)/terms.tsx` → `/terms`

Le build web (`apps/mobile/dist`, déployé sur Vercel d'après
`vercel.json`) rend ces routes accessibles comme de vraies URLs
publiques (`https://<domaine-vercel>/privacy`) sans hébergement séparé —
ça remplit à la fois le lien fonctionnel dans l'app et le champ "Privacy
Policy URL" d'App Store Connect.

### Contenu

Composants `PrivacyPolicyScreen`/`TermsScreen` (`src/features/legal/`),
construits avec les mêmes primitives que le reste de l'app
(`Screen scroll`, `Text variant="title"/"heading"/"body"`,
`spacing`/`radii`) plutôt qu'une page brute — long texte structuré en
sections avec titres, cohérent visuellement avec les autres écrans.
Texte français rédigé pour cette app spécifiquement : données HealthKit
lues (sommeil, FC, HRV, poids, composition), sources tierces (Garmin,
Strava, Apple Santé), hébergement Supabase (UE ou région déclarée),
aucune revente de données, droits RGPD (accès/rectification/
suppression/portabilité) — avec référence concrète aux fonctionnalités
qui les exercent déjà ("Exporter mes données" dans Réglages, "Supprimer
mon compte" ci-dessus), contact (adresse e-mail support déjà utilisée
dans `SupportScreen.tsx`), date de dernière mise à jour.

**Ce n'est pas un avis juridique** — texte de départ raisonnable pour une
app santé/fitness indépendante, à faire relire par un professionnel avant
de soumettre réellement à l'App Store. Le texte lui-même ne porte pas de
mention "brouillon" visible (il doit se lire comme une vraie politique) ;
l'avertissement reste à l'attention de l'utilisateur (toi), pas des
visiteurs de la page.

### Liens

- `SettingsScreen.tsx` : les deux `ListRow` (lignes 140-141) reçoivent un
  `onPress={() => router.push('/terms' | '/privacy')}`.
- `AuthScreen.tsx`, écran d'inscription uniquement (`mode === 'signUp'`) :
  petite mention sous les champs email/mot de passe, avant le bouton de
  soumission — "En créant un compte, tu acceptes nos [Conditions
  d'utilisation] et notre [Politique de confidentialité]." avec les deux
  segments cliquables (`Link` vers `/terms`/`/privacy`), cohérent avec le
  `<Link href={copy.altHref}>` déjà utilisé dans ce fichier.

## Risques & validation

- Tester la suppression de compte avec un compte de test réel (pas juste
  en lecture de code) : créer un compte, vérifier que toutes les tables
  listées sont bien vidées après suppression (requête SQL directe côté
  Supabase), et que l'app redirige proprement vers `/sign-in` sans crash.
- Vérifier que `/privacy` et `/terms` sont bien accessibles **sans être
  connecté** (tester en session déconnectée, pas juste dans l'app en tant
  qu'utilisateur connecté) — c'est le point qui casse silencieusement si
  l'exemption `RouteGuard` est oubliée ou mal placée.
- Une fois le build web redéployé sur Vercel, copier l'URL réelle
  `/privacy` pour le champ App Store Connect.
- `pnpm typecheck && pnpm lint && pnpm test` + `pnpm --filter
  @supotsu/mobile export:web` comme d'habitude.
- La fonction `delete-account` doit être déployée manuellement (`supabase
  functions deploy delete-account --no-verify-jwt` ou équivalent selon la
  config des 3 fonctions existantes) — je ne peux pas le faire depuis ici,
  ce sera à toi une fois le code poussé.
