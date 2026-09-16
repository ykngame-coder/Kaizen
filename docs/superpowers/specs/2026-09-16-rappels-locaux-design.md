# Rappels locaux — conception

Validée avec l'utilisateur le 2026-09-16, section par section.

## Le problème

L'app n'envoie **aucune** notification. L'écran Profil › Notifications est un fil
calculé dans l'app à partir des données locales : on ne le voit qu'en l'ouvrant.
Ses interrupteurs par catégorie ne filtrent que la liste affichée et ne sont même
pas conservés. `Preferences.reminders` et `Preferences.dailyBriefing` existent,
persistés, mais rien ne les lit.

Rien n'est installé côté technique : ni `expo-notifications`, ni droit
d'envoi, ni capacité « Push Notifications » sur l'identifiant Apple (seules
Achats intégrés, Sign in with Apple et HealthKit y sont déclarées).

Ce document ne couvre **que les notifications locales** — programmées par
l'appareil, sans serveur ni capacité Apple supplémentaire. Les notifications
distantes (push) sont hors périmètre.

## Le principe

iOS ne réveille pas l'app pour décider d'envoyer un rappel : tout est
**programmé à l'avance**. L'app calcule donc les rappels des **7 prochains
jours** et remplace ceux déjà programmés, à chaque passage au premier plan et
après toute action qui change la donne.

Une condition (« s'il reste une habitude à valider ») est donc évaluée à la
**programmation**, pas au déclenchement. Ça tombe juste ici : valider une
habitude, boire, ou terminer une séance passe **par l'app**. Si elle n'a pas été
ouverte, la condition n'a pas changé et le rappel reste vrai ; dès qu'elle
l'est, tout est recalculé. Le seul cas faux est l'usage sur deux appareils.

## Les quatre rappels

| Rappel | Quand | Envoyé seulement si | Touché → |
| --- | --- | --- | --- |
| **Habitudes** | 20 h 30 (réglable) | une habitude quotidienne n'est pas validée ; une hebdomadaire seulement quand il reste autant de jours que d'occurrences dues | Profil › Habitudes |
| **Coucher** | 30 min avant l'heure idéale du chronotype | le chronotype a pu être calculé — sinon rien, plutôt qu'une heure inventée | Sommeil › Rythme circadien |
| **Séance planifiée** | 8 h (réglable) | une séance est planifiée ce jour-là, ni faite ni passée | la séance |
| **Hydratation** | lever + N × intervalle (4 h par défaut, réglable 2-6 h) | retard sur l'objectif au prorata de la journée éveillée | Nutrition |

**Textes** (le module pur rend un type et des paramètres ; l'app traduit) :

- Habitudes : « Il te reste {{count}} habitudes — coche-les avant minuit pour garder ta série. »
- Coucher : « Coucher dans 30 minutes — ton créneau de ce soir : {{window}}. »
- Séance : « Séance prévue aujourd'hui — {{name}}. »
- Hydratation : « Il te reste {{litres}} L à boire — un verre maintenant, c'est autant de moins ce soir. »

### Hydratation : le détail

- **Heure de lever** : fin de la dernière nuit enregistrée ; à défaut l'heure de
  réveil idéale du chronotype ; en dernier recours 7 h.
- **Premier rappel à lever + intervalle**, pas au lever.
- **Arrêt** 2 h avant l'heure de coucher idéale, et **jamais après 20 h**.
- **Trois rappels par jour au maximum.**
- **Condition par créneau** : la quantité bue est comparée à l'attendu au prorata
  de la journée éveillée (objectif × temps écoulé depuis le lever / durée
  éveillée). Un créneau déjà « à jour » n'est pas programmé.
- **Limite assumée** : boire sans le saisir dans l'app ne peut pas être deviné.

### Règles communes

1. **Jamais de rappel vide** : condition non remplie, rien n'est programmé.
2. **Un seul par type et par jour.**
3. **Son et vibration par défaut d'iOS, aucune pastille sur l'icône.**

## Architecture

| Unité | Rôle | Dépend de |
| --- | --- | --- |
| `packages/engines/src/reminders.ts` | **pur** : à partir de l'état (habitudes, journaux, séances planifiées, nuits, entrées d'hydratation, objectifs, chronotype), des réglages et de l'instant, rend la liste des rappels datés des 7 prochains jours | moteurs existants (`computeCircadianProfile`, `sumDay`) |
| `apps/mobile/src/features/notifications/reminderScheduler.ts` | applique cette liste : annule les nôtres, programme les manquants ; ne décide rien | interface `NotificationHost` |
| `apps/mobile/src/features/notifications/notificationHost.ios.ts` | implémentation `expo-notifications` de `NotificationHost` + demande d'autorisation | expo-notifications |
| `apps/mobile/src/features/notifications/useReminderScheduler.ts` | déclenche le recalcul : passage au premier plan, changement des données, changement des réglages | requêtes existantes |
| `ReminderSettingsCard` dans `NotificationsScreen.tsx` | interrupteurs + heures (roue iOS native) | préférences |

Le programmateur ne connaît iOS qu'à travers `NotificationHost` : c'est ce qui
permet de le tester contre un faux, puisque le build local ne fonctionne pas.

**Identité d'un rappel** : `kind:YYYY-MM-DD` (par exemple `habits:2026-09-17`).
Le programmateur compare ce qui est programmé à ce qui devrait l'être : il
annule ce qui n'a plus lieu d'être, programme ce qui manque, et **laisse
intact** ce qui est déjà correct — reprogrammer à chaque ouverture ferait
vibrer l'appareil pour rien sur certaines versions d'iOS et perdrait l'ordre.

## Réglages

Ajoutés aux préférences de l'appareil (`Preferences`), à côté de l'existant :

```ts
reminderSettings: {
  habits: { enabled: boolean; time: string };      // « HH:MM », défaut 20:30
  bedtime: { enabled: boolean; offsetMin: number }; // défaut 30
  session: { enabled: boolean; time: string };     // défaut 08:00
  hydration: { enabled: boolean; intervalH: number }; // défaut 4
}
```

Tout est **désactivé par défaut** : on n'active pas des notifications dans le dos
de quelqu'un. Les anciens `reminders` et `dailyBriefing`, jamais lus, restent en
place sans usage — les retirer demanderait une migration des préférences pour
rien.

L'interface vit dans une carte « Rappels » en haut de Profil › Notifications.
Heures réglées à la roue iOS native (`@react-native-picker/picker`, déjà
présent). Le coucher affiche « 30 min avant ton heure idéale », l'hydratation son
intervalle.

## Autorisation

Demandée à la **première activation d'un rappel**, jamais au lancement : une
demande sans contexte se fait refuser, et un refus iOS est définitif tant qu'on
ne passe pas par les réglages système. Refusée, la carte reste visible, les
interrupteurs désactivés, avec une ligne d'explication et un bouton qui ouvre
Réglages › Supotsu.

## Erreurs

| Situation | Conduite |
| --- | --- |
| Autorisation refusée ou retirée | aucun rappel programmé ; la carte l'affiche |
| Programmation en échec | on ignore ce rappel, les autres sont programmés ; aucune erreur à l'écran (c'est un confort, pas une donnée) |
| Données pas encore chargées | aucun recalcul : mieux vaut garder les rappels existants qu'en programmer sur un état vide |
| Chronotype indisponible | pas de rappel de coucher ; l'hydratation retombe sur 7 h – 23 h |

