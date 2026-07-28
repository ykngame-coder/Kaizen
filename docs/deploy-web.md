# Publier / republier l'app (web, Vercel)

L'app est publiée en **export web statique** (Expo Router → `apps/mobile/dist`)
sur **Vercel**, en déploiement **piloté par Git** (`vercel.json` à la racine).

Résumé : **pour republier, il suffit de pousser la branche.** Vercel détecte le
push, rebuild (`pnpm --filter @supotsu/mobile export:web`) et met en ligne.

---

## Une seule fois — connecter le repo à Vercel
1. [vercel.com](https://vercel.com) → **Add New… → Project** → importe le dépôt GitHub `ykngame-coder/Kaizen`.
2. Vercel lit `vercel.json` automatiquement (build + `outputDirectory` déjà configurés) → **Deploy**.
3. **Settings → Git → Production Branch** : choisis la branche qui doit être « en prod ».
   - Le plus simple pour l'instant : mets **`claude/spot-wellness-app-r6l5bj`** en Production Branch.
   - Plus tard, quand tu voudras une vraie prod stable : bascule sur **`main`** et ne fusionne dedans que ce qui est validé.
4. (Optionnel) **Settings → Environment Variables** : ajoute `EXPO_PUBLIC_SUPABASE_URL` et
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` le jour où tu passes du mode démo au backend réel.

---

## À chaque changement — la marche à suivre
```bash
# 1. Vérifier en local (ne jamais déployer du cassé)
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @supotsu/mobile export:web     # doit finir par "Exported: dist"

# 2. Committer
git add -A
git commit -m "…description du changement…"

# 3. Pousser → Vercel republie tout seul
git push origin claude/spot-wellness-app-r6l5bj
```
- Si la branche poussée = **Production Branch** → mise en ligne sur l'URL de prod.
- Si c'est une autre branche → Vercel crée une **Preview** (URL de test) : pratique
  pour vérifier avant de fusionner en prod.

Suivi du build : Vercel → onglet **Deployments** (logs en direct, statut, URL).

---

## Alternative — republier à la main (sans push)
Utile pour forcer un redéploiement.

**Depuis le dashboard** : Vercel → **Deployments** → dernier déploiement → **⋯ → Redeploy**.

**Depuis le terminal** (Vercel CLI) :
```bash
npm i -g vercel        # une fois
vercel login           # une fois
vercel --prod          # build + déploie la prod depuis le dossier courant
```

---

## Rappels
- **Mode démo** : tant que les variables Supabase ne sont pas mises, l'app tourne
  en local sur l'appareil/navigateur (aucune donnée serveur) — c'est normal et
  pleinement utilisable.
- **Mobile (iPhone) en dev** : rien à « republier » — `pnpm --filter @supotsu/mobile start`
  puis Expo Go, les changements arrivent en direct (Fast Refresh). Un vrai build
  installable (hors web) nécessiterait EAS (autre sujet).
- **Rollback** : Vercel → Deployments → un déploiement précédent → **Promote to Production**.
