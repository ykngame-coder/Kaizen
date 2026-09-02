# Hub Customization (Sport / Nutrition / Sommeil) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Sport, Nutrition and Sommeil the same show/hide + reorder card customization Dashboard already has, via one shared, reusable UI instead of four copies.

**Architecture:** A generic `resolveCardOrder(defs, saved)` helper and a generic `HubCustomizeScreen` component replace Dashboard's Dashboard-only equivalents. Each hub gets its own `<hub>Cards.ts` defs file (id + label per customizable section) and a new `/x-customize` modal route thinly wrapping `HubCustomizeScreen`. Each hub screen keeps its header/day-nav/main-summary exactly as it renders today (fixed, "the screen's identity") and moves everything else into a `cardNodes: Record<string, ReactNode>` map, rendered through `resolveXCardOrder(preferences.xCards).filter((c) => c.visible).map(...)` — the same pattern `DashboardScreen.tsx` already uses.

**Tech Stack:** TypeScript, React Native/Expo, expo-router, `react-native-draggable-flatlist` (already a dependency, used by the existing `DashboardCustomizeScreen`), i18next (fr/en/es/pt/de).

**Spec:** docs/superpowers/specs/2026-09-02-hub-customization-design.md

## Global Constraints

- Scope: Sport, Nutrition, Sommeil only. Profil is explicitly out of scope (navigation menu, not data widgets).
- No new Preferences storage mechanism — reuse the existing device-local `secureStorage`-backed `Preferences` blob, same as `dashboardCards` today.
- No card-label translation — `*_CARD_DEFS` labels stay plain hardcoded French, matching `dashboardCards.ts`'s existing convention.
- No behavior change for Dashboard itself — migrating it onto `HubCustomizeScreen` must be visually and functionally identical to today.
- `react-native-draggable-flatlist`'s drag handle and the visibility `Toggle` stay two separate touch targets (established reason: avoids gesture conflicts with the list's own drag detection — see the original `DashboardCustomizeScreen` comment, carried into `HubCustomizeScreen`).

---

### Task 1: Shared preferences fields + generic resolveCardOrder helper

**Files:**
- Modify: `apps/mobile/src/lib/preferences.tsx`
- Create: `apps/mobile/src/lib/hubCards.ts`
- Modify: `apps/mobile/src/features/dashboard/dashboardCards.ts`

**Interfaces:**
- Produces: `Preferences.sportCards?`, `Preferences.nutritionCards?`, `Preferences.sommeilCards?: DashboardCardPref[]`; `HubCardDef { id: string; label: string }`; `resolveCardOrder(defs: HubCardDef[], saved: DashboardCardPref[] | undefined): DashboardCardPref[]` (exported from `apps/mobile/src/lib/hubCards.ts`) — every later task imports one or both of these.
- Consumes: nothing new (uses the existing `DashboardCardPref` type already in `preferences.tsx`).

- [ ] **Step 1: Add the three Preferences fields**

In `apps/mobile/src/lib/preferences.tsx`, find:

```ts
  /**
   * Dashboard card order + visibility. Undefined until the user customizes
   * it — DashboardScreen falls back to its own default order/visibility, so
   * this only needs writing when the user actually changes something.
   */
  dashboardCards?: DashboardCardPref[];
```

Replace with:

```ts
  /**
   * Per-hub card order + visibility. Undefined until the user customizes
   * that hub — each hub screen falls back to its own default order/
   * visibility, so a field only needs writing when the user actually
   * changes something on that hub's customize screen.
   */
  dashboardCards?: DashboardCardPref[];
  sportCards?: DashboardCardPref[];
  nutritionCards?: DashboardCardPref[];
  sommeilCards?: DashboardCardPref[];
```

- [ ] **Step 2: Create the generic resolve helper**

Create `apps/mobile/src/lib/hubCards.ts`:

```ts
import type { DashboardCardPref } from './preferences';

export interface HubCardDef {
  id: string;
  label: string;
}

/**
 * Merge a saved card preference with a hub's current card set: keeps the
 * saved order/visibility, appends any card added since (e.g. a future
 * update) at the end as visible, and drops ids that no longer exist.
 * Shared by every hub's customize screen and main screen — see
 * dashboardCards.ts, sportCards.ts, nutritionCards.ts, sommeilCards.ts for
 * the per-hub defs that feed this.
 */
export function resolveCardOrder(defs: HubCardDef[], saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  if (!saved || saved.length === 0) return defs.map((d) => ({ id: d.id, visible: true }));
  const validIds = new Set(defs.map((d) => d.id));
  const kept = saved.filter((s) => validIds.has(s.id));
  const keptIds = new Set(kept.map((k) => k.id));
  const missing = defs.filter((d) => !keptIds.has(d.id)).map((d) => ({ id: d.id, visible: true }));
  return [...kept, ...missing];
}
```

- [ ] **Step 3: Rewrite dashboardCards.ts to use the shared helper**

Replace the full contents of `apps/mobile/src/features/dashboard/dashboardCards.ts` with:

```ts
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Dashboard card, in default order. The header, "Focus du
 * jour" banner and "Score Kaizen" are fixed — not customizable, they're the
 * screen's identity, not a widget.
 */
export const DASHBOARD_CARD_DEFS: HubCardDef[] = [
  { id: 'etat-du-jour', label: 'État du jour' },
  { id: 'kpis', label: 'Indicateurs clés' },
  { id: 'priorites', label: 'Priorités du jour' },
  { id: 'prochaine-seance', label: 'Prochaine séance' },
  { id: 'corps-recuperation', label: 'Corps & récupération' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'habitudes', label: 'Habitudes' },
  { id: 'tendances', label: 'Tendances' },
  { id: 'analyse', label: 'Analyse du jour' },
  { id: 'badges', label: 'Badges récents' },
  { id: 'acces-rapides', label: 'Accès rapides' },
];

/** Thin wrapper around the shared resolveCardOrder — keeps DashboardScreen's existing call site unchanged. */
export function resolveDashboardCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(DASHBOARD_CARD_DEFS, saved);
}
```

(This drops the now-unused `DashboardCardDef` interface and `DEFAULT_DASHBOARD_CARDS` constant — confirmed via `grep -rn "DashboardCardDef|DEFAULT_DASHBOARD_CARDS" apps/mobile/src` that neither is imported anywhere outside this file.)