## Tests

**Module pur** (`reminders.test.ts`), sous trois fuseaux :
1. aucun rappel quand tout est désactivé ;
2. habitudes : programmé si une quotidienne manque, pas si tout est validé ;
3. habitudes hebdomadaires : programmé seulement au dernier moment utile ;
4. coucher : 30 min avant l'heure idéale ; rien sans chronotype ;
5. séance : programmée le jour d'une séance planifiée, pas si elle est terminée ;
6. hydratation : créneaux à lever + N × intervalle, arrêt 2 h avant le coucher, jamais après 20 h, trois par jour au maximum ;
7. hydratation : un créneau déjà à jour au prorata n'est pas programmé ;
8. fenêtre de 7 jours, et aucun rappel dans le passé ;
9. passage à l'heure d'été : les heures locales restent celles réglées.

**Programmateur** (`reminderScheduler.test.ts`), contre un faux `NotificationHost` :
1. programme ce qui manque ;
2. annule ce qui n'a plus lieu d'être ;
3. laisse intact ce qui est déjà correct ;
4. ne touche jamais à une notification qui n'est pas la nôtre ;
5. un échec de programmation n'empêche pas les suivantes.

## Hors périmètre

- Les notifications **distantes** (push) : capacité Apple, clé APNs, jetons,
  émetteur serveur.
- Le **fil in-app** de l'écran Notifications : inchangé.
- Pastille sur l'icône, sons personnalisés, résumé programmé d'iOS.
