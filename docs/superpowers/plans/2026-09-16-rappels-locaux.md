# Rappels locaux — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** programmer sur l'appareil quatre rappels (habitudes, coucher, séance planifiée, hydratation) réglables, sans serveur ni capacité Apple.

**Architecture:** un module pur dans `@supotsu/engines` décide quoi envoyer et quand ; un programmateur mince applique la liste à iOS derrière une interface `NotificationHost` testable ; un hook recalcule au premier plan et quand les données changent ; les réglages vivent dans les préférences de l'appareil.

**Tech Stack:** TypeScript strict, Vitest, Expo SDK 54, `expo-notifications`, `@react-native-picker/picker` (déjà présent).

**Spec:** `docs/superpowers/specs/2026-09-16-rappels-locaux-design.md`

## Global Constraints

- Tout **désactivé par défaut** ; autorisation demandée à la première activation, jamais au lancement.
- **Jamais de rappel vide** ; un seul par type et par jour (sauf hydratation, 3 maximum).
- Hydratation : premier à lever + intervalle, arrêt 2 h avant le coucher, **rien après 20 h**, condition au prorata.
- Fenêtre de **7 jours**, **60 rappels au maximum** (iOS en refuse au-delà de 64), les plus proches d'abord.
- Le programmateur laisse intact ce qui est déjà correct et ne touche jamais une notification qui n'est pas la nôtre (identifiants `supotsu:<kind>:<date>`).
- Commentaires et libellés en français ; cinq langues pour tout nouveau libellé.
- Par tâche : `npx tsc --noEmit -p apps/mobile`, `npx vitest run`, ESLint sur les fichiers touchés, commit + push.

---

### Task 1 : le module pur

**Files:** `packages/engines/src/reminders.ts` (+ `reminders.test.ts`), export dans `index.ts`.

**Produces:** `ReminderKind`, `ReminderSettings`, `DEFAULT_REMINDER_SETTINGS`, `PlannedReminder { id, kind, at, params }`, `plannedReminders(input, settings, now, days = 7)`.

- [ ] Tests des 9 scénarios de la spec, sous trois fuseaux.
- [ ] Implémentation.
- [ ] Commit « Décider quels rappels locaux programmer ».

### Task 2 : le programmateur et son hôte

**Files:** `apps/mobile/src/features/notifications/notificationHost.ts` (interface + bouchon), `notificationHost.ios.ts` (expo-notifications), `reminderScheduler.ts` (+ test contre un faux hôte). Installe `expo-notifications`.

**Produces:** `NotificationHost { scheduled(), schedule(r), cancel(id), permission(), requestPermission() }`, `syncReminders(host, wanted, texts)`.

- [ ] Tests du programmateur (5 scénarios de la spec).
- [ ] Implémentation + installation de la dépendance.
- [ ] Commit « Programmer et annuler les rappels locaux ».

### Task 3 : réglages et interface

**Files:** `apps/mobile/src/lib/preferences.tsx` (champ `reminderSettings`), `NotificationsScreen.tsx` (carte « Rappels »), `TimeWheel.tsx` (roue heures/minutes), cinq fichiers de langue.

- [ ] Implémentation (interrupteurs, roue, état d'autorisation, lien vers les réglages iOS).
- [ ] Commit « Régler ses rappels dans l'app ».

### Task 4 : câblage

**Files:** `useReminderScheduler.ts`, montage dans `app/_layout.tsx`, ouverture de l'écran visé au toucher d'un rappel.

- [ ] Implémentation : recalcul au premier plan et sur changement des données ou des réglages.
- [ ] Vérification finale (trois fuseaux) + section de recette.
- [ ] Commit « Recalculer les rappels à chaque ouverture ».
