# Synchro Apple Santé par ancres — conception

Validée avec l'utilisateur le 2026-09-13, section par section.

## Le problème

La synchro relit **trois ans** d'Apple Santé à chaque passage, que ce soit à
l'ouverture de l'app ou à chaque arrivée de données (livraison en arrière-plan).
Le bouton de l'Accueil relit 7 jours depuis `787213e`, mais c'est un palliatif.

Relire par **date de la donnée** a deux défauts de fond :

- **Les données arrivent en retard, datées du passé.** La Watch se synchronise
  avec l'iPhone en différé ; Garmin Connect, AutoSleep et consorts écrivent dans
  Santé après coup. Une fenêtre courte les rate ; seule une fenêtre énorme les
  rattrape.
- **Les suppressions sont invisibles.** Une séance ou un poids effacé dans Santé
  reste dans Supotsu pour toujours (seul le sommeil est remplacé, depuis
  `0957925`).

Et un défaut de plomberie, indépendant : `subscribeHealthKitChanges` abonne huit
types séparément, et chaque abonnement relance la synchro complète **sans
verrou**. Une arrivée de données peut déclencher plusieurs relectures de trois ans
en parallèle.

## Le principe

Apple fournit pour ça les requêtes **ancrées** (`HKAnchoredObjectQuery`) :
« qu'est-ce qui a été *ajouté ou supprimé* depuis telle position ? », quelle que
soit la date des données. `@kingstinct/react-native-healthkit` 14.0.2 les expose :
`queryQuantitySamplesWithAnchor`, `queryCategorySamplesWithAnchor`,
`queryWorkoutSamplesWithAnchor`, qui rendent `samples`, `deletedSamples` et
`newAnchor`.

Deux contraintes structurent tout le reste :

1. **Une suppression ne donne qu'un identifiant**, sans date. Pour les séances
   c'est suffisant (on stocke `applehealth-<uuid>`) ; pour les pas, le sommeil et
   les mesures, on ne sait pas quel jour recalculer.
2. **Pas et nuits sont des totaux** : une donnée nouvelle oblige à relire son jour
   (ou sa nuit) en entier, pas seulement ce qui est arrivé.

## Trois modes

| Mode | Quand | Ce qu'il fait |
| --- | --- | --- |
| **Incrémental** | ouverture, arrivée de données, bouton de l'Accueil, tirer-pour-rafraîchir | par type : changements depuis l'ancre → jours/nuits touchés relus en entier → enregistrement → ancres avancées |
| **Complet** | première synchro (aucune ancre), bouton de l'écran Appareils, filet hebdomadaire | relecture sur 3 ans qui **remplace** toutes nos données Santé |
| **Fenêtre de 30 jours** | un type signale des suppressions | relecture de ce type sur 30 jours, qui remplace nos lignes sur la période |

**Règle d'or : une ancre n'avance qu'après un enregistrement réussi.** Si
l'enregistrement échoue, rien ne bouge et la synchro suivante recommence. Toutes
les écritures sont idempotentes : rejouer ne crée pas de doublon.

**Une seule synchro à la fois.** Toutes les demandes passent par une file : si une
synchro tourne, une nouvelle demande programme un tour de plus à la fin au lieu
d'en lancer une seconde. Une demande de mode complet l'emporte sur une demande
incrémentale en attente.

## Type par type

### Séances

- *Ajout* : normalisation actuelle (`normalizeHealthKitWorkout`), enregistrement
  par `external_id` — déjà sans doublon. Les séances écrites par Supotsu lui-même
  (`APP_BUNDLE_ID`) restent ignorées.
- *Suppression* : exacte, quel que soit l'âge — suppression des activités
  `source = apple_health`, `external_id = applehealth-<uuid>`.

### Mesures ponctuelles

VFC, FC au repos, poids, masse grasse, masse maigre (`QUANTITY_TYPES`).

- *Ajout* : enregistrées telles quelles (upsert qui ignore les doublons).
- *Suppression* : fenêtre de 30 jours pour le type concerné.

### Pas

