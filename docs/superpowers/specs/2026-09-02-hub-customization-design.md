# Hub Customization (Sport / Nutrition / Sommeil) — Design

**Status:** Approved for planning
**Requested by:** TestFlight feedback — "Ajouter la personnalisation dans tout les hub pour afficher que ce qui nous intéresse."

## 1. Problem

Dashboard already lets a user show/hide and reorder its customizable cards (`DashboardCustomizeScreen.tsx`, `dashboardCards.ts`, `Preferences.dashboardCards`) — a "tune" icon in the header opens a drag-to-reorder, toggle-to-hide list. Sport, Nutrition and Sommeil have no equivalent: every section always shows, for every user, in a fixed order. A tester asked for the same "only show what interests me" control on every hub.

**Scope (confirmed with the user):** Sport, Nutrition, Sommeil. Profil is a navigation menu (account, settings, links), not data widgets — "show/hide" doesn't apply there the same way, and it's out of scope for this feature.

## 2. Goals

- Sport, Nutrition and Sommeil each get their own show/hide + reorder customization, using the exact same interaction Dashboard already has (drag handle, toggle, same visual language).
- No duplicated screen code — one reusable customize UI serves all four hubs (Dashboard included, migrated onto it).
- Each hub keeps a small "identity" block that is never customizable (the screen's header/summary — same principle Dashboard already applies to its own header/"Focus du jour").

## Non-goals

- Profil customization (explicitly excluded above).
- Per-card configuration beyond show/hide + order (no per-card size, no custom card creation).
- Syncing customization across devices — this reuses the existing `Preferences` device-local storage (`secureStorage`, one JSON blob), same as `dashboardCards` today. Cross-device sync is a pre-existing limitation of the whole `Preferences` system, not something this feature changes.
- Translating card labels. `DASHBOARD_CARD_DEFS`'s `label` field is already hardcoded French (not run through `t()`) — the new per-hub defs files follow the same existing convention. Localizing card labels is a separate, unrelated improvement.

## 3. Data model

`apps/mobile/src/lib/preferences.tsx` — `Preferences` gains three fields, identical shape to the existing `dashboardCards`:

```ts
export interface Preferences {
  // ...existing fields...
  dashboardCards?: DashboardCardPref[];
  sportCards?: DashboardCardPref[];
  nutritionCards?: DashboardCardPref[];
  sommeilCards?: DashboardCardPref[];
}
```

`DashboardCardPref` (`{ id: string; visible: boolean }`) is reused as-is — it's already generic, nothing about its shape is Dashboard-specific despite the name. No rename: renaming it would touch every existing Dashboard call site for no functional gain.

## 4. Shared resolve helper

`resolveDashboardCardOrder` (in `dashboardCards.ts`) merges a saved preference with the current card set: keeps saved order/visibility, appends any card added since as visible, drops ids that no longer exist. This logic is identical for every hub — generalize it once:

New file `apps/mobile/src/lib/hubCards.ts`:

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
 * Shared by every hub's customize screen — see dashboardCards.ts,
 * sportCards.ts, nutritionCards.ts, sommeilCards.ts for the per-hub
 * defs that feed this.
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

`dashboardCards.ts`'s `resolveDashboardCardOrder` becomes a one-line wrapper (`(saved) => resolveCardOrder(DASHBOARD_CARD_DEFS, saved)`) so `DashboardScreen.tsx`'s existing call site (`resolveDashboardCardOrder(preferences.dashboardCards)`) needs no change.

Each new hub gets its own thin defs file mirroring `dashboardCards.ts`'s shape:

**`apps/mobile/src/features/sport/sportCards.ts`:**
```ts
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

export const SPORT_CARD_DEFS: HubCardDef[] = [
  { id: 'recent', label: '3 dernières activités' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'sections', label: 'Sections' },
  { id: 'comprendre', label: 'Comprendre' },
  { id: 'objectifs', label: 'Objectifs' },
];

export const resolveSportCardOrder = (saved: DashboardCardPref[] | undefined): DashboardCardPref[] =>
  resolveCardOrder(SPORT_CARD_DEFS, saved);
```

**`apps/mobile/src/features/nutrition/nutritionCards.ts`:**
```ts
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

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

export const resolveNutritionCardOrder = (saved: DashboardCardPref[] | undefined): DashboardCardPref[] =>
  resolveCardOrder(NUTRITION_CARD_DEFS, saved);
```

**`apps/mobile/src/features/sommeil/sommeilCards.ts`:**
```ts
import type { HubCardDef } from '@/lib/hubCards';
import { resolveCardOrder } from '@/lib/hubCards';
import type { DashboardCardPref } from '@/lib/preferences';

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

export const resolveSommeilCardOrder = (saved: DashboardCardPref[] | undefined): DashboardCardPref[] =>
  resolveCardOrder(SOMMEIL_CARD_DEFS, saved);
```

## 5. Reusable customize screen

`DashboardCustomizeScreen.tsx`'s body (drag list + toggle, `react-native-draggable-flatlist`) is not Dashboard-specific — it only reads `LABEL_BY_ID`/`cardDefs` and one preference key. Replace it with one generic component and delete the Dashboard-only one.

New `apps/mobile/src/features/hubCustomize/HubCustomizeScreen.tsx`:

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

`Preferences[prefKey] as DashboardCardPref[] | undefined` / the `setPreference` cast are needed because `prefKey` is a runtime string within a known union, not a type TypeScript can narrow automatically from a generic prop — every value behind that union member has the identical `DashboardCardPref[] | undefined` type, so the cast is sound, not a type-safety hole.

`apps/mobile/src/features/dashboard/DashboardCustomizeScreen.tsx` is deleted. The four route files become (or become for the first time) thin wrappers:

**`app/(modal)/dashboard-customize.tsx`** (modified):
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

**`app/(modal)/sport-customize.tsx`**, **`nutrition-customize.tsx`**, **`sommeil-customize.tsx`** (new, same shape, each importing its own `<HUB>_CARD_DEFS` and `t('sport.customize.title')` / `t('nutrition.customize.title')` / `t('sommeil.customize.title')`). None of the three needs its `resolve<Hub>CardOrder` wrapper for this route — that wrapper exists for the hub's own main screen (§4/§7); the customize screen calls `resolveCardOrder` directly with `cardDefs` (§5).

`common.hubCustomize.subtitle` is a new shared i18n key carrying the exact same hint text `dashboard.customize.subtitle` already has ("Reste appuyé sur ☰ pour déplacer une card ; l'interrupteur l'affiche ou la masque.") — the hint isn't Dashboard-specific wording, so one shared key serves all four screens instead of four near-duplicate ones. `dashboard.customize.subtitle` itself is left in place (unused after this change, harmless) rather than deleted, to avoid touching unrelated translation-file history for a one-line cleanup.

## 6. Entry point on each hub

Sport, Nutrition and Sommeil each already render a circular icon button in their header (top-right) for search — a plain `Pressable` wrapping a 38×38 rounded `View` with an `Icon`, duplicated inline in each screen (not a shared component). Add a second, identical button right next to it using `name="tune"` (the same icon Dashboard's customize entry point already uses), navigating to that hub's new customize route:

- Sport (`SportScreen.tsx`): next to the existing search-icon `Pressable` around line 218 → `router.push('/sport-customize')`.
- Nutrition (`NutritionScreen.tsx`): next to its existing calendar/search icon pair around line 233 → `router.push('/nutrition-customize')`.
- Sommeil (`SommeilScreen.tsx`): next to its existing search-icon `Pressable` around line 469 → `router.push('/sommeil-customize')`.

## 7. Hub screens: fixed vs. customizable

Each screen's "identity" block (header, day navigation, and its main always-visible summary) stays exactly as it renders today — untouched, no `cardNodes` entry. Everything else becomes one entry in a `cardNodes: Record<string, React.ReactNode>` map, rendered via:

```tsx
{resolve<Hub>CardOrder(preferences.<hub>Cards).filter((c) => c.visible).map((c) => (
  <React.Fragment key={c.id}>{cardNodes[c.id]}</React.Fragment>
))}
```

(Same pattern `DashboardScreen.tsx` already uses — see its `cardNodes` map and the `.filter((c) => c.visible)` render loop.)

**Sport** — fixed: header, `DayNav`, the 4-page `Carousel` (séance/score/corps/muscles, kept together as one unit, same way Dashboard keeps its own "Focus du jour" carousel-equivalent fixed). Customizable, `cardNodes` keys matching `SPORT_CARD_DEFS`:
- `recent`: the "3 dernières activités" heading + Card/EmptyState block.
- `week`: the "Cette semaine" heading + StatTile grid.
- `sections`: the "Sections" heading + `NAV.map(...)` `HubRow` list.
- `comprendre`: `<ComprendreCard pillars={['performance']} />`.
- `objectifs`: `<ObjectifsCard types={['performance', 'strength', 'endurance']} />`.

**Nutrition** — fixed: header, `DayNav`, the kcal ring + balance Card (the screen's first Card, "Calories aujourd'hui"-equivalent). Customizable, keys matching `NUTRITION_CARD_DEFS`:
- `macros`: the macros rings Card.
- `hydration`: the hydration Card.
- `meals`: the "Repas" Card (meal-type sections + add buttons).
- `score`: the "Nutrition Score" Card.
- `weight`: the "Poids & composition" Card.
- `impact`: the conditional "Impact" Card (`explanation ? ... : null` stays inside this node).
- `trend`: the conditional "Tendances" Sparkline Card (`kcalSeries.length >= 2 ? ... : null` stays inside this node).
- `goals`: the "Objectifs" Card (goal bars, steppers, `CalorieCalculatorForm`).
- `micronutrients`: the "Micronutriments" Card.
- `comprendre`: `<ComprendreCard pillars={['nutrition']} />`.

**Sommeil** — fixed: header, `DayNav`, the loading/empty-state branch, and (once `hasData`) the "Score de sommeil" main Card plus the Stress/Bien-être `QuickStat` row immediately under it (both stay part of the screen's fixed summary block, same way Dashboard's own top score block is fixed). Customizable, keys matching `SOMMEIL_CARD_DEFS`, each keeping its own existing conditional guard inside the node:
- `last7Nights`, `phases`, `bedtime`, `advice`, `detail`, `debtTrend`, `prediction`, `signals`, `circadian`, `tools`, `comprendre`, `objectifs` — one node per existing card/section, same conditionals as today (e.g. `phases` stays `lastSession && <SleepPhaseCarousel .../>`, `debtTrend` stays gated on the debt component's value, etc.).

## 8. i18n

New keys, additive across all 5 locales (fr/en/es/pt/de):
- `common.hubCustomize.subtitle` (shared hint, see §5).
- `sport.customize.title`, `nutrition.customize.title`, `sommeil.customize.title`.

Card `label` strings inside the three new `*Cards.ts` files are plain hardcoded French, matching `dashboardCards.ts`'s existing (non-i18n) convention — see Non-goals.

## 9. Testing

- No new pure-logic unit tests are needed: `resolveCardOrder` is a straight extraction of `resolveDashboardCardOrder`'s already-correct logic (same merge behavior, now parameterized) — its existing behavior is exercised indirectly today through Dashboard's own use, and the extraction is mechanical (verified via `tsc` + a manual before/after read, not new test cases).
- Full regression (`npx vitest run`) must stay green — no test currently references `DashboardCustomizeScreen` or `dashboardCards.ts` directly (confirmed: no existing test file imports either), so the rename/delete/generalize sequence has no test-file fallout to reconcile.
- Manual check after implementation: open each of the 4 customize screens, hide one card, confirm it disappears from the hub, re-show it, confirm order persists after an app reload (i.e. `secureStorage` round-trip) — this mirrors how Dashboard's feature was presumably verified originally; no automated coverage exists for that flow today either.

## 10. Known limitation

None new — this reuses the existing device-local `Preferences` storage exactly as `dashboardCards` already does. No Supabase migration, no new backend dependency.
