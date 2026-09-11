# Prompt — Durcir le score des défis communautaires

> Vérification faite : client (`computeChallengeProgress`) et serveur (RPC
> `challenge_leaderboard`, migration 0004) calculent la MÊME chose (métrique +
> fenêtre inclusive) et le classement est juste. Deux durcissements seulement.

```
Durcis le calcul du score des défis communautaires de Kaizen Supotsu. Deux points,
sans changer la sémantique du score (juste la robustesse + l'affichage des rangs).

============================================================
1) FORCER UTC dans la RPC challenge_leaderboard (cohérence client/serveur)  [🟠]
============================================================
Contexte : la métrique 'active_days' compte les jours via
`count(distinct date_trunc('day', a.started_at))`. `date_trunc('day', timestamptz)`
utilise le FUSEAU DE SESSION Postgres. Supabase est en UTC par défaut → ça
correspond aujourd'hui au découpage UTC du client (`startedAt.slice(0,10)`). Mais
c'est une hypothèse implicite : si la session n'est pas en UTC, le nombre de jours
actifs du serveur divergerait de celui du client.
À faire :
- Ajoute une NOUVELLE migration (ne modifie PAS 0004 déjà appliquée) qui fait
  `create or replace function public.challenge_leaderboard(p_challenge uuid)` —
  identique à l'actuelle MAIS en verrouillant le jour en UTC :
  `count(distinct ((a.started_at at time zone 'UTC')::date))`.
  Conserve tout le reste (contrôle d'accès public/participant, LEFT JOIN, la
  branche activity_count `count(a.id)`, le grant execute to authenticated).
- Objectif : le bucketing « jour » est explicitement UTC, identique au client,
  quelle que soit la config de session.
- (Vérifie au passage si une autre fonction/vue de classement — ex.
  0024_daily_scores_leaderboard — bucketise par jour avec la même hypothèse ; si
  oui, applique le même verrouillage UTC dans une migration.)

Ne touche PAS au client : `computeChallengeProgress` utilise déjà `slice(0,10)` sur
l'ISO UTC → déjà correct. On aligne juste le serveur dessus explicitement.

============================================================
2) AFFICHER DE VRAIS RANGS (ex-æquo) dans la communauté            [🟡 UI]
============================================================
Contexte : CommunityScreen trie la sortie de la RPC par progression et prend le
top 3, sans numéros de rang ni gestion des ex-æquo. Le moteur a déjà la logique de
rang standard (1,2,2,4) dans `computeLeaderboard`, mais elle prend des activités
brutes par participant — pas les lignes déjà agrégées de la RPC.
À faire :
- Ajoute dans packages/engines/src/community.ts une fonction PURE
  `rankStandings(rows: { userId: string; progress: number }[], target: number):
   LeaderboardStanding[]` qui : trie par progress desc (tie-break stable par
  userId), assigne le rang standard (1,2,2,4) et calcule `reachedTarget =
  progress >= target`. Réutilise/extrais la logique de rang déjà présente dans
  `computeLeaderboard` (évite la duplication : `computeLeaderboard` peut appeler
  `rankStandings` après avoir mappé les progrès).
- Dans CommunityScreen : passe la sortie de la RPC (déjà {userId, progress}) à
  `rankStandings(rows, challenge.target)` et affiche le numéro de rang (avec
  ex-æquo) au lieu d'un simple tri + slice. Garde l'affichage top 3 si tu veux,
  mais avec les rangs corrects.
- i18n : tout libellé nouveau via t() dans les 5 locales.

============================================================
QUALITÉ & RÈGLES
============================================================
- Tests Vitest : ajoute des cas pour `rankStandings` (ex-æquo → 1,2,2,4 ; ordre
  stable). Mets à jour computeLeaderboard s'il est refactoré.
- pnpm typecheck && pnpm lint && pnpm test verts ; export:web OK.
- La migration RPC doit être idempotente (`create or replace`) et ne rien casser
  d'autre dans 0004.
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- Si l'affichage du classement change → APERÇU VISUEL de la carte défi.

NOTE : c'est du durcissement — le score défi est déjà correct et cohérent
aujourd'hui (Supabase = UTC). Ce prompt le blinde contre une hypothèse de fuseau
et améliore l'affichage des rangs.
```