- *Ajout* : jours locaux touchés par les échantillons ajoutés (un échantillon à
  cheval sur minuit en touche deux) → `queryStatisticsCollectionForQuantity` sur
  ces jours seulement, même calcul `cumulativeSum` qu'aujourd'hui → total du jour
  remplacé (upsert rafraîchissant, déjà en place pour `steps`).
- *Suppression* : recalcul sur 30 jours. Un jour pour lequel Santé ne rend plus de
  total est **supprimé** chez nous — sinon un total effacé resterait affiché.

### Sommeil

- *Ajout* : relecture des échantillons de **36 h avant** le plus ancien ajout à
  **36 h après** le plus récent ; découpage en sessions (`splitIntoSessions`, trou
  de plus de 3 h) ; on garde les sessions qui contiennent au moins un ajout. Nos
  sessions sur leur étendue sont remplacées. La durée par jour
  (`sleep_duration`) est recalculée pour les jours de réveil de ces sessions, à
  partir de **toutes** les sessions de ce jour présentes dans la relecture — une
  sieste non touchée compte toujours.
- *Suppression* : recalcul sur 30 jours, avec `replace` sur `sleep_session` **et**
  `sleep_duration` — une nuit effacée doit emporter sa durée.

Les 36 h garantissent de voir la nuit entière, même quand une montre envoie sa
nuit par morceaux sur plusieurs synchros.

## Le remplacement

Généralise `replaceSleepSource` (`0957925`) à tous les types.

`ImportPayload` perd `replaceSleepSource` et gagne :

```ts
/** Pour chaque fenêtre : nos lignes Santé de ce type, sur [from, to), absentes du lot, sont supprimées. */
replace?: { kind: 'sleep_session' | HealthMetricType; from: string; to: string }[];
/** Séances supprimées dans Santé — identifiants `applehealth-<uuid>`. */
deletedActivityExternalIds?: string[];
```

Le mode complet émet une fenêtre par type, de la plus ancienne donnée relue à
maintenant. La fenêtre de 30 jours n'en émet que pour le type qui a signalé des
suppressions. Le mode incrémental n'émet de `replace` que pour les sessions de
sommeil relues (leur étendue).

**Garde-fou : on ne remplace jamais un type dont la relecture est revenue vide.**
Santé ne signale pas une permission retirée — il rend une liste vide. Sans ce
garde-fou, retirer l'autorisation du poids effacerait tout l'historique de poids
au filet hebdomadaire suivant. Même règle que `staleSleepSessionIds` aujourd'hui.

Le remplacement se fait **après** les upserts, jamais avant : si l'écriture
échoue, rien n'est supprimé.

## Les ancres

- Stockées dans le stockage sécurisé, une par type et **par compte** :
  `supotsu.healthkit.anchor.<userId>.<type>`. Deux comptes sur un même iPhone ne
  se mélangent pas.
- Date du dernier mode complet réussi : `supotsu.healthkit.lastFull.<userId>`.
  Le filet se déclenche à l'ouverture si elle date de plus de **7 jours**.
- Si nos données serveur sont purgées, les ancres du téléphone croiront tout
  envoyé : le filet hebdomadaire reconstruit, et le bouton de l'écran Appareils
  le fait tout de suite.

### Première synchro

1. Relever l'ancre actuelle de chaque type **sans rien télécharger** : requête
   ancrée sans ancre, avec un filtre de date qui ne correspond à rien (date
   future), `limit: 1`.
2. Mode complet.
3. Enregistrer les ancres une fois l'enregistrement réussi.

Relever les ancres **avant** la relecture garantit que ce qui arrive pendant
celle-ci sera revu la fois suivante (au moins une fois, jamais zéro).

> **Hypothèse non vérifiée.** Que Santé rende la position courante pour une
> requête qui ne renvoie aucun échantillon — et que cette ancre soit valable pour
> les requêtes suivantes sans filtre. Si l'ancre revient vide, repli : parcourir
> l'historique par pages de 5 000 en jetant les échantillons (une fois par
> installation). La ligne de diagnostic dit laquelle des deux branches a servi.