- [ ] **Step 4: Verify types compile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (`DashboardCustomizeScreen.tsx` still imports `DASHBOARD_CARD_DEFS`/`resolveDashboardCardOrder` at this point — both still exist with the same names/signatures, so this step must be clean before Task 2 touches that file.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/preferences.tsx apps/mobile/src/lib/hubCards.ts apps/mobile/src/features/dashboard/dashboardCards.ts
git commit -m "Add per-hub card preferences and a shared resolveCardOrder helper"
```

---

### Task 2: Generic HubCustomizeScreen + migrate Dashboard onto it

**Files:**
- Create: `apps/mobile/src/features/hubCustomize/HubCustomizeScreen.tsx`
- Delete: `apps/mobile/src/features/dashboard/DashboardCustomizeScreen.tsx`
- Modify: `apps/mobile/app/(modal)/dashboard-customize.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `pt.json`, `de.json`

**Interfaces:**
- Consumes: `HubCardDef`, `resolveCardOrder` (Task 1); `DASHBOARD_CARD_DEFS`, `resolveDashboardCardOrder` (Task 1, unchanged names).
- Produces: `HubCustomizeScreen` component with props `{ title: string; subtitle: string; cardDefs: HubCardDef[]; prefKey: 'dashboardCards' | 'sportCards' | 'nutritionCards' | 'sommeilCards'; backLabel: string }` — Tasks 3, 4, 5 each render this from their own new route file.

- [ ] **Step 1: Create the generic component**

Create `apps/mobile/src/features/hubCustomize/HubCustomizeScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useRouter } from 'expo-router';
import { Button, Screen, Text, Toggle, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref, Preferences } from '@/lib/preferences';
import { usePreferences } from '@/lib/preferences';

export interface HubCustomizeScreenProps {
  title: string;
  subtitle: string;
  cardDefs: HubCardDef[];
  /** Which Preferences field this hub's card order/visibility is stored under. */
  prefKey: 'dashboardCards' | 'sportCards' | 'nutritionCards' | 'sommeilCards';
  backLabel: string;
}

/**
 * Generic show/hide + reorder screen shared by every hub's customize modal
 * (Dashboard, Sport, Nutrition, Sommeil). The drag handle and the visibility
 * toggle are two separate touch targets on purpose: stacking a
 * long-press-to-drag and a tap-to-toggle on the same element is a common
 * source of flaky gesture conflicts on real devices once
 * react-native-gesture-handler is also driving the list's own drag
 * detection.
 */
export function HubCustomizeScreen({ title, subtitle, cardDefs, prefKey, backLabel }: HubCustomizeScreenProps): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const labelById = new Map(cardDefs.map((d) => [d.id, d.label]));
  const [cards, setCards] = useState<DashboardCardPref[]>(() =>
    resolveCardOrder(cardDefs, preferences[prefKey] as DashboardCardPref[] | undefined),
  );

  const persist = (next: DashboardCardPref[]): void => {
    setCards(next);
    setPreference(prefKey as keyof Preferences, next as Preferences[typeof prefKey]);
  };

  return (
    <Screen>
      <Text variant="title">{title}</Text>
      <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        {subtitle}
      </Text>

      <View style={{ flex: 1, marginTop: spacing[4] }}>
        <DraggableFlatList
          containerStyle={{ flex: 1 }}
          data={cards}
          keyExtractor={(item) => item.id}
          onDragEnd={({ data }) => persist(data)}
          renderItem={({ item, drag, isActive }: RenderItemParams<DashboardCardPref>) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[3],
                paddingVertical: spacing[3],
                paddingHorizontal: spacing[1],
                backgroundColor: isActive ? colors.surfaceElevated : 'transparent',
                borderRadius: radii.md,
                opacity: item.visible ? 1 : 0.5,
              }}
            >
              <Pressable onLongPress={drag} disabled={isActive} hitSlop={10} style={{ padding: spacing[1] }}>
                <Text style={{ fontSize: 18 }} color="textSubtle">☰</Text>
              </Pressable>
              <Text variant="body" style={{ flex: 1 }}>{labelById.get(item.id) ?? item.id}</Text>
              <Toggle
                value={item.visible}
                onValueChange={(v) => persist(cards.map((c) => (c.id === item.id ? { ...c, visible: v } : c)))}
              />
            </View>
          )}
        />
      </View>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label={backLabel} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Delete the Dashboard-only screen**

```bash
rm apps/mobile/src/features/dashboard/DashboardCustomizeScreen.tsx
```

- [ ] **Step 3: Point the Dashboard route at the generic screen**

Replace the full contents of `apps/mobile/app/(modal)/dashboard-customize.tsx` with:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { DASHBOARD_CARD_DEFS } from '@/features/dashboard/dashboardCards';

export default function DashboardCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('dashboard.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={DASHBOARD_CARD_DEFS}
      prefKey="dashboardCards"
      backLabel={t('common.back')}
    />
  );
}
```

- [ ] **Step 4: Add the shared i18n hint key (5 locales)**

Add `hubCustomize: { subtitle: "..." }` as a new key under `common` in each locale file — same text `dashboard.customize.subtitle` already has (this is the shared hint every hub's customize screen now uses; `dashboard.customize.subtitle` itself is left in place, unused, rather than deleted).

`fr.json`, under `"common": { ... }`:
```json
"hubCustomize": {
  "subtitle": "Reste appuyé sur ☰ pour déplacer une card ; l'interrupteur l'affiche ou la masque."
}
```

`en.json`:
```json
"hubCustomize": {
  "subtitle": "Press and hold ☰ to move a card; the switch shows or hides it."
}
```

`es.json`:
```json
"hubCustomize": {
  "subtitle": "Mantén pulsado ☰ para mover una tarjeta; el interruptor la muestra u oculta."
}
```

`pt.json`:
```json
"hubCustomize": {
  "subtitle": "Mantenha pressionado ☰ para mover um cartão; o interruptor o exibe ou oculta."
}
```

`de.json`:
```json
"hubCustomize": {
  "subtitle": "Halte ☰ gedrückt, um eine Karte zu verschieben; der Schalter zeigt oder verbirgt sie."
}
```

Verify all 5 files stay valid JSON:
```bash
cd apps/mobile/src/i18n/locales && for f in fr en es pt de; do python3 -c "import json; json.load(open('$f.json')); print('$f OK')"; done
```

- [ ] **Step 5: Verify types compile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. `DashboardScreen.tsx` is untouched and still calls `resolveDashboardCardOrder(preferences.dashboardCards)` from Task 1's rewritten `dashboardCards.ts` — same name, same signature.

- [ ] **Step 6: Lint**

Run: `npx eslint apps/mobile/src/features/hubCustomize apps/mobile/app/'(modal)'/dashboard-customize.tsx --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 7: Manual check**

Run the app (or `npx expo start --web`), open Dashboard, tap the "tune" icon in the header, confirm the customize screen looks and behaves exactly as before (drag a card, toggle a card off, go back, confirm the Dashboard reflects it).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/hubCustomize/HubCustomizeScreen.tsx apps/mobile/app/'(modal)'/dashboard-customize.tsx apps/mobile/src/i18n/locales/fr.json apps/mobile/src/i18n/locales/en.json apps/mobile/src/i18n/locales/es.json apps/mobile/src/i18n/locales/pt.json apps/mobile/src/i18n/locales/de.json
git add -u apps/mobile/src/features/dashboard/DashboardCustomizeScreen.tsx
git commit -m "Replace DashboardCustomizeScreen with a generic HubCustomizeScreen"
```

---

### Task 3: Sport hub customization

**Files:**
- Create: `apps/mobile/src/features/sport/sportCards.ts`
- Create: `apps/mobile/app/(modal)/sport-customize.tsx`
- Modify: `apps/mobile/src/features/sport/SportScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `pt.json`, `de.json`

**Interfaces:**
- Consumes: `HubCardDef`, `resolveCardOrder` (Task 1); `HubCustomizeScreen` (Task 2).
- Produces: `SPORT_CARD_DEFS: HubCardDef[]`, `resolveSportCardOrder(saved): DashboardCardPref[]` — used only within this task (main screen + its customize route).

- [ ] **Step 1: Create the card defs**

Create `apps/mobile/src/features/sport/sportCards.ts`:

```ts
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Sport card, in default order. The header, day
 * navigation and the séance/score/corps/muscles carousel are fixed — the
 * screen's identity, not a widget.
 */
export const SPORT_CARD_DEFS: HubCardDef[] = [
  { id: 'recent', label: '3 dernières activités' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'sections', label: 'Sections' },
  { id: 'comprendre', label: 'Comprendre' },
  { id: 'objectifs', label: 'Objectifs' },
];

export function resolveSportCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(SPORT_CARD_DEFS, saved);
}
```

- [ ] **Step 2: Add the customize route**

Create `apps/mobile/app/(modal)/sport-customize.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { SPORT_CARD_DEFS } from '@/features/sport/sportCards';

export default function SportCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('sport.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={SPORT_CARD_DEFS}
      prefKey="sportCards"
      backLabel={t('common.back')}
    />
  );
}
```

- [ ] **Step 3: Add the i18n title key (5 locales)**

Add `"customize": { "title": "..." }` as a new top-level key under `"sport"` in each locale file:

`fr.json`: `"Personnaliser le Sport"`
`en.json`: `"Customize Sport"`
`es.json`: `"Personalizar Deporte"`
`pt.json`: `"Personalizar Desporto"`
`de.json`: `"Sport anpassen"`

Verify JSON validity the same way as Task 2 Step 4.

- [ ] **Step 4: Import usePreferences and the new defs in SportScreen.tsx**

In `apps/mobile/src/features/sport/SportScreen.tsx`, add to the imports:

```ts
import { usePreferences } from '@/lib/preferences';
import { SPORT_CARD_DEFS, resolveSportCardOrder } from './sportCards';
```

- [ ] **Step 5: Compute the card order**

Inside `SportScreen()`, right after the existing `const [selectedDate, setSelectedDate] = useSelectedDay();` line, add:

```ts
  const { preferences } = usePreferences();
  const cardOrder = useMemo(() => resolveSportCardOrder(preferences.sportCards), [preferences.sportCards]);
```

- [ ] **Step 6: Add the tune button to the header**

Replace:

```tsx
        <View style={{ position: 'relative' }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="title">{t('sport.screen.title')}</Text>
            <Text variant="caption" color="textMuted">
              {t('sport.screen.subtitle')}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/sport/exercises')}
            accessibilityLabel={t('sport.screen.searchExercise')}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, position: 'absolute', right: 0, top: 0 })}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="search" size={16} color={colors.text} />
            </View>
          </Pressable>
        </View>
