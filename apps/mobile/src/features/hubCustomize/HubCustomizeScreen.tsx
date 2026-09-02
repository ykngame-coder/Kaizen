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