## Les erreurs

| Situation | Conduite |
| --- | --- |
| Enregistrement en échec | aucune ancre n'avance ; la synchro suivante recommence |
| Lecture d'un type en échec | ce type est écarté du lot, son ancre ne bouge pas ; les autres avancent |
| Ancre refusée par Santé | ancres de ce compte effacées → mode complet |
| Mode complet en échec | `lastFull` inchangé → nouvel essai à la prochaine ouverture |

## Diagnostic

Une ligne « Dernière synchro » dans l'écran Appareils : mode, durée, nombre
d'ajouts et de suppressions par type, origine des ancres (`requête vide`,
`parcours paginé`, `existantes`). Stockée localement
(`supotsu.healthkit.lastReport.<userId>`).

C'est le seul moyen de vérifier le mode incrémental sur TestFlight : le build local
ne fonctionne pas.

## Découpage

| Unité | Rôle | Dépend de |
| --- | --- | --- |
| `packages/connectors/src/healthKitIncremental.ts` | calculs purs : jours touchés, fenêtre de 36 h, sessions touchées, jours de réveil à recalculer | `appleHealth.ts` |
| `apps/mobile/src/features/connectors/healthSource.ts` | interface `HealthSource` : ancre courante, changements depuis une ancre, relecture d'une fenêtre, totaux de pas par jour | — |
| `healthKitClient.ios.ts` | implémentation native de `HealthSource` ; le mode complet actuel y reste | Santé |
| `apps/mobile/src/features/connectors/healthSyncEngine.ts` | orchestrateur : modes, ancres, règle d'or, remplacement, rapport | `HealthSource`, stockage, `persist` |
| `apps/mobile/src/features/connectors/healthSyncQueue.ts` | file à passage unique + tour supplémentaire | — |
| `repository.ts` / `database` | `replace` généralisé, `deletedActivityExternalIds` | — |

L'orchestrateur ne connaît Santé qu'à travers `HealthSource` : c'est ce qui permet
de le tester contre un faux.

## Ce qui change à l'écran

- Bouton de l'Accueil et tirer-pour-rafraîchir : mode incrémental. L'option
  `days` de `syncHealthKit` et `MANUAL_SYNC_DAYS` sont retirées ; `syncWindow` et
  `trimToWindow` restent, pour la fenêtre de 30 jours.
- Écran Appareils : mode complet, plus la ligne de diagnostic.

## Tests

Calculs purs (`healthKitIncremental.test.ts`) : jours touchés à travers minuit et
un changement d'heure ; fenêtre de 36 h ; sélection des sessions touchées ; jours
de réveil recalculés sans perdre une sieste non touchée.

Orchestrateur, contre un faux `HealthSource` (`healthSyncEngine.test.ts`) :

1. première synchro : mode complet, ancres enregistrées **après** l'enregistrement ;
2. enregistrement en échec : aucune ancre n'avance ;
3. lecture d'un type en échec : les autres avancent, pas lui ;
4. séance supprimée : `deletedActivityExternalIds` contient la bonne ligne ;
5. pas supprimés : fenêtre de 30 jours avec `replace` sur `steps` ;
6. nuit ajoutée par morceaux sur deux synchros : une seule session à la fin ;
7. filet : mode complet au-delà de 7 jours, pas avant ;
8. relecture complète vide pour un type : aucun `replace` pour lui ;
9. ancre refusée : bascule en mode complet.

File (`healthSyncQueue.test.ts`) : dix demandes simultanées donnent une synchro
plus un tour ; une demande complète en attente l'emporte sur une incrémentale.

## Retour arrière

`INCREMENTAL_SYNC` dans `healthSyncEngine.ts`. À `false`, chaque demande part en
mode complet — exactement le comportement d'avant, file comprise.

## Hors périmètre

- La synchro vers Santé (écritures de repas, eau, séances) : inchangée.
- La fréquence cardiaque, lue à la demande par séance : inchangée.
- Les imports de fichiers (Health Auto Export, Garmin) : inchangés, jamais de
  `replace`.
