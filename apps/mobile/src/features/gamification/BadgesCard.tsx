import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Badge, Card, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import {
  BADGE_CATALOG,
  computeStreak,
  estimateTargets,
  evaluateBadges,
} from '@supotsu/engines';
import type { Activity } from '@supotsu/core';
import { useActivities, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';

/**
 * Streak + badges, derived deterministically from the user's own data by the
 * gamification engine (Master Prompt P36). Locked badges are shown greyed so the
 * user always sees what unlocks next — the reward logic is never a black box.
 */
export function BadgesCard(): React.JSX.Element {
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const { data: entries = [] } = useNutritionEntries();
  const { data: health = [] } = useHealthMetrics();
  const asOf = new Date().toISOString();

  const weight = useMemo(
    () =>
      health
        .filter((m) => m.type === 'weight')
        .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.value,
    [health],
  );

  const streak = useMemo(
    () => computeStreak(activities as Activity[], asOf).value,
    [activities, asOf],
  );
  const earned = useMemo(
    () =>
      evaluateBadges({
        activities: activities as Activity[],
        nutritionEntries: entries,
        targets: estimateTargets({ weightKg: weight }, asOf).value,
        asOf,
      }),
    [activities, entries, weight, asOf],
  );
  const earnedIds = new Set(earned.map((b) => b.id));

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading">Série &amp; badges</Text>
        <Badge
          label={streak > 0 ? `🔥 ${streak} j` : 'Pas de série'}
          tone={streak > 0 ? 'success' : 'neutral'}
        />
      </View>
      <Text variant="caption" color="textMuted">
        {earned.length} badge(s) débloqué(s) sur {BADGE_CATALOG.length}.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
        {BADGE_CATALOG.map((b) => {
          const unlocked = earnedIds.has(b.id);
          return (
            <View
              key={b.id}
              style={{
                paddingVertical: spacing[1],
                paddingHorizontal: spacing[2],
                borderRadius: 8,
                backgroundColor: unlocked ? colors.surfaceElevated : colors.surface,
                borderWidth: 1,
                borderColor: unlocked ? colors.primary : colors.border,
                opacity: unlocked ? 1 : 0.5,
              }}
            >
              <Text variant="caption" color={unlocked ? 'text' : 'textMuted'}>
                {unlocked ? '★' : '☆'} {b.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
