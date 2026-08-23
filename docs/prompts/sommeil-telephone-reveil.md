# Prompt — Suivi du sommeil par le téléphone + réveil intelligent programmable

> Pour les utilisateurs **sans montre** : le téléphone sert de capteur de mouvement
> (actigraphie) pendant la nuit, et un **réveil intelligent programmable** sonne au
> bon moment. Accéléromètre seul (privé, local — pas de micro). Réveil inclus dès la v1.

```
Objectif : ajouter à Kaizen Supotsu un SUIVI DU SOMMEIL PAR LE TÉLÉPHONE (sans
montre) + un RÉVEIL INTELLIGENT PROGRAMMABLE. Le téléphone, posé sur le lit/la
table de chevet, mesure les mouvements via l'accéléromètre pendant la nuit ;
au réveil, un algorithme LOCAL en déduit durée, efficacité et un découpage
sommeil/éveil + proxy profond/léger ; c'est enregistré comme SleepSession et
alimente le score de sommeil existant. Le réveil sonne dans une fenêtre choisie,
au moment d'un sommeil léger détecté. 100 % local, offline-first, « aucune boîte
noire » (fiabilité explicite, plus basse qu'une montre).

RÉALITÉ TECHNIQUE À ASSUMER :
- iOS bride l'échantillonnage capteur en arrière-plan → le suivi tourne avec
  l'app AU PREMIER PLAN, écran verrouillé/très sombre (expo-keep-awake), comme
  Sleep Cycle. Recommander de BRANCHER le téléphone (batterie).
- Accéléromètre SEUL (pas de micro) → privé, rien ne quitte l'appareil.
- Pas de REM ni de HRV/FC possibles par le téléphone : profond/léger sont ESTIMÉS
  (mouvement), REM non disponible. La récupération (HRV/FC) reste meilleure avec
  une montre — ici on couvre surtout le sommeil.

CONTEXTE (réutiliser) :
- packages/core/src/health.ts : SleepSession { source, reliability?, startedAt,
  endedAt, deepMin, lightMin, remMin, awakeMin, asleepMin, inBedMin, segments? }
  et SleepSegment { stage: 'deep'|'light'|'rem'|'awake', startedAt, endedAt }.
- packages/core/src/common.ts : type DataSource → AJOUTER 'phone'.
- packages/engines/src/sleep.ts : computeSleepScore2 (quantité/qualité/régularité/
  dette) — la SleepSession produite doit s'y brancher sans changement.
- repository : listSleepSessions / (ajouter) addSleepSession(userId, session) si
  l'écriture n'existe pas encore côté démo + Supabase (migration 0011 sleep_sessions).
- Réglages/préférences existants (unités, notifs) pour stocker l'alarme.
- expo-audio est déjà présent ; AJOUTER expo-sensors + expo-keep-awake (+ config plugins).

============================================================
1) MOTEUR PUR — packages/engines/src/sleepActigraphy.ts (+ .test.ts)
============================================================
Entrée : une timeline d'ÉPOCHS de mouvement (agrégée, pas les samples bruts) :
  interface MovementEpoch { t: string; motion: number; }  // motion = intensité agrégée sur l'époch (ex. 30-60 s)
export function analyzeSleep(epochs: MovementEpoch[], inBedStart: string, inBedEnd: string):
  { session: Omit<SleepSession,'id'|'userId'|'createdAt'|'updatedAt'>; confidence: 'high'|'medium'|'to_confirm' }
- Seuils : motion faible prolongée → 'deep' ; motion modérée → 'light' ; pics →
  'awake'. Construit les segments, calcule deepMin/lightMin/awakeMin, asleepMin,
  inBedMin, efficacité. remMin = 0 (non détectable) — à afficher comme « non mesuré ».
- confidence : basse si peu d'épochs / nuit courte. source='phone',
  reliability = niveau bas (à définir dans le modèle) pour signaler l'estimation.
export function isLightSleep(recentEpochs: MovementEpoch[]): boolean
- Utilisé par le réveil intelligent (fenêtre) : vrai si l'utilisateur semble en
  sommeil léger/proche du réveil. Testé.
- Tests Vitest sur des timelines synthétiques (nuit calme, agitée, courte, réveils).

============================================================
2) MODE NUIT (capture) — apps/mobile/src/features/sommeil/SleepTrackingScreen.tsx
   route (tabs)/sommeil/track
============================================================
- « Démarrer le suivi » : expo-keep-awake actif, écran très sombre (overlay noir,
  luminosité mini), affiche l'heure + un bouton « Terminer » discret.
- Échantillonne l'accéléromètre (expo-sensors, ~ chaque seconde), AGRÈGE en épochs
  (30-60 s : max/variance du vecteur) pour limiter mémoire/batterie ; garde la
  timeline d'épochs en mémoire/stockage léger.
- Gère l'app au premier plan écran verrouillé ; reprise propre si l'app est
  ré-ouverte. Message clair « garde l'app ouverte, branche ton téléphone ».
- « Terminer » (ou réveil) → analyzeSleep(...) → addSleepSession(...) →
  redirige vers le hub Sommeil qui affiche la nuit (score via computeSleepScore2,
  phases avec REM « non mesuré », badge « estimé — téléphone »).

============================================================
3) RÉVEIL INTELLIGENT + PROGRAMMATION — inclus dès la v1
============================================================
- Écran de réglage d'alarme (dans le hub Sommeil et/ou Réglages) :
    - heure de réveil, activation on/off, jours de répétition,
    - FENÊTRE INTELLIGENTE : 0 / 15 / 30 min avant l'heure (0 = alarme simple),
    - choix du son, volume progressif, vibration/haptique, snooze.
    - stockage dans les préférences (local).
- Logique : pendant un suivi actif, dans l'intervalle [heure - fenêtre, heure],
  si isLightSleep(récent) → déclenche le réveil ; sinon déclenche à l'heure pile.
- Son : lecture via expo-audio (son en boucle, montée progressive du volume),
  fonctionne car l'app est au premier plan pendant le suivi. Haptique en renfort.
  Snooze relance selon le réglage.
- Alarme SANS suivi de sommeil : si l'utilisateur programme juste un réveil sans
  lancer le mode nuit, prévoir un repli (alarme simple à l'heure) — documente la
  limite iOS (pas d'alarme système hors app ; fiable surtout app ouverte).
- À la sonnerie, fin automatique du suivi + calcul de la nuit.

============================================================
4) INTÉGRATION
============================================================
- Nouvelle source de sommeil « Suivre avec le téléphone » à côté de l'import
  (Health Auto Export / HealthKit) — l'utilisateur sans montre continue comme avant.
- Anti-doublon : si l'utilisateur a aussi une montre/HealthKit, ne pas empiler deux
  nuits pour la même date — dédoublonner par date, préférer la source la plus fiable.

============================================================
QUALITÉ & RÈGLES
============================================================
- Le moteur (analyzeSleep, isLightSleep) est PUR et couvert par Vitest.
- pnpm typecheck && pnpm lint && pnpm test verts.
- pnpm --filter @supotsu/mobile export:web (le mode nuit/capteurs est masqué/no-op sur web).
- Tester sur device réel (accéléromètre + audio + écran verrouillé une nuit).
- Batterie : recommander le branchement ; viser une conso raisonnable (épochs agrégés).
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change → APERÇU VISUEL (mode nuit, réglage d'alarme, nuit résumée).

DÉFAUTS (ajustables) : épochs 60 s ; fenêtre intelligente 30 min ; REM non mesuré ;
source='phone' avec fiabilité basse.
```
