# Sélecteur de jour — conception

Cinq bugs de cette session sont nés du même endroit. Ce document dit lequel et
ce qu'on y change.

## Le défaut

`useSelectedDay()` rend un **instant** — `23:59:59.999` en heure locale, sérialisé
en ISO — pour représenter un **jour**.

Un instant ne porte pas la notion de jour : chaque consommateur doit la
redériver, et ils ne s'accordent pas sur la méthode.

## Ce que ça a produit

| Bug | Mésusage de l'instant |
| --- | --- |
| Récupération musculaire d'un cran trop fraîche | pris pour un **maintenant** — 13 h d'avance |
| Habitude cochée le mauvais jour | pris pour un **horodatage d'écriture** — 23:59:59, une heure de dérive suffisait |
| Repas absent de son écran | jour **UTC** d'un côté, local de l'autre |
| Heures de sommeil identiques d'un jour à l'autre | pris pour une **borne supérieure** au lieu d'un jour |
| Pas rangés la veille | jour **UTC** après minuit à Paris |

## L'état des lieux

17 définitions distinctes d'une clé de jour, 38 occurrences de `.slice(0, 10)`.

- **14 sont locales** (`getFullYear/getMonth/getDate`)
- **3 sont UTC** (`iso.slice(0, 10)`) : `DayNav.tsx`, `engines/gamification.ts`,
  `engines/wellness.ts`

La version UTC est celle du `DayNav` lui-même, c'est-à-dire la source.

**Bug latent que ça révèle :** sur un fuseau à décalage négatif, `endOfDayIso` du
9 vaut `04:59Z le 10`, et `slice(0, 10)` rend donc le 10. Libellés « Hier /
Aujourd'hui / Demain » et bornes décalés d'un jour pour toute l'Amérique.
Invisible depuis Paris.

## Pourquoi une chaîne marquée ne suffit pas

`type ISODateString = string`, un simple alias. Un `DayKey` défini comme
`string & { __day }` reste assignable à `string`, donc à `ISODateString` : le
compilateur laisserait passer `muscleStatesFor(sessions, day)`.

Marquer aussi `ISODateString` donnerait l'enforcement mais toucherait les 67
signatures `asOf` des engines et chaque littéral de date de leurs tests. Coût
sans rapport avec le gain.

## La forme retenue

Le sélecteur rend un **objet**, pas une valeur nue. On ne peut pas passer un
objet là où une chaîne est attendue : l'erreur devient inécrivable, et les
engines ne changent pas.

```ts
export interface SelectedDay {
  /** Jour civil local, AAAA-MM-JJ — regroupements, params de route. */
  key: string;
  /** Minuit local, en ISO — borne inférieure. */
  startOfDay: ISODateString;
  /** 23:59:59.999 local, en ISO — borne supérieure d'un `asOf`. */
  endOfDay: ISODateString;
  /** Midi local, en ISO — instant stable pour horodater une écriture. */
  noon: ISODateString;
  isToday: boolean;
}
```

Trois instants nommés parce que les trois usages sont légitimes et distincts —
c'est de les confondre sous une seule valeur qui a coûté cinq bugs. `noon` suit
la convention déjà en place pour le sommeil (`nightKeyToIso`) et les pas : midi
ne change pas de jour sous une heure de dérive, minuit et fin de journée si.

**Ce qui n'est pas fourni : un « maintenant ».** Un écran qui a besoin de
l'instant présent appelle `new Date()`. Le jour consulté ne doit jamais en tenir
lieu — c'est précisément le bug de la récupération musculaire.

## Portée

| Couche | Changement |
| --- | --- |
| `navigation/day.ts` (nouveau) | `SelectedDay`, `dayKeyOf`, `selectedDayFrom`, `useSelectedDay` |
| `DayNav`, `DatePickerModal` | prennent et rendent un `SelectedDay` |
| 4 hubs (Habitudes, Nutrition, Sommeil, Sport) | ~63 usages de `selectedDate`/`asOf` à qualifier |
| `engines/gamification.ts`, `engines/wellness.ts` | leurs `dayKey` UTC passent en local |
| 14 `dayKey` locaux dupliqués | remplacés par `dayKeyOf` |

**Hors périmètre :** les signatures `asOf: ISODateString` des engines. Un moteur
qui calcule « à tel instant » a une API saine ; le défaut était que les écrans
lui passaient le mauvais instant. Les toucher multiplierait le risque sans rien
corriger de plus.

## Tests

`day.ts` concentre la logique et se teste seul :

- `dayKeyOf` rend le jour **local**, y compris pour un instant qui bascule de
  jour en UTC (00:30 à Paris, 23:30 à New York)
- `startOfDay` < `noon` < `endOfDay`, tous le même `key`
- traversée de mois, d'année, et d'un changement d'heure
- `isToday` vrai le jour même, faux la veille et le lendemain
- l'aller-retour `dayKeyOf(selectedDayFrom(k).endOfDay) === k` sur une année
  entière — c'est l'invariant que le `23:59:59.999` cassait sur fuseau négatif

## Migration

Écran par écran, en commençant par Habitudes (4 usages) pour valider la forme,
puis Sport, Sommeil, Nutrition. Le compilateur liste les appels à qualifier : la
migration est terminée quand il se tait.
