# Prompt — Reste à traiter des audits 1 & 2

> Source : `SUPOTSU_Recap_Audits_1_2.pdf` (audits en lecture seule, 2026-09).
> Ce fichier ne reprend QUE ce qui est encore ouvert : les points déjà corrigés
> sont listés en fin de document, pour ne pas les refaire.
> Vérifications faites le 2026-09-10 contre le code et la base de production.

## Déjà corrigé — ne pas refaire

| Point de l'audit | Où |
| --- | --- |
| P1 — double-comptage du sommeil entre sources | `535288a` — `mergeSleepTimeline`, un seul stade par instant |
| P1 — déduplication d'activités trop agressive | `535288a` — chevauchement horaire exigé, plus « même jour » |
| P1 — plage hydratation `[0,10]` en litres | `535288a` — passée en ml |
| P1 — « docs/prompts décrit des défauts encore présents » | lots 2 et 3 + objectif de sommeil réglable |

---

```
Traite les points ci-dessous, issus des audits 1 & 2. Chacun a été VÉRIFIÉ
ouvert le 2026-09-10 : le constat est reproduit, pas recopié.

============================================================
A — Valeurs de sommeil aberrantes en base            [P0/P1 — données]
============================================================
Constat REPRODUIT sur la base de production :
  5 315 métriques sleep_duration
    205 sous 2 h
     25 au-dessus de 16 h
  maximum 32,31 h — et cette valeur apparaît TROIS FOIS avec le MÊME
  measured_at, donc trois sources pour une seule nuit.
C'est la signature du double-comptage : 32,31 h est ce que produit l'addition
de sources qui se chevauchent.

Le correctif de `mergeSleepTimeline` empêche d'en créer de nouvelles mais NE
NETTOIE PAS l'existant. Et ces lignes ont un measured_at à 13:45:27, pas à midi
local : elles viennent d'un autre chemin d'import, donc une resynchronisation ne
les écrasera pas — elle ajoutera des lignes correctes À CÔTÉ.

À faire :
- Écrire une requête de diagnostic (lecture seule) : distribution des valeurs,
  et combien de nuits ont plusieurs lignes pour un même measured_at.
- Décider du sort des lignes hors plage physiologique. Une nuit > 16 h n'existe
  pas ; une nuit < 2 h peut être une sieste mal étiquetée. Ne pas supprimer en
  masse sans distinguer les deux.
- Sauvegarder avant toute suppression (même méthode que la purge des
  habit_logs : export JSON local, puis suppression par lots).
- Ajouter un garde-fou à l'ingestion : rejeter ou tronquer une nuit > 16 h à
  l'écriture, dans validateHealthMetric — la plage sleep_duration est déjà
  [0,16] dans packages/connectors/src/quality.ts, mais elle n'est pas appliquée
  sur le chemin HealthKit natif. C'est ça qu'il faut brancher.

============================================================
B — Durcissement SQL / Supabase                       [P1 — sécurité]
============================================================
Non vérifiable avec la clé service_role — ce sont des réglages du projet.
À faire dans le dashboard / par migration :
- Réduire les grants accordés à anon et authenticated. TRUNCATE notamment n'a
  aucune raison d'être accordé.
- Verrouiller les 5 fonctions SECURITY DEFINER exécutables par anon et
  authenticated : challenge_leaderboard, create_apple_health_token,
  handle_new_user, leaderboard, my_connectors.
  Précédent utile : la migration 0024 fait déjà
  `revoke execute ... from public; grant execute ... to authenticated;`
  pour `leaderboard`. Appliquer le même motif aux autres, et retirer `anon`
  partout où il n'est pas indispensable.
- Activer la protection contre les mots de passe compromis (Supabase Auth).
- Token Apple Health : il est stocké tel quel et sert de bearer. Envisager un
  hachage en base, ou au minimum une rotation et une expiration.

============================================================
C — Garmin : repo ≠ backend déployé                   [P0]
============================================================
Le repo contient supabase/functions/garmin ET supabase/functions/strava ;
l'audit ne voit que apple-health et delete-account déployées.
À faire :
- Lister les fonctions réellement déployées (`supabase functions list`) et
  réconcilier avec le repo : déployer, ou retirer le code mort.
- IDEMPOTENCE (défaut confirmé dans le code) :
  supabase/functions/garmin/index.ts ~L279 fait `.insert()` sur `activities`
  alors que L294 fait `.upsert()` sur `health_metrics`. Un retry de webhook crée
  donc des doublons d'activités. → passer en upsert sur une clé stable
  (user_id + source + identifiant Garmin de l'activité), ce qui demande sans
  doute une contrainte unique et donc une migration.
- Vérifier l'authentification du webhook avant tout traitement du userId.

============================================================
D — HealthKit : 3 ans relus à chaque synchro          [P1/P2 — perf]
============================================================
apps/mobile/src/features/connectors/healthKitClient.ios.ts : LOOKBACK_DAYS =
365 * 3, relu intégralement à CHAQUE synchronisation.
À faire : historique initial complet une fois, puis synchronisation
incrémentale (ancre HealthKit, ou borne sur la dernière mesure connue).
Attention : les pas et le sommeil sont désormais des agrégats journaliers
rafraîchis par upsert — l'incrémental doit garder une petite fenêtre de
recouvrement (quelques jours) pour que la journée en cours se corrige.

============================================================
E — eas.json : chemin absolu et identifiants ASC       [P1]
============================================================
apps/mobile/eas.json ~L35 contient un chemin absolu vers la clé .p8 ainsi que
les identifiants App Store Connect. La clé elle-même n'est pas dans le repo,
mais la configuration n'est pas portable et expose des informations
d'environnement.
À faire : passer par des variables d'environnement EAS (secrets), et retirer
les valeurs en dur.

============================================================
F — Performance (après les correctifs fonctionnels)    [P2]
============================================================
- 34 policies RLS utilisent `auth.<fn>()` non enveloppé : remplacer par
  `(select auth.uid())` pour que le planificateur l'évalue une seule fois.
- 5 clés étrangères sans index dédié (Performance Advisor).
- 4 index signalés inutilisés : NE PAS les supprimer sans mesure.
- Les quotas basés sur `select count(*)` ont une course concurrente possible.

QUALITÉ & RÈGLES
- Branche claude/spot-wellness-app-r6l5bj ; git pull --rebase avant push.
- Jamais de suppression de données sans sauvegarde préalable.
- Ne jamais committer la clé service_role ni la clé .p8.
```

## Ordre conseillé

L'audit classe « avant TestFlight », mais TestFlight tourne depuis des semaines :
la vraie question est ce qui bloque une **ouverture publique**.

1. **B — durcissement SQL.** Rapide, purement Supabase, aucun risque de
   régression applicative.
2. **A — purge du sommeil aberrant.** Les données sont fausses aujourd'hui et le
   resteront ; le garde-fou d'ingestion évite la récidive.
3. **C — idempotence Garmin.** Avant tout usage réel du connecteur.
4. **D, E, F** — quand le reste est stable.
