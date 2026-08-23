# Prompt — Multilingue (FR / EN / ES / PT / DE)

> L'app est aujourd'hui en français, textes écrits en dur dans les écrans ET dans
> les moteurs. Ce prompt met en place l'infra i18n, un sélecteur de langue, et
> l'extraction des textes — à faire idéalement TÔT pour que les futures features
> soient écrites « i18n-ready ». Langues : français (défaut), anglais, espagnol,
> portugais (Brésil), allemand. Toutes LTR (pas de RTL).

```
Objectif : rendre Kaizen Supotsu MULTILINGUE — français, anglais, espagnol,
portugais (pt-BR), allemand — avec choix de la langue par l'utilisateur et
détection de la langue du téléphone. Le mécanisme d'abord, puis l'extraction des
textes par lots. Offline-first (traductions embarquées, aucun appel réseau).

============================================================
1) INFRASTRUCTURE i18n
============================================================
- Ajoute i18next + react-i18next + expo-localization.
- Init i18n au démarrage : langue = choix utilisateur persistant, sinon langue du
  téléphone (expo-localization), sinon 'fr' (fallback). fallbackLng: 'fr'.
- Fichiers de traduction : apps/mobile/src/i18n/locales/{fr,en,es,pt,de}.json
  (namespaces par domaine : common, home, sport, sommeil, nutrition, profile,
  onboarding, auth, engines, legal…). fr.json = source de vérité (clés remplies
  en premier).
- Convention de clés : "domaine.contexte.libellé" (ex. "home.greeting",
  "sport.session.today"). Interpolation i18next ({{name}}) + PLURIELS (count).
- Persistance : stocke la langue via le stockage existant (secureStorage /
  préférences). Change de langue à chaud (re-render, pas de redémarrage).
- Localise dates / nombres / unités : Intl (toLocaleDateString/NumberFormat) selon
  la langue active ; garde la logique unités métrique/impérial existante.

============================================================
2) SÉLECTEUR DE LANGUE (UI)
============================================================
- Dans Réglages (SettingsScreen / préférences) : « Langue » → liste
  Français / English / Español / Português / Deutsch + « Automatique (téléphone) ».
- Applique immédiatement ; persiste le choix.

============================================================
3) TEXTE DES MOTEURS (décision d'archi — important)
============================================================
Les moteurs (packages/engines) renvoient aujourd'hui des phrases FR (Explanation
{observation, analysis, action}, libellés d'état, recommandations). Les moteurs
doivent rester PURS et sans dépendance UI. Choisis UNE approche cohérente :
  (A recommandé) Les moteurs renvoient des CLÉS + variables (ex.
     { key: 'engines.recovery.low', params: { score } }) au lieu de texte FR ;
     l'UI traduit via t(key, params). Mets à jour les types (Explanation → clé+params)
     et les tests.
  (B) Un traducteur/locale est injecté dans les fonctions concernées.
Ajoute les clés correspondantes dans le namespace "engines" pour les 5 langues.

============================================================
4) EXTRACTION DES TEXTES — PAR LOTS
============================================================
Remplace les chaînes FR en dur par t('...') écran par écran, en remplissant
fr.json au fur et à mesure. Ordre suggéré :
  Lot 1 : common (boutons, états, nav, tabs) + Accueil.
  Lot 2 : Sport (+ sous-écrans).
  Lot 3 : Sommeil & bien-être.
  Lot 4 : Nutrition.
  Lot 5 : Profil, Réglages, Objectifs, Analytics.
  Lot 6 : Onboarding, Auth, Légal, Comprendre, moteurs.
Après chaque lot : traduis les nouvelles clés en en/es/pt/de (traduction machine/
LLM acceptable pour la bêta, à affiner ensuite ; respecte le ton « tu » informel
là où le FR l'utilise, adapte selon la langue). Vérifie qu'aucune chaîne visible
ne reste en dur (un lint/grep de contrôle sur les littéraux JSX est un plus).

============================================================
QUALITÉ & RÈGLES
============================================================
- pnpm typecheck && pnpm lint && pnpm test verts (adapte les tests des moteurs si
  approche A : ils vérifient des clés, pas des phrases FR).
- pnpm --filter @supotsu/mobile export:web pour valider le bundling.
- Teste le changement de langue à chaud sur plusieurs écrans + une langue non-FR
  au premier lancement (détection téléphone).
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change → APERÇU VISUEL (même écran en FR / EN / ES / PT / DE).

NOTES :
- Toutes ces langues sont LTR → pas de gestion RTL. (Arabe = chantier séparé si un
  jour souhaité : mise en page miroir.)
- fr.json est la source ; ne jamais laisser une clé vide dans une autre langue
  (fallback FR sinon, mais viser 100 % de couverture pour les 5 langues).
- Écris les futures features directement avec t('...') (i18n-ready), plus de FR en dur.
```
