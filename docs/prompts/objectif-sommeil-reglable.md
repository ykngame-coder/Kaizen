# Prompt — Objectif de sommeil réglable + réajustement de tous les calculs

> Aujourd'hui la cible est figée : `SLEEP_TARGET_HOURS = 8` (packages/engines/src/
> sleep.ts) sert au score de durée, à la dette, au rythme circadien ; et plusieurs
> textes affichent « cible 7 h 45 » (≠ 8 h → incohérence à corriger). Objectif :
> rendre la cible RÉGLABLE par l'utilisateur et faire que **dette + tous les calculs
> liés se réajustent** à cette cible. Moteurs PURS : on passe la cible en paramètre.

```
Rends l'OBJECTIF DE SOMMEIL réglable par l'utilisateur et propage-le à TOUS les
calculs qui en dépendent (score de durée, dette de sommeil, rythme circadien,
textes d'objectif). Corrige l'incohérence actuelle 7 h 45 / 8 h. Les moteurs
restent PURS (la cible est un paramètre, pas une constante lue en dur).
i18n en place → toute chaîne visible via t() dans fr/en/es/pt/de.

============================================================
1) PRÉFÉRENCE UTILISATEUR
============================================================
- Ajoute `sleepGoalHours: number` à Preferences (apps/mobile/src/lib/preferences.tsx)
  + valeur par défaut dans DEFAULTS. Défaut recommandé = 8 (comportement actuel du
  moteur). Unité = heures décimales (7.75 = 7 h 45).
- Sélecteur dans les Réglages (SettingsScreen) et/ou le hub Sommeil : pas de 15 min
  (0.25 h), bornes raisonnables (ex. 6 h → 10 h). Affiche la valeur formatée
  « 7 h 45 » (réutilise le helper fmtSleep de DashboardScreen — extrais-le dans un
  util partagé si besoin, plutôt que de le dupliquer).

============================================================
2) MOTEURS — passer la cible en paramètre (garder un défaut)
============================================================
Fichier packages/engines/src/sleep.ts :
- Garde `SLEEP_TARGET_HOURS = 8` comme DÉFAUT de repli (rétrocompat).
- durationScore(hours, goalHours = SLEEP_TARGET_HOURS) : 8h→100 devient goalHours→100
  (barème linéaire de 4 h à goalHours).
- sleepDebtHours(metrics, asOf, windowDays, goalHours = SLEEP_TARGET_HOURS) :
  debt = Σ max(0, goalHours - nuit) ; et DEBT_CAP dérivé de goalHours
  (DEBT_CAP = goalHours * windowDays/7) pour que debtScore reste cohérent.
- computeSleepScore2(metrics, asOf, windowDays = 7, sessions?, goalHours = SLEEP_TARGET_HOURS)
  → transmet goalHours à durationScore (composante quantité) et à sleepDebtHours
  (composante dette). Mets à jour le détail texte « … h dormies sur {goal} h visées ».
- sleepTrend(...) : la note par nuit vient de durationScore → propage goalHours.
- (computeSleepScore historique s'il est encore utilisé : idem ou supprime-le si mort.)
Fichier packages/engines/src/circadian.ts :
- Les fonctions qui utilisent SLEEP_TARGET_HOURS (idealBedMin = idealWake - goal*60,
  et l'explication params.hours) prennent goalHours en paramètre (défaut = constante).
Fichier packages/engines/src/scoring.ts :
- buildDailySnapshot appelle computeSleepScore2 (L~507) → ajoute goalHours à ses
  options/extras et le transmet.
Fichiers recommendation.ts (L~42) et prediction.ts (L~76, sleepDebtHours) :
  transmettent aussi goalHours.

============================================================
3) CÂBLAGE UI — passer preferences.sleepGoalHours aux moteurs
============================================================
Partout où ces fonctions sont appelées côté app, passe la cible de l'utilisateur :
- SommeilScreen.tsx : computeSleepScore2 (L~395), sleepDebtHours (L~420), sleepTrend (L~408).
- DashboardScreen.tsx : sleepTrend (L~205), buildDailySnapshot (goal via options),
  et le SEUIL en dur `lastNight.hours >= 7.75` (L~361) → remplace par
  `>= preferences.sleepGoalHours`. fmtSleep sert à afficher la cible.
- WeeklyReportScreen.tsx : remplace les `7.75` en dur (L~121 ratio, L~278 conseil) par
  preferences.sleepGoalHours.
- CalendarScreen.tsx / AnalyticsScreen.tsx : sleepTrend → passe la cible.
- buildDailySnapshot / recommendation / prediction : via les hooks qui les appellent,
  transmettre preferences.sleepGoalHours.

============================================================
4) CORRIGER L'INCOHÉRENCE « 7 h 45 » / « 8 h »
============================================================
- Dans les locales (fr/en/es/pt/de), les clés qui codent « 7 h 45 » en dur
  (ex. « Sommeil ≥ 7 h 45 », « cible 7 h 45 », « Viser 7 h 45 de sommeil ») doivent
  utiliser une INTERPOLATION {{goal}} alimentée par l'objectif de l'utilisateur,
  formatée via fmtSleep (« 7 h 45 », « 8 h »…). Plus aucune valeur d'objectif en dur.
- Résultat attendu : l'objectif AFFICHÉ = l'objectif UTILISÉ pour le score et la dette.

============================================================
QUALITÉ & RÈGLES
============================================================
- Aucune migration Supabase (les préférences sont locales).
- Tests Vitest : mets à jour ceux de sleep.ts, et ajoute un test qui vérifie que
  durationScore, sleepDebtHours et computeSleepScore2 SE DÉPLACENT quand goalHours
  change (ex. objectif 7 h vs 9 h → dette et score différents pour la même nuit).
- pnpm typecheck && pnpm lint && pnpm test verts ; export:web OK.
- i18n : nouvelles chaînes dans les 5 langues.
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change → APERÇU VISUEL : réglage de l'objectif + hub Sommeil (score,
  dette) recalculés selon la cible choisie.

DÉFAUT : sleepGoalHours = 8 (rétrocompat) ; l'utilisateur peut descendre à 7 h 45, etc.
```
