import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, Meter, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { computeMuscleStates, overallReadiness, type MuscleState } from '@supotsu/engines';
import { useMuscleSessions } from '@/lib/data/queries';

const MUSCLE_LABEL: Partial<Record<MuscleGroup, string>> = {
  chest: 'Pectoraux',
  back: 'Dos',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quadriceps',
  hamstrings: 'Ischios',
  glutes: 'Fessiers',
  calves: 'Mollets',
  core: 'Abdos',
};

/** Muscle recovery widget: overall readiness + the two most-recently worked groups. */
export function MuscleWidget(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: sessions = [] } = useMuscleSessions();
  const asOf = new Date().toISOString();

  const statuses = useMemo(() => computeMuscleStates(sessions, asOf), [sessions, asOf]);
  const readiness = useMemo(() => overallReadiness(statuses), [statuses]);
  const worked = useMemo(
    () =>
      statuses
        .filter((s) => s.lastTrainedDaysAgo !== null)
        .sort((a, b) => a.freshness - b.freshness)
        .slice(0, 2),
    [statuses],
  );

  const colorForState = (state: MuscleState): string => {
    switch (state) {
      case 'fatigued':
        return colors.error;
      case 'worked':
        return colors.warning;
      case 'fresh':
        return colors.success;
      default:
        return colors.accentLime;
    }
  };

  return (
    <Pressable onPress={() => router.push('/sport/muscles')} style={{ flex: 1 }}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="heading">{t('dashboard.muscleWidget.title')}</Text>
          <Text variant="subtitle" color="accentLime">
            {readiness}%
          </Text>
        </View>
        {worked.length === 0 ? (
          <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
            {t('dashboard.muscleWidget.noRecentSessions')}
          </Text>
        ) : (
          <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
            {worked.map((s) => (
              <View key={s.muscle} style={{ gap: spacing[1] }}>
                <Meter value={s.freshness} color={colorForState(s.state)} height={6} />
              </View>
            ))}
            <Text variant="caption" color="textMuted">
              {worked.map((s) => MUSCLE_LABEL[s.muscle] ?? s.muscle).join(' / ')}
            </Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}