```

with:

```tsx
        <View style={{ position: 'relative' }}>
          <View style={{ alignItems: 'center' }}>
            <Text variant="title">{t('sport.screen.title')}</Text>
            <Text variant="caption" color="textMuted">
              {t('sport.screen.subtitle')}
            </Text>
          </View>
          <View style={{ position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: spacing[2] }}>
            <Pressable
              onPress={() => router.push('/sport-customize')}
              accessibilityLabel={t('sport.customize.title')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="tune" size={16} color={colors.text} />
              </View>
            </Pressable>
            <Pressable
              onPress={() => router.push('/sport/exercises')}
              accessibilityLabel={t('sport.screen.searchExercise')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="search" size={16} color={colors.text} />
              </View>
            </Pressable>
          </View>
        </View>
```

- [ ] **Step 7: Build cardNodes and replace the customizable section**

Replace everything from the `{/* 3 dernières activités */}` comment through the `<ObjectifsCard .../>` line (i.e. everything between the `<Carousel .../>` and `</Screen>`) — currently:

```tsx
        {/* 3 dernières activités */}
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sport.screen.recent.heading')}
        </Text>
        {isLoading ? (
          <Text variant="body" color="textMuted">
            {t('common.loading')}
          </Text>
        ) : recent.length === 0 ? (
          <Card>
            <Text variant="body" color="textMuted">
              {t('sport.screen.recent.empty')}
            </Text>
          </Card>
        ) : (
          <Card>
            {recent.map((r, i) => {
              const row = (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < recent.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={r.kind === 'workout' ? 'tshirt' : 'run'} size={16} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{r.name}</Text>
                    <Text variant="caption" color="textSubtle" style={{ marginTop: 1 }}>
                      {formatDate(r.date)}
                      {r.durationSec ? ` · ${fmtDur(r.durationSec, t)}` : ''}
                      {r.rpe ? ` · ${t('sport.screen.recent.rpe', { rpe: r.rpe })}` : ''}
                    </Text>
                  </View>
                  {r.kind === 'workout' ? (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentData }} />
                  ) : null}
                </View>
              );
              return r.kind === 'workout' ? (
                <Pressable key={r.id} onPress={() => router.push({ pathname: '/sport/workout/[id]', params: { id: r.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  {row}
                </Pressable>
              ) : (
                <View key={r.id}>{row}</View>
              );
            })}
          </Card>
        )}
        <View style={{ alignItems: 'flex-start' }}>
          <Pressable onPress={() => router.push('/sport/activities')}>
            <Text variant="caption" color="primary">{t('sport.screen.recent.viewAllHistory')}</Text>
          </Pressable>
        </View>

        {/* Cette semaine */}
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sport.screen.week.heading')}
        </Text>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon={<Icon name="armFlex" size={18} color={colors.accentStrength} />} value={`${week.sessions}`} label={t('sport.screen.week.sessions')} />
            <StatTile icon={<Icon name="timer" size={18} color={colors.info} />} value={week.totalSec > 0 ? fmtDur(week.totalSec, t) : '—'} label={t('sport.screen.week.totalTime')} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon={<Icon name="fire" size={18} color={colors.warning} />} value={week.cals > 0 ? `${Math.round(week.cals)}` : '—'} label={t('sport.screen.week.calories')} />
            <StatTile icon={<Icon name="target" size={18} color={colors.accentData} />} value={week.rpe != null ? week.rpe.toFixed(1) : '—'} label={t('sport.screen.week.avgRpe')} />
          </View>
        </View>

        {/* Sections */}
        <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
          {NAV.map((n) => (
            <HubRow key={n.title} title={n.title} subtitle={n.subtitle} icon={<Icon name={n.icon} size={20} color={colors.text} />} soon={n.soon} onPress={n.path ? () => router.push(n.path!) : undefined} />
          ))}
        </View>

        <ComprendreCard pillars={['performance']} />
        <ObjectifsCard types={['performance', 'strength', 'endurance']} />
```

with:

```tsx
        {cardOrder.filter((c) => c.visible).map((c) => (
          <React.Fragment key={c.id}>{cardNodes[c.id]}</React.Fragment>
        ))}
```

Then, just above the `return (` statement (right after the `recent` useMemo block), add the `cardNodes` map:

```tsx
  const cardNodes: Record<string, React.ReactNode> = {
    recent: (
      <>
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sport.screen.recent.heading')}
        </Text>
        {isLoading ? (
          <Text variant="body" color="textMuted">
            {t('common.loading')}
          </Text>
        ) : recent.length === 0 ? (
          <Card>
            <Text variant="body" color="textMuted">
              {t('sport.screen.recent.empty')}
            </Text>
          </Card>
        ) : (
          <Card>
            {recent.map((r, i) => {
              const row = (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < recent.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={r.kind === 'workout' ? 'tshirt' : 'run'} size={16} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{r.name}</Text>
                    <Text variant="caption" color="textSubtle" style={{ marginTop: 1 }}>
                      {formatDate(r.date)}
                      {r.durationSec ? ` · ${fmtDur(r.durationSec, t)}` : ''}
                      {r.rpe ? ` · ${t('sport.screen.recent.rpe', { rpe: r.rpe })}` : ''}
                    </Text>
                  </View>
                  {r.kind === 'workout' ? (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentData }} />
                  ) : null}
                </View>
              );
              return r.kind === 'workout' ? (
                <Pressable key={r.id} onPress={() => router.push({ pathname: '/sport/workout/[id]', params: { id: r.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  {row}
                </Pressable>
              ) : (
                <View key={r.id}>{row}</View>
              );
            })}
          </Card>
        )}
        <View style={{ alignItems: 'flex-start' }}>
          <Pressable onPress={() => router.push('/sport/activities')}>
            <Text variant="caption" color="primary">{t('sport.screen.recent.viewAllHistory')}</Text>
          </Pressable>
        </View>
      </>
    ),
    week: (
      <>
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sport.screen.week.heading')}
        </Text>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon={<Icon name="armFlex" size={18} color={colors.accentStrength} />} value={`${week.sessions}`} label={t('sport.screen.week.sessions')} />
            <StatTile icon={<Icon name="timer" size={18} color={colors.info} />} value={week.totalSec > 0 ? fmtDur(week.totalSec, t) : '—'} label={t('sport.screen.week.totalTime')} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <StatTile icon={<Icon name="fire" size={18} color={colors.warning} />} value={week.cals > 0 ? `${Math.round(week.cals)}` : '—'} label={t('sport.screen.week.calories')} />
            <StatTile icon={<Icon name="target" size={18} color={colors.accentData} />} value={week.rpe != null ? week.rpe.toFixed(1) : '—'} label={t('sport.screen.week.avgRpe')} />
          </View>
        </View>
      </>
    ),
    sections: (
      <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
        {NAV.map((n) => (
          <HubRow key={n.title} title={n.title} subtitle={n.subtitle} icon={<Icon name={n.icon} size={20} color={colors.text} />} soon={n.soon} onPress={n.path ? () => router.push(n.path!) : undefined} />
        ))}
      </View>
    ),
    comprendre: <ComprendreCard pillars={['performance']} />,
    objectifs: <ObjectifsCard types={['performance', 'strength', 'endurance']} />,
  };
```

- [ ] **Step 8: Verify types compile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Lint**

Run: `npx eslint apps/mobile/src/features/sport --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 10: Manual check**

Start the app, open Sport, tap the new "tune" icon, hide "Cette semaine", go back, confirm it's gone from Sport; re-show it, confirm it reappears in the same position.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/features/sport/sportCards.ts apps/mobile/app/'(modal)'/sport-customize.tsx apps/mobile/src/features/sport/SportScreen.tsx apps/mobile/src/i18n/locales/fr.json apps/mobile/src/i18n/locales/en.json apps/mobile/src/i18n/locales/es.json apps/mobile/src/i18n/locales/pt.json apps/mobile/src/i18n/locales/de.json
git commit -m "Add Sport hub customization"
```

---

### Task 4: Nutrition hub customization

**Files:**
- Create: `apps/mobile/src/features/nutrition/nutritionCards.ts`
- Create: `apps/mobile/app/(modal)/nutrition-customize.tsx`
- Modify: `apps/mobile/src/features/nutrition/NutritionScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `pt.json`, `de.json`

**Interfaces:**
- Consumes: `HubCardDef`, `resolveCardOrder` (Task 1); `HubCustomizeScreen` (Task 2).
- Produces: `NUTRITION_CARD_DEFS: HubCardDef[]`, `resolveNutritionCardOrder(saved): DashboardCardPref[]`.

- [ ] **Step 1: Create the card defs**

Create `apps/mobile/src/features/nutrition/nutritionCards.ts`:

```ts
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Nutrition card, in default order. The header, day
 * navigation and the main kcal ring card are fixed — the screen's identity,
 * not a widget.
 */
export const NUTRITION_CARD_DEFS: HubCardDef[] = [
  { id: 'macros', label: 'Macros' },
  { id: 'hydration', label: 'Hydratation' },
  { id: 'meals', label: 'Repas' },
  { id: 'score', label: 'Score Nutrition' },
  { id: 'weight', label: 'Poids & composition' },
  { id: 'impact', label: 'Impact' },
  { id: 'trend', label: 'Tendances' },
  { id: 'goals', label: 'Objectifs nutritionnels' },
  { id: 'micronutrients', label: 'Micronutriments' },
  { id: 'comprendre', label: 'Comprendre' },
];

export function resolveNutritionCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(NUTRITION_CARD_DEFS, saved);
}
```

- [ ] **Step 2: Add the customize route**

Create `apps/mobile/app/(modal)/nutrition-customize.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { NUTRITION_CARD_DEFS } from '@/features/nutrition/nutritionCards';

export default function NutritionCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('nutrition.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={NUTRITION_CARD_DEFS}
      prefKey="nutritionCards"
      backLabel={t('common.back')}
    />
  );
}
```

- [ ] **Step 3: Add the i18n title key (5 locales)**

Add `"customize": { "title": "..." }` under `"nutrition"` in each locale file:

`fr.json`: `"Personnaliser la Nutrition"`
`en.json`: `"Customize Nutrition"`
`es.json`: `"Personalizar Nutrición"`
`pt.json`: `"Personalizar Nutrição"`
`de.json`: `"Ernährung anpassen"`

Verify JSON validity the same way as Task 2 Step 4.

- [ ] **Step 4: Import the new defs in NutritionScreen.tsx**

`usePreferences` is already imported and already destructured as `const { preferences, setPreference } = usePreferences();` — no import change needed there. Add:

```ts
import { NUTRITION_CARD_DEFS, resolveNutritionCardOrder } from './nutritionCards';
```

- [ ] **Step 5: Compute the card order**

Inside `NutritionScreen()`, right after the existing `const { preferences, setPreference } = usePreferences();` line, add:

```ts
  const cardOrder = useMemo(() => resolveNutritionCardOrder(preferences.nutritionCards), [preferences.nutritionCards]);
```

- [ ] **Step 6: Add the tune button to the header**

Replace:

```tsx
          <View style={{ position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: spacing[2] }}>
            <Pressable onPress={() => router.push('/sport/calendar')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" size={16} color={colors.text} /></View>
            </Pressable>
            <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="search" size={16} color={colors.text} /></View>
            </Pressable>
          </View>
```

with:

```tsx
          <View style={{ position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: spacing[2] }}>
            <Pressable onPress={() => router.push('/nutrition-customize')} accessibilityLabel={t('nutrition.customize.title')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="tune" size={16} color={colors.text} /></View>
            </Pressable>
            <Pressable onPress={() => router.push('/sport/calendar')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" size={16} color={colors.text} /></View>
            </Pressable>
            <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="search" size={16} color={colors.text} /></View>
            </Pressable>
          </View>
```

- [ ] **Step 7: Build cardNodes and replace the customizable section**

Replace everything from the `{/* Macros */}` comment through the `<ComprendreCard pillars={['nutrition']} />` line (i.e. everything between the main kcal-ring `</Card>` and `</Screen>`) — currently:

```tsx
        {/* Macros */}
        <Card>
          <SectionTitle>{t('nutrition.screen.macros.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <MacroRing label={t('nutrition.screen.macros.protein')} current={totals.proteinG} target={goals.proteinG} color={colors.accentData} />
            <MacroRing label={t('nutrition.screen.macros.carbs')} current={totals.carbG} target={carbTarget} color={colors.warning} />
            <MacroRing label={t('nutrition.screen.macros.fat')} current={totals.fatG} target={fatTarget} color={colors.accentMobility} />
          </View>
        </Card>

        {/* Hydration */}
        <Card>
          <SectionTitle right={<Text variant="subtitle" style={{ color: colors.accentEndurance }}>{(Math.max(0, totals.hydrationMl) / 1000).toFixed(2)} / {(goals.hydrationMl / 1000).toFixed(2)} L</Text>}>{t('nutrition.screen.hydration.title')}</SectionTitle>
          <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(100, (totals.hydrationMl / goals.hydrationMl) * 100))}%`, height: 10, backgroundColor: colors.accentEndurance }} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            {WATER_PRESETS.map((ml) => (
              <FilterChip key={ml} label={`${ml} ml`} active={waterAmount === ml} onPress={() => setWaterAmount(ml)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button label={`− ${waterAmount} ml`} variant="secondary" fullWidth onPress={() => addWater(-waterAmount)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={`+ ${waterAmount} ml`} fullWidth onPress={() => addWater(waterAmount)} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2], alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('nutrition.screen.hydration.quantityLabel')}
                placeholder={t('nutrition.screen.hydration.quantityPlaceholder')}
                keyboardType="numeric"
                value={customWater}
                onChangeText={setCustomWater}
              />
            </View>
            <Button
              label={t('nutrition.screen.hydration.addButton')}
              variant="secondary"
              disabled={!customWater.trim() || Number(customWater) <= 0}
              onPress={() => {
                addWater(Number(customWater));
                setCustomWater('');
              }}
            />
          </View>
        </Card>

        {/* Repas */}
        <Card>
          <SectionTitle>{t('nutrition.screen.meals.title')}</SectionTitle>
          {meals.map((m, i) => (
            <View key={m.type} style={{ paddingVertical: spacing[2], borderBottomWidth: i < meals.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Text variant="caption" color="textSubtle" style={{ flex: 1, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t(`nutrition.screen.meal.${m.type}`)}</Text>
                {m.count > 0 ? <Text variant="caption" color="textSubtle">{Math.round(m.kcal)} kcal</Text> : null}
              </View>
              {m.count > 0 ? (
                <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                  {m.entries.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => router.push({ pathname: '/nutrition/meal/[id]', params: { id: e.id } })}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.6 : 1 })}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={MEAL_ICON[m.type] ?? 'bowl'} size={19} color={colors.text} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{e.description || t(`nutrition.screen.meal.${m.type}`)}</Text>
                        <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }} numberOfLines={1}>P {Math.round(e.proteinG ?? 0)} · G {Math.round(e.carbG ?? 0)} · L {Math.round(e.fatG ?? 0)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="body" style={{ fontWeight: '700' }}>{Math.round(e.kcal)}</Text>
                        <Text variant="caption" color="textSubtle">kcal</Text>
                      </View>
                      <Pressable
                        onPress={() => deleteEntry.mutate(e.id)}
                        disabled={deleteEntry.isPending && deleteEntry.variables === e.id}
                        hitSlop={8}
                        style={{ opacity: deleteEntry.isPending && deleteEntry.variables === e.id ? 0.4 : 1 }}
                      >
                        <Icon name="trash" size={18} color={colors.textSubtle} />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Icon name={MEAL_ICON[m.type] ?? 'bowl'} size={19} color={colors.text} /></View>
                  <Text variant="caption" color="textSubtle" style={{ flex: 1 }}>{t('nutrition.screen.meals.toPlan')}</Text>
                  <Text variant="caption" color="textSubtle">{t('nutrition.screen.meals.pending')}</Text>
                </View>
              )}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Button label={t('nutrition.screen.meals.searchFood')} onPress={() => router.push('/nutrition/food/search')} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('nutrition.screen.meals.manualEntry')} variant="secondary" onPress={() => router.push({ pathname: '/nutrition/meal/new', params: { date: dayKey(selectedDate) } })} fullWidth />
            </View>
          </View>
        </Card>

        {/* Nutrition Score */}
        <Card>
          <SectionTitle>{t('nutrition.screen.score.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
            <ProgressRing value={hasData ? score.value : 0} size={96} thickness={9} color={colors.accentData} centerLabel={hasData ? `${score.value}` : '—'} caption="/ 100" />
            <View style={{ flex: 1 }}>
              <Text variant="body">{hasData ? (score.value >= 80 ? t('nutrition.screen.score.quality.excellent') : score.value >= 60 ? t('nutrition.screen.score.quality.good') : t('nutrition.screen.score.quality.needsImprovement')) : t('nutrition.screen.score.quality.noData')}</Text>
              <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2], lineHeight: 18 }}>{t('nutrition.screen.score.basedOn')}</Text>
            </View>
          </View>
        </Card>

        {/* Poids & composition */}
        <Card>
          <SectionTitle right={<Pressable onPress={() => router.push('/nutrition/weight')}><Text variant="caption" color="primary">{t('nutrition.screen.weight.viewLink')}</Text></Pressable>}>{t('nutrition.screen.weight.title')}</SectionTitle>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <Balance label={t('nutrition.screen.weight.weight')} value={latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—'} />
            <Balance label={t('nutrition.screen.weight.bodyFat')} value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
            <Balance label={t('nutrition.screen.weight.muscleMass')} value={muscleMass != null ? `${muscleMass.toFixed(1)} kg` : '—'} />
            <Balance
              label={t('nutrition.screen.weight.weeklyChange')}
              value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg` : '—'}
              color={weightDelta != null && weightDelta <= 0 ? colors.accentData : undefined}
            />
          </View>
        </Card>

        {/* Impact */}
        {explanation ? (
          <Card>
            <SectionTitle>{t('nutrition.screen.impact.title')}</SectionTitle>
            <Text variant="body" color="textMuted">{t(explanation.observation.key, explanation.observation.params)}</Text>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>{t(explanation.analysis.key, explanation.analysis.params)}</Text>
            <Text variant="body" style={{ marginTop: spacing[2] }}>{t(explanation.action.key, explanation.action.params)}</Text>
          </Card>
        ) : null}

        {/* Tendances */}
        {kcalSeries.length >= 2 ? (
          <Card>
            <SectionTitle right={<Text variant="caption" color="textSubtle">{t('nutrition.screen.trend.days30')}</Text>}>{t('nutrition.screen.trend.title')}</SectionTitle>
            <Sparkline values={kcalSeries} width={300} height={80} color={colors.primary} />
          </Card>
        ) : null}

        {/* Objectifs */}
        <Card>
          <SectionTitle right={
            <Pressable onPress={() => setPreference('nutritionGoals', undefined)} disabled={!customized}>
              <Text variant="caption" color={customized ? 'primary' : 'textSubtle'}>{customized ? t('nutrition.screen.goals.resetAuto') : t('nutrition.screen.goals.auto')}</Text>
            </Pressable>
          }>{t('nutrition.screen.goals.title')}</SectionTitle>
          <GoalBar label={t('nutrition.screen.goals.caloriesLabel')} current={totals.kcal} target={kcalTarget} unit="kcal" color={colors.info} />
          <GoalBar label={t('nutrition.screen.goals.proteinLabel')} current={totals.proteinG} target={goals.proteinG} unit="g" color={colors.accentData} />
          <GoalBar label={t('nutrition.screen.goals.hydrationLabel')} current={totals.hydrationMl / 1000} target={goals.hydrationMl / 1000} unit="L" color={colors.accentEndurance} />

          <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[4] }}>{customized ? t('nutrition.screen.goals.adjustHintPerso') : t('nutrition.screen.goals.adjustHintAuto')}</Text>
          <StepperRow
            label={t('nutrition.screen.goals.caloriesLabel')}
            rawValue={Math.round(goals.kcal)}
            format={(v) => `${Math.round(v)} kcal`}
            onMinus={() => adjust({ kcal: -50 })}
            onPlus={() => adjust({ kcal: 50 })}
            onSet={(v) => setExact({ kcal: v })}
          />
          <StepperRow
            label={t('nutrition.screen.goals.proteinLabel')}
            rawValue={Math.round(goals.proteinG)}
            format={(v) => `${Math.round(v)} g`}
            onMinus={() => adjust({ proteinG: -5 })}
            onPlus={() => adjust({ proteinG: 5 })}
            onSet={(v) => setExact({ proteinG: v })}
          />
          <StepperRow
            label={t('nutrition.screen.goals.hydrationLabel')}
            rawValue={Number((goals.hydrationMl / 1000).toFixed(2))}
            format={(v) => `${v.toFixed(2)} L`}
            onMinus={() => adjust({ hydrationMl: -250 })}
            onPlus={() => adjust({ hydrationMl: 250 })}
            onSet={(v) => setExact({ hydrationMl: v * 1000 })}
          />

          <CalorieCalculatorForm />
        </Card>

        {/* Micronutriments — honest */}
        <Card>
          <SectionTitle>{t('nutrition.screen.micronutrients.title')}</SectionTitle>
          <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>{t('nutrition.screen.micronutrients.description')}</Text>
        </Card>

        <ComprendreCard pillars={['nutrition']} />
```

with:

```tsx
        {cardOrder.filter((c) => c.visible).map((c) => (
          <React.Fragment key={c.id}>{cardNodes[c.id]}</React.Fragment>
        ))}
```

Then, right after the `kcalSeries` useMemo block and just above the `return (` statement, add the `cardNodes` map (each value is exactly the JSX block it replaces above, unchanged):

```tsx
  const cardNodes: Record<string, React.ReactNode> = {
    macros: (
      <Card>
        <SectionTitle>{t('nutrition.screen.macros.title')}</SectionTitle>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <MacroRing label={t('nutrition.screen.macros.protein')} current={totals.proteinG} target={goals.proteinG} color={colors.accentData} />
          <MacroRing label={t('nutrition.screen.macros.carbs')} current={totals.carbG} target={carbTarget} color={colors.warning} />
          <MacroRing label={t('nutrition.screen.macros.fat')} current={totals.fatG} target={fatTarget} color={colors.accentMobility} />
        </View>
      </Card>
    ),
    hydration: (
      <Card>
        <SectionTitle right={<Text variant="subtitle" style={{ color: colors.accentEndurance }}>{(Math.max(0, totals.hydrationMl) / 1000).toFixed(2)} / {(goals.hydrationMl / 1000).toFixed(2)} L</Text>}>{t('nutrition.screen.hydration.title')}</SectionTitle>
        <View style={{ height: 10, borderRadius: 6, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(0, Math.min(100, (totals.hydrationMl / goals.hydrationMl) * 100))}%`, height: 10, backgroundColor: colors.accentEndurance }} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
          {WATER_PRESETS.map((ml) => (
            <FilterChip key={ml} label={`${ml} ml`} active={waterAmount === ml} onPress={() => setWaterAmount(ml)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <Button label={`− ${waterAmount} ml`} variant="secondary" fullWidth onPress={() => addWater(-waterAmount)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={`+ ${waterAmount} ml`} fullWidth onPress={() => addWater(waterAmount)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2], alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t('nutrition.screen.hydration.quantityLabel')}
              placeholder={t('nutrition.screen.hydration.quantityPlaceholder')}
              keyboardType="numeric"
              value={customWater}
              onChangeText={setCustomWater}
            />
          </View>
          <Button
            label={t('nutrition.screen.hydration.addButton')}
            variant="secondary"
            disabled={!customWater.trim() || Number(customWater) <= 0}
            onPress={() => {
              addWater(Number(customWater));
              setCustomWater('');
            }}
          />
        </View>
      </Card>
    ),
    meals: (
      <Card>
        <SectionTitle>{t('nutrition.screen.meals.title')}</SectionTitle>
        {meals.map((m, i) => (
          <View key={m.type} style={{ paddingVertical: spacing[2], borderBottomWidth: i < meals.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="caption" color="textSubtle" style={{ flex: 1, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>{t(`nutrition.screen.meal.${m.type}`)}</Text>
              {m.count > 0 ? <Text variant="caption" color="textSubtle">{Math.round(m.kcal)} kcal</Text> : null}
            </View>
            {m.count > 0 ? (
              <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                {m.entries.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => router.push({ pathname: '/nutrition/meal/[id]', params: { id: e.id } })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.6 : 1 })}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={MEAL_ICON[m.type] ?? 'bowl'} size={19} color={colors.text} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{e.description || t(`nutrition.screen.meal.${m.type}`)}</Text>
                      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }} numberOfLines={1}>P {Math.round(e.proteinG ?? 0)} · G {Math.round(e.carbG ?? 0)} · L {Math.round(e.fatG ?? 0)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="body" style={{ fontWeight: '700' }}>{Math.round(e.kcal)}</Text>
                      <Text variant="caption" color="textSubtle">kcal</Text>
                    </View>
                    <Pressable
                      onPress={() => deleteEntry.mutate(e.id)}
                      disabled={deleteEntry.isPending && deleteEntry.variables === e.id}
                      hitSlop={8}
                      style={{ opacity: deleteEntry.isPending && deleteEntry.variables === e.id ? 0.4 : 1 }}
                    >
                      <Icon name="trash" size={18} color={colors.textSubtle} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><Icon name={MEAL_ICON[m.type] ?? 'bowl'} size={19} color={colors.text} /></View>
                <Text variant="caption" color="textSubtle" style={{ flex: 1 }}>{t('nutrition.screen.meals.toPlan')}</Text>
                <Text variant="caption" color="textSubtle">{t('nutrition.screen.meals.pending')}</Text>
              </View>
            )}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Button label={t('nutrition.screen.meals.searchFood')} onPress={() => router.push('/nutrition/food/search')} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t('nutrition.screen.meals.manualEntry')} variant="secondary" onPress={() => router.push({ pathname: '/nutrition/meal/new', params: { date: dayKey(selectedDate) } })} fullWidth />
          </View>
        </View>
      </Card>
    ),
    score: (
      <Card>
        <SectionTitle>{t('nutrition.screen.score.title')}</SectionTitle>
        <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
          <ProgressRing value={hasData ? score.value : 0} size={96} thickness={9} color={colors.accentData} centerLabel={hasData ? `${score.value}` : '—'} caption="/ 100" />
          <View style={{ flex: 1 }}>
            <Text variant="body">{hasData ? (score.value >= 80 ? t('nutrition.screen.score.quality.excellent') : score.value >= 60 ? t('nutrition.screen.score.quality.good') : t('nutrition.screen.score.quality.needsImprovement')) : t('nutrition.screen.score.quality.noData')}</Text>
            <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2], lineHeight: 18 }}>{t('nutrition.screen.score.basedOn')}</Text>
          </View>
        </View>
      </Card>
    ),
    weight: (
      <Card>
        <SectionTitle right={<Pressable onPress={() => router.push('/nutrition/weight')}><Text variant="caption" color="primary">{t('nutrition.screen.weight.viewLink')}</Text></Pressable>}>{t('nutrition.screen.weight.title')}</SectionTitle>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <Balance label={t('nutrition.screen.weight.weight')} value={latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—'} />
          <Balance label={t('nutrition.screen.weight.bodyFat')} value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
          <Balance label={t('nutrition.screen.weight.muscleMass')} value={muscleMass != null ? `${muscleMass.toFixed(1)} kg` : '—'} />
          <Balance
            label={t('nutrition.screen.weight.weeklyChange')}
            value={weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg` : '—'}
            color={weightDelta != null && weightDelta <= 0 ? colors.accentData : undefined}
          />
        </View>
      </Card>
    ),
    impact: explanation ? (
      <Card>
        <SectionTitle>{t('nutrition.screen.impact.title')}</SectionTitle>
        <Text variant="body" color="textMuted">{t(explanation.observation.key, explanation.observation.params)}</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[1] }}>{t(explanation.analysis.key, explanation.analysis.params)}</Text>
        <Text variant="body" style={{ marginTop: spacing[2] }}>{t(explanation.action.key, explanation.action.params)}</Text>
      </Card>
    ) : null,
    trend: kcalSeries.length >= 2 ? (
      <Card>
        <SectionTitle right={<Text variant="caption" color="textSubtle">{t('nutrition.screen.trend.days30')}</Text>}>{t('nutrition.screen.trend.title')}</SectionTitle>
        <Sparkline values={kcalSeries} width={300} height={80} color={colors.primary} />
      </Card>
    ) : null,
    goals: (
      <Card>
        <SectionTitle right={
          <Pressable onPress={() => setPreference('nutritionGoals', undefined)} disabled={!customized}>
            <Text variant="caption" color={customized ? 'primary' : 'textSubtle'}>{customized ? t('nutrition.screen.goals.resetAuto') : t('nutrition.screen.goals.auto')}</Text>
          </Pressable>
        }>{t('nutrition.screen.goals.title')}</SectionTitle>
        <GoalBar label={t('nutrition.screen.goals.caloriesLabel')} current={totals.kcal} target={kcalTarget} unit="kcal" color={colors.info} />
        <GoalBar label={t('nutrition.screen.goals.proteinLabel')} current={totals.proteinG} target={goals.proteinG} unit="g" color={colors.accentData} />
        <GoalBar label={t('nutrition.screen.goals.hydrationLabel')} current={totals.hydrationMl / 1000} target={goals.hydrationMl / 1000} unit="L" color={colors.accentEndurance} />

        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[4] }}>{customized ? t('nutrition.screen.goals.adjustHintPerso') : t('nutrition.screen.goals.adjustHintAuto')}</Text>
        <StepperRow
          label={t('nutrition.screen.goals.caloriesLabel')}
          rawValue={Math.round(goals.kcal)}
          format={(v) => `${Math.round(v)} kcal`}
          onMinus={() => adjust({ kcal: -50 })}
          onPlus={() => adjust({ kcal: 50 })}
          onSet={(v) => setExact({ kcal: v })}
        />
        <StepperRow
          label={t('nutrition.screen.goals.proteinLabel')}
          rawValue={Math.round(goals.proteinG)}
          format={(v) => `${Math.round(v)} g`}
          onMinus={() => adjust({ proteinG: -5 })}
          onPlus={() => adjust({ proteinG: 5 })}
          onSet={(v) => setExact({ proteinG: v })}
        />
        <StepperRow
          label={t('nutrition.screen.goals.hydrationLabel')}
          rawValue={Number((goals.hydrationMl / 1000).toFixed(2))}
          format={(v) => `${v.toFixed(2)} L`}
          onMinus={() => adjust({ hydrationMl: -250 })}
          onPlus={() => adjust({ hydrationMl: 250 })}
          onSet={(v) => setExact({ hydrationMl: v * 1000 })}
        />

        <CalorieCalculatorForm />
      </Card>
    ),
    micronutrients: (
      <Card>
        <SectionTitle>{t('nutrition.screen.micronutrients.title')}</SectionTitle>
        <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>{t('nutrition.screen.micronutrients.description')}</Text>
      </Card>
    ),
    comprendre: <ComprendreCard pillars={['nutrition']} />,
  };
```

- [ ] **Step 8: Verify types compile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Lint**

Run: `npx eslint apps/mobile/src/features/nutrition --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 10: Manual check**

Same as Task 3 Step 10, on the Nutrition hub — hide "Micronutriments", confirm it disappears; re-show it.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/features/nutrition/nutritionCards.ts apps/mobile/app/'(modal)'/nutrition-customize.tsx apps/mobile/src/features/nutrition/NutritionScreen.tsx apps/mobile/src/i18n/locales/fr.json apps/mobile/src/i18n/locales/en.json apps/mobile/src/i18n/locales/es.json apps/mobile/src/i18n/locales/pt.json apps/mobile/src/i18n/locales/de.json
git commit -m "Add Nutrition hub customization"
```

---

### Task 5: Sommeil hub customization

**Files:**
- Create: `apps/mobile/src/features/sommeil/sommeilCards.ts`
- Create: `apps/mobile/app/(modal)/sommeil-customize.tsx`
- Modify: `apps/mobile/src/features/sommeil/SommeilScreen.tsx`
- Modify: `apps/mobile/src/i18n/locales/fr.json`, `en.json`, `es.json`, `pt.json`, `de.json`

**Interfaces:**
- Consumes: `HubCardDef`, `resolveCardOrder` (Task 1); `HubCustomizeScreen` (Task 2).
- Produces: `SOMMEIL_CARD_DEFS: HubCardDef[]`, `resolveSommeilCardOrder(saved): DashboardCardPref[]`.

- [ ] **Step 1: Create the card defs**

Create `apps/mobile/src/features/sommeil/sommeilCards.ts`:

```ts
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

/**
 * Every customizable Sommeil card, in default order. The header, day
 * navigation, and the main sleep-score summary (ring + stress/bien-être row)
 * are fixed — the screen's identity, not a widget.
 */
export const SOMMEIL_CARD_DEFS: HubCardDef[] = [
  { id: 'last7Nights', label: '7 dernières nuits' },
  { id: 'phases', label: 'Phases de sommeil' },
  { id: 'bedtime', label: 'Coucher optimal' },
  { id: 'advice', label: 'Conseil du jour' },
  { id: 'detail', label: 'Détail du score' },
  { id: 'debtTrend', label: 'Évolution de la dette' },
  { id: 'prediction', label: 'Prévision de demain' },
  { id: 'signals', label: 'Signaux' },
  { id: 'circadian', label: 'Rythme circadien' },
  { id: 'tools', label: 'Outils de récupération' },
  { id: 'comprendre', label: 'Comprendre' },
  { id: 'objectifs', label: 'Objectifs' },
];

export function resolveSommeilCardOrder(saved: DashboardCardPref[] | undefined): DashboardCardPref[] {
  return resolveCardOrder(SOMMEIL_CARD_DEFS, saved);
}
```

- [ ] **Step 2: Add the customize route**

Create `apps/mobile/app/(modal)/sommeil-customize.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { HubCustomizeScreen } from '@/features/hubCustomize/HubCustomizeScreen';
import { SOMMEIL_CARD_DEFS } from '@/features/sommeil/sommeilCards';

export default function SommeilCustomize(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <HubCustomizeScreen
      title={t('sommeil.customize.title')}
      subtitle={t('common.hubCustomize.subtitle')}
      cardDefs={SOMMEIL_CARD_DEFS}
      prefKey="sommeilCards"
      backLabel={t('common.back')}
    />
  );
}
```

- [ ] **Step 3: Add the i18n title key (5 locales)**

Add `"customize": { "title": "..." }` under `"sommeil"` in each locale file:

`fr.json`: `"Personnaliser le Sommeil"`
`en.json`: `"Customize Sleep"`
`es.json`: `"Personalizar Sueño"`
`pt.json`: `"Personalizar Sono"`
`de.json`: `"Schlaf anpassen"`

Verify JSON validity the same way as Task 2 Step 4.

- [ ] **Step 4: Import the new defs in SommeilScreen.tsx**

`usePreferences` is already imported and destructured as `const { preferences } = usePreferences();` — no import change needed there. Add:

```ts
import { SOMMEIL_CARD_DEFS, resolveSommeilCardOrder } from './sommeilCards';
```

- [ ] **Step 5: Compute the card order**

Inside `SommeilScreen()`, right after the existing `const { preferences } = usePreferences();` line, add:

```ts
  const cardOrder = useMemo(() => resolveSommeilCardOrder(preferences.sommeilCards), [preferences.sommeilCards]);
```

- [ ] **Step 6: Add the tune button to the header**

Replace:

```tsx
        <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, position: 'absolute', right: 0, top: 0 })}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" size={16} color={colors.text} />
          </View>
        </Pressable>
```

with:

```tsx
        <View style={{ position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: spacing[2] }}>
          <Pressable onPress={() => router.push('/sommeil-customize')} accessibilityLabel={t('sommeil.customize.title')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="tune" size={16} color={colors.text} />
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/search')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="search" size={16} color={colors.text} />
            </View>
          </Pressable>
        </View>
```

- [ ] **Step 7: Build cardNodes and replace the customizable section**

Replace everything from the `{/* 3. 7 dernières nuits */}` comment through the `<ObjectifsCard types={['health']} />` line (i.e. everything between the Stress/Bien-être `QuickStat` row and the closing `</>`) — currently:

```tsx
          {/* 3. 7 dernières nuits */}
          {chrono.length > 0 && (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text variant="heading">{t('sommeil.screen.last7Nights.title')}</Text>
                {avg !== undefined && (
                  <Text variant="caption" color="textMuted">
                    {t('sommeil.screen.last7Nights.average', { avg: avg.toFixed(1) })}
                  </Text>
                )}
              </View>
              <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
                {tappedNight
                  ? t('sommeil.screen.last7Nights.tappedDetail', { day: fullWeekdayDate(tappedNight.date), hours: fmtHM(tappedNight.hours * 60) })
                  : t('sommeil.screen.last7Nights.tapHint')}
              </Text>
              <View
                style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2], height: 92, marginTop: spacing[3] }}
              >
                {chrono.map((n) => {
                  const selected = tappedNight?.date === n.date;
                  return (
                    <Pressable
                      key={n.date}
                      onPress={() => setTappedNight(selected ? null : n)}
                      hitSlop={4}
                      style={{ flex: 1, alignItems: 'center', gap: spacing[1] }}
                    >
                      <View
                        style={{
                          width: '70%',
                          height: Math.max(6, (n.hours / chronoMax) * 72),
                          borderRadius: 4,
                          backgroundColor: colors[BAND_TONE[sleepBand(n.score)]],
                          borderWidth: selected ? 2 : 0,
                          borderColor: colors.text,
                        }}
                      />
                      <Text variant="caption" color={selected ? 'text' : 'textSubtle'} style={selected ? { fontWeight: '700' } : undefined}>
                        {weekdayLetter(n.date)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}

          {/* 4. Phases de sommeil */}
          {lastSession && <SleepPhaseCarousel session={lastSession} timeFormat={preferences.timeFormat} />}

          {/* 5. Coucher optimal */}
          {circadian.value && (
            <Card>
              <Text variant="caption" color="textMuted">
                {t('sommeil.screen.bedtime.title')}
              </Text>
              <Text variant="display" color="primary" style={{ marginTop: spacing[1] }}>
                {bedtimeWindow(circadian.value.idealBedtime, preferences.timeFormat)}
              </Text>
              <Text variant="caption" color="textSubtle">
                {t('sommeil.screen.bedtime.estimate', { chronotype: circadian.value.chronotype })}
              </Text>
            </Card>
          )}

          {/* 6. Conseil du jour */}
          {coaching && (
            <Card>
              <Text variant="heading">{t('sommeil.screen.advice.title')}</Text>
              <Text variant="caption" color="textMuted">
                {t(coaching.observation.key, coaching.observation.params)}
              </Text>
              <Text variant="caption" color="textMuted">
                {t(coaching.analysis.key, coaching.analysis.params)}
              </Text>
              <Text variant="body" style={{ marginTop: spacing[1] }}>
                {t(coaching.action.key, coaching.action.params)}
              </Text>
            </Card>
          )}

          {/* 7. Détail — plus analytique, repoussé en fin */}
          <Card>
            <Text variant="heading">{t('sommeil.screen.detail.title')}</Text>
            <Text variant="caption" color="textSubtle">
              {t('sommeil.screen.detail.description')}
            </Text>
            <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
              {score.components.map((c) => {
                const tone = c.value !== null ? BAND_TONE[sleepBand(c.value)] : undefined;
                const barColor = tone ? colors[tone] : colors.border;
                return (
                  <View key={c.key} style={{ gap: spacing[1] }}>
                    <View
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                    >
                      <Text variant="body">{c.label}</Text>
                      <Text variant="subtitle" color={c.value !== null ? 'text' : 'textSubtle'}>
                        {c.value !== null ? `${c.value}` : '—'}
                      </Text>
                    </View>
                    <ScoreBar value={c.value} color={barColor} track={colors.surfaceElevated} />
                    <Text variant="caption" color="textSubtle">
                      {c.detail}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {score.components.find((c) => c.key === 'debt')?.value !== null && debtStats ? (
            <Card>
              <Text variant="heading">{t('sommeil.screen.debtTrend.title')}</Text>
              <Text variant="caption" color="textSubtle">{t('sommeil.screen.debtTrend.subtitle')}</Text>
              <View style={{ alignItems: 'center', marginTop: spacing[3] }}>
                <Sparkline values={debtSeries} width={300} height={70} color={colors.warning} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
                <DebtStat label={t('sommeil.screen.debtTrend.avg')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.avg })} />
                <DebtStat label={t('sommeil.screen.debtTrend.max')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.max })} />
                <DebtStat label={t('sommeil.screen.debtTrend.min')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.min })} />
              </View>
            </Card>
          ) : null}

          {prediction.value && prediction.explanation && (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Text variant="heading">{t('sommeil.screen.prediction.title')}</Text>
                <Badge
                  label={t('sommeil.screen.prediction.fatigueBadge', { risk: prediction.value.fatigueRisk })}
                  tone={RISK_TONE[prediction.value.fatigueRisk]}
                />
              </View>
              <Text variant="subtitle" color="primary" style={{ marginTop: spacing[1] }}>
                {t('sommeil.screen.prediction.energy', { score: prediction.value.energyScore })}
              </Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
                {t(prediction.explanation.analysis.key, prediction.explanation.analysis.params)}
              </Text>
              <Text variant="body" style={{ marginTop: spacing[1] }}>
                {t(prediction.explanation.action.key, prediction.explanation.action.params)}
              </Text>
            </Card>
          )}

          {signals.length > 0 && (
            <Card>
              <Text variant="heading">{t('sommeil.screen.signals.title')}</Text>
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4], marginTop: spacing[2] }}
              >
                {signals.map((s) => (
                  <View key={s.label}>
                    <Text variant="caption" color="textSubtle">
                      {s.label}
                    </Text>
                    <Text variant="subtitle">{s.value}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* 8. Rythme circadien */}
          <Card>
            <Text variant="heading">{t('sommeil.screen.circadian.title')}</Text>
            <Text variant="caption" color="textMuted">
              {t('sommeil.screen.circadian.description')}
            </Text>
            <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
              <Button
                label={t('sommeil.screen.circadian.cta')}
                variant="gradient"
                onPress={() => router.push('/sommeil/circadian')}
              />
            </View>
          </Card>

          {/* 9. Outils de récupération */}
          <Text variant="heading" style={{ marginTop: spacing[2] }}>
            {t('sommeil.screen.tools.title')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
            <ToolTile icon={<Icon name="windy" size={16} color={colors.text} />} label={t('sommeil.screen.tools.breathing')} path="/sommeil/breathing" />
            <ToolTile icon={<Icon name="lungs" size={16} color={colors.text} />} label={t('sommeil.screen.tools.stomachVacuum')} path="/sport/stomach-vacuum" />
            <ToolTile icon={<Icon name="puzzle" size={16} color={colors.text} />} label={t('sommeil.screen.tools.neuroRecovery')} path="/sommeil/neuro-recovery" />
            <ToolTile icon={<Icon name="headphones" size={16} color={colors.text} />} label={t('sommeil.screen.tools.sounds')} path="/sommeil/sound" />
          </View>

          {/* 10. Comprendre + Objectifs */}
          <ComprendreCard pillars={['sleep', 'recovery', 'understanding']} />
          <ObjectifsCard types={['health']} />
```

with:

```tsx
          {cardOrder.filter((c) => c.visible).map((c) => (
            <React.Fragment key={c.id}>{cardNodes[c.id]}</React.Fragment>
          ))}
```

Then, right after the `signals` array and just above the `return (` statement, add the `cardNodes` map (each value exactly the JSX block it replaces above, unchanged, keeping its own existing conditional):

```tsx
  const cardNodes: Record<string, React.ReactNode> = {
    last7Nights: chrono.length > 0 ? (
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="heading">{t('sommeil.screen.last7Nights.title')}</Text>
          {avg !== undefined && (
            <Text variant="caption" color="textMuted">
              {t('sommeil.screen.last7Nights.average', { avg: avg.toFixed(1) })}
            </Text>
          )}
        </View>
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {tappedNight
            ? t('sommeil.screen.last7Nights.tappedDetail', { day: fullWeekdayDate(tappedNight.date), hours: fmtHM(tappedNight.hours * 60) })
            : t('sommeil.screen.last7Nights.tapHint')}
        </Text>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2], height: 92, marginTop: spacing[3] }}
        >
          {chrono.map((n) => {
            const selected = tappedNight?.date === n.date;
            return (
              <Pressable
                key={n.date}
                onPress={() => setTappedNight(selected ? null : n)}
                hitSlop={4}
                style={{ flex: 1, alignItems: 'center', gap: spacing[1] }}
              >
                <View
                  style={{
                    width: '70%',
                    height: Math.max(6, (n.hours / chronoMax) * 72),
                    borderRadius: 4,
                    backgroundColor: colors[BAND_TONE[sleepBand(n.score)]],
                    borderWidth: selected ? 2 : 0,
                    borderColor: colors.text,
                  }}
                />
                <Text variant="caption" color={selected ? 'text' : 'textSubtle'} style={selected ? { fontWeight: '700' } : undefined}>
                  {weekdayLetter(n.date)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    ) : null,
    phases: lastSession ? <SleepPhaseCarousel session={lastSession} timeFormat={preferences.timeFormat} /> : null,
    bedtime: circadian.value ? (
      <Card>
        <Text variant="caption" color="textMuted">
          {t('sommeil.screen.bedtime.title')}
        </Text>
        <Text variant="display" color="primary" style={{ marginTop: spacing[1] }}>
          {bedtimeWindow(circadian.value.idealBedtime, preferences.timeFormat)}
        </Text>
        <Text variant="caption" color="textSubtle">
          {t('sommeil.screen.bedtime.estimate', { chronotype: circadian.value.chronotype })}
        </Text>
      </Card>
    ) : null,
    advice: coaching ? (
      <Card>
        <Text variant="heading">{t('sommeil.screen.advice.title')}</Text>
        <Text variant="caption" color="textMuted">
          {t(coaching.observation.key, coaching.observation.params)}
        </Text>
        <Text variant="caption" color="textMuted">
          {t(coaching.analysis.key, coaching.analysis.params)}
        </Text>
        <Text variant="body" style={{ marginTop: spacing[1] }}>
          {t(coaching.action.key, coaching.action.params)}
        </Text>
      </Card>
    ) : null,
    detail: (
      <Card>
        <Text variant="heading">{t('sommeil.screen.detail.title')}</Text>
        <Text variant="caption" color="textSubtle">
          {t('sommeil.screen.detail.description')}
        </Text>
        <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
          {score.components.map((c) => {
            const tone = c.value !== null ? BAND_TONE[sleepBand(c.value)] : undefined;
            const barColor = tone ? colors[tone] : colors.border;
            return (
              <View key={c.key} style={{ gap: spacing[1] }}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                >
                  <Text variant="body">{c.label}</Text>
                  <Text variant="subtitle" color={c.value !== null ? 'text' : 'textSubtle'}>
                    {c.value !== null ? `${c.value}` : '—'}
                  </Text>
                </View>
                <ScoreBar value={c.value} color={barColor} track={colors.surfaceElevated} />
                <Text variant="caption" color="textSubtle">
                  {c.detail}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    ),
    debtTrend: score.components.find((c) => c.key === 'debt')?.value !== null && debtStats ? (
      <Card>
        <Text variant="heading">{t('sommeil.screen.debtTrend.title')}</Text>
        <Text variant="caption" color="textSubtle">{t('sommeil.screen.debtTrend.subtitle')}</Text>
        <View style={{ alignItems: 'center', marginTop: spacing[3] }}>
          <Sparkline values={debtSeries} width={300} height={70} color={colors.warning} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
          <DebtStat label={t('sommeil.screen.debtTrend.avg')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.avg })} />
          <DebtStat label={t('sommeil.screen.debtTrend.max')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.max })} />
          <DebtStat label={t('sommeil.screen.debtTrend.min')} value={t('sommeil.screen.debtTrend.hoursValue', { value: debtStats.min })} />
        </View>
      </Card>
    ) : null,
    prediction: prediction.value && prediction.explanation ? (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text variant="heading">{t('sommeil.screen.prediction.title')}</Text>
          <Badge
            label={t('sommeil.screen.prediction.fatigueBadge', { risk: prediction.value.fatigueRisk })}
            tone={RISK_TONE[prediction.value.fatigueRisk]}
          />
        </View>
        <Text variant="subtitle" color="primary" style={{ marginTop: spacing[1] }}>
          {t('sommeil.screen.prediction.energy', { score: prediction.value.energyScore })}
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {t(prediction.explanation.analysis.key, prediction.explanation.analysis.params)}
        </Text>
        <Text variant="body" style={{ marginTop: spacing[1] }}>
          {t(prediction.explanation.action.key, prediction.explanation.action.params)}
        </Text>
      </Card>
    ) : null,
    signals: signals.length > 0 ? (
      <Card>
        <Text variant="heading">{t('sommeil.screen.signals.title')}</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4], marginTop: spacing[2] }}
        >
          {signals.map((s) => (
            <View key={s.label}>
              <Text variant="caption" color="textSubtle">
                {s.label}
              </Text>
              <Text variant="subtitle">{s.value}</Text>
            </View>
          ))}
        </View>
      </Card>
    ) : null,
    circadian: (
      <Card>
        <Text variant="heading">{t('sommeil.screen.circadian.title')}</Text>
        <Text variant="caption" color="textMuted">
          {t('sommeil.screen.circadian.description')}
        </Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button
            label={t('sommeil.screen.circadian.cta')}
            variant="gradient"
            onPress={() => router.push('/sommeil/circadian')}
          />
        </View>
      </Card>
    ),
    tools: (
      <>
        <Text variant="heading" style={{ marginTop: spacing[2] }}>
          {t('sommeil.screen.tools.title')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
          <ToolTile icon={<Icon name="windy" size={16} color={colors.text} />} label={t('sommeil.screen.tools.breathing')} path="/sommeil/breathing" />
          <ToolTile icon={<Icon name="lungs" size={16} color={colors.text} />} label={t('sommeil.screen.tools.stomachVacuum')} path="/sport/stomach-vacuum" />
          <ToolTile icon={<Icon name="puzzle" size={16} color={colors.text} />} label={t('sommeil.screen.tools.neuroRecovery')} path="/sommeil/neuro-recovery" />
          <ToolTile icon={<Icon name="headphones" size={16} color={colors.text} />} label={t('sommeil.screen.tools.sounds')} path="/sommeil/sound" />
        </View>
      </>
    ),
    comprendre: <ComprendreCard pillars={['sleep', 'recovery', 'understanding']} />,
    objectifs: <ObjectifsCard types={['health']} />,
  };
```

- [ ] **Step 8: Verify types compile**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Lint**

Run: `npx eslint apps/mobile/src/features/sommeil --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 10: Manual check**

Same as Task 3 Step 10, on the Sommeil hub — hide "Outils de récupération", confirm it disappears; re-show it.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/features/sommeil/sommeilCards.ts apps/mobile/app/'(modal)'/sommeil-customize.tsx apps/mobile/src/features/sommeil/SommeilScreen.tsx apps/mobile/src/i18n/locales/fr.json apps/mobile/src/i18n/locales/en.json apps/mobile/src/i18n/locales/es.json apps/mobile/src/i18n/locales/pt.json apps/mobile/src/i18n/locales/de.json
git commit -m "Add Sommeil hub customization"
```

---

### Task 6: Route typegen + full regression

**Files:** none created/modified directly — this task regenerates `apps/mobile/.expo/types/router.d.ts` and runs the full verification suite.

- [ ] **Step 1: Regenerate expo-router's typed routes**

The three new routes (`/sport-customize`, `/nutrition-customize`, `/sommeil-customize`) must exist in `apps/mobile/.expo/types/router.d.ts` before `router.push('/sport-customize')` etc. typecheck (`npx tsc --noEmit` treats an unknown route string as a type error). This file is not reliably regenerated by `npx expo export`; the reliable path observed earlier in this session is starting the dev server briefly:

```bash
cd apps/mobile
EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_ANON_KEY= nohup npx expo start --web --port 8199 > /tmp/expo-typegen.log 2>&1 &
```

Wait for `Waiting on http://localhost:8199` in the log, then confirm the three routes are present:

```bash
grep -c "sport-customize\|nutrition-customize\|sommeil-customize" apps/mobile/.expo/types/router.d.ts
```

Expected: a non-zero count for each route name. Then stop the dev server:

```bash
pkill -f "expo start --web --port 8199"
```

- [ ] **Step 2: Full typecheck**

Run:
```bash
cd apps/mobile && npx tsc --noEmit -p tsconfig.json
```
Expected: no errors — this is the step that actually exercises the regenerated route types against every `router.push('/sport-customize')`-style call added in Tasks 3-5.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all pre-existing tests still pass (no test file references any of the touched files — this plan added no new pure-logic function that needs its own test beyond what Task 1's mechanical extraction already covers by construction).

- [ ] **Step 4: Full lint**

Run:
```bash
npx eslint apps/mobile/src/features/hubCustomize apps/mobile/src/features/dashboard apps/mobile/src/features/sport apps/mobile/src/features/nutrition apps/mobile/src/features/sommeil apps/mobile/src/lib/preferences.tsx apps/mobile/src/lib/hubCards.ts --ext .ts,.tsx
```
Expected: no errors.

- [ ] **Step 5: Final manual pass**

Open each of the four hubs (Dashboard, Sport, Nutrition, Sommeil) in turn: tap the tune icon, drag one card to a new position, hide a different card, go back, confirm both changes show; reopen the customize screen, confirm the new order/visibility persisted.

- [ ] **Step 6: Commit (only if Step 1's typegen touched tracked files)**

```bash
git status --porcelain
```
If `apps/mobile/.expo/types/router.d.ts` is untracked or gitignored, there is nothing to commit for this task. If it is tracked and shows as modified, commit it:
```bash
git add apps/mobile/.expo/types/router.d.ts
git commit -m "Regenerate expo-router types for the new hub-customize routes"
```
