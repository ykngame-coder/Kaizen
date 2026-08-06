# Plan d'implémentation — Suppression de compte + pages légales

Spec source : `2026-08-06-account-deletion-legal-pages-design.md`. Étapes
séquentielles, `typecheck`/`lint` après chaque étape de code.

1. **Edge Function** `supabase/functions/delete-account/index.ts` — JWT →
   `getUser` → `admin.deleteUser(userId)`, calquée sur `handleDisconnect`
   de `garmin/index.ts`.
2. **Client** `apps/mobile/src/features/auth/accountClient.ts` —
   `deleteAccount()`, calqué sur `disconnectGarmin()`.
3. **`RouteGuard`** (`app/_layout.tsx`) — exempter le groupe `(legal)` de
   la redirection vers `/sign-in`.
4. **Groupe de routes** `app/(legal)/_layout.tsx` (Stack),
   `app/(legal)/privacy.tsx`, `app/(legal)/terms.tsx`.
5. **Contenu** `src/features/legal/PrivacyPolicyScreen.tsx` +
   `TermsScreen.tsx` — texte français complet.
6. **`SettingsScreen.tsx`** — `onPress` sur les deux `ListRow` existantes
   (CGU/politique) ; nouvelle `ListRow` destructive "Supprimer mon
   compte" avec confirmation `Alert.alert`, branche démo vs. réel.
7. **`AuthScreen.tsx`** — mention + liens sous les champs, écran
   d'inscription uniquement.
8. **Validation** — `pnpm typecheck && pnpm lint && pnpm test` +
   `pnpm --filter @supotsu/mobile export:web` (vérifie que `/privacy` et
   `/terms` sont bien exportées et pas redirigées). Commit + push.
   Rappel en fin de session : déployer la fonction manuellement
   (`supabase functions deploy delete-account --no-verify-jwt`) — hors de
   portée depuis ici.
