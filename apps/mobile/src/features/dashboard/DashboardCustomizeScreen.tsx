import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Screen, Text, Toggle, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { DashboardCardPref } from '@/lib/preferences';
import { usePreferences } from '@/lib/preferences';
import { DASHBOARD_CARD_DEFS, resolveDashboardCardOrder } from './dashboardCards';

const LABEL_BY_ID = new Map(DASHBOARD_CARD_DEFS.map((d) => [d.id, d.label]));

/**
 * Lets the user show/hide and reorder the Dashboard's customizable cards
 * (header, "Focus du jour" and "Score Kaizen" stay fixed — see
 * dashboardCards.ts). The drag handle and the visibility toggle are two
 * separate touch targets on purpose: stacking a long-press-to-drag and a
 * tap-to-toggle on the same element is a common source of flaky gesture
 * conflicts on real devices once react-native-gesture-handler is also
 * driving the list's own drag detection.
 */
export function DashboardCustomizeScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const [cards, setCards] = useState<DashboardCardPref[]>(() =>
    resolveDashboardCardOrder(preferences.dashboardCards),
  );

  const persist = (next: DashboardCardPref[]): void => {
    setCards(next);
    setPreference('dashboardCards', next);
  };

  return (
    <Screen>
      <Text variant="title">{t('dashboard.customize.title')}</Text>
      <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        {t('dashboard.customize.subtitle')}
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
              <Text variant="body" style={{ flex: 1 }}>{LABEL_BY_ID.get(item.id) ?? item.id}</Text>
              <Toggle
                value={item.visible}
                onValueChange={(v) => persist(cards.map((c) => (c.id === item.id ? { ...c, visible: v } : c)))}
              />
            </View>
          )}
        />
      </View>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
