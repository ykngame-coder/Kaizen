import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, Meter, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import {
  computeMuscleStates,
  overallReadiness,
  suggestNextMuscles,
  type MuscleState,
} from '@supotsu/engines';
import { useMuscleSessions } from '@/lib/data/queries';
import { MuscleBody } from './MuscleBody';
import { MUSCLE_STATE_LABEL, MUSCLE_STATE_TONE, muscleColorFor } from './muscleColor';

function muscleLabel(t: TFunction): Record<MuscleGroup, string> {
  return {
    chest: t('sport.muscles.screen.muscleLabel.chest'),
    back: t('sport.muscles.screen.muscleLabel.back'),
    shoulders: t('sport.muscles.screen.muscleLabel.shoulders'),
    biceps: t('sport.muscles.screen.muscleLabel.biceps'),
    triceps: t('sport.muscles.screen.muscleLabel.triceps'),
    quads: t('sport.muscles.screen.muscleLabel.quads'),
    hamstrings: t('sport.muscles.screen.muscleLabel.hamstrings'),
    glutes: t('sport.muscles.screen.muscleLabel.glutes'),
    calves: t('sport.muscles.screen.muscleLabel.calves'),
    core: t('sport.muscles.screen.muscleLabel.core'),
    full_body: t('sport.muscles.screen.muscleLabel.fullBody'),
  };
}

/** Lower-case names for inline sentences ("tes pectoraux et tes épaules"). */
function muscleInline(t: TFunction): Record<MuscleGroup, string> {
  return {
    chest: t('sport.muscles.screen.muscleInline.chest'),
    back: t('sport.muscles.screen.muscleInline.back'),
    shoulders: t('sport.muscles.screen.muscleInline.shoulders'),
    biceps: t('sport.muscles.screen.muscleInline.biceps'),
    triceps: t('sport.muscles.screen.muscleInline.triceps'),
    quads: t('sport.muscles.screen.muscleInline.quads'),
    hamstrings: t('sport.muscles.screen.muscleInline.hamstrings'),
    glutes: t('sport.muscles.screen.muscleInline.glutes'),
    calves: t('sport.muscles.screen.muscleInline.calves'),
    core: t('sport.muscles.screen.muscleInline.core'),
    full_body: t('sport.muscles.screen.muscleInline.fullBody'),
  };
}

/** Join labels: "a, b et c". */
function joinFr(labels: string[], and: string): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(', ')} ${and} ${labels[labels.length - 1]}`;
}

/** Muscle recovery (#5): overall state on a body map, then a per-group readout. */
export function MusclesScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: sessions = [], isLoading } = useMuscleSessions();

  const MUSCLE_LABEL = useMemo(() => muscleLabel(t), [t]);
  const MUSCLE_INLINE = useMemo(() => muscleInline(t), [t]);

  const statuses = useMemo(
    () => computeMuscleStates(sessions, new Date().toISOString()),
    [sessions],
  );
  const stateColor = (state: MuscleState): string => colors[MUSCLE_STATE_TONE[state]];
  const colorFor = useMemo(() => muscleColorFor(statuses, colors), [statuses, colors]);

  const readiness = useMemo(() => overallReadiness(statuses), [statuses]);
  const fresh = useMemo(() => suggestNextMuscles(statuses, 3), [statuses]);
  const ranked = useMemo(
    () =>
      [...statuses]
        .filter((s) => s.lastTrainedDaysAgo !== null)
        .sort((a, b) => a.freshness - b.freshness),
    [statuses],
  );

  const stillTired = ranked.filter((s) => s.state === 'fatigued' || s.state === 'worked');
  const coaching = useMemo(() => {
    const and = t('sport.muscles.screen.and');
    if (stillTired.length > 0) {
      const names = joinFr(stillTired.slice(0, 3).map((s) => MUSCLE_INLINE[s.muscle]), and);
      const suggestion = joinFr(fresh.map((m) => MUSCLE_INLINE[m]), and);
      return {
        pill: t('sport.muscles.screen.coaching.recoveringPill'),
        tone: 'warning' as const,
        text: t('sport.muscles.screen.coaching.recoveringText', { names, suggestion }),
      };
    }
    return {
      pill: t('sport.muscles.screen.coaching.readyPill'),
      tone: 'success' as const,
      text: t('sport.muscles.screen.coaching.readyText'),
    };
  }, [stillTired, fresh, MUSCLE_INLINE, t]);

  const legend: MuscleState[] = ['fatigued', 'worked', 'fresh', 'rested'];

  return (
    <Screen scroll>
      <Text variant="title">{t('sport.muscles.screen.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.muscles.screen.subtitle')}
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      ) : (
        <>
          {/* État global — body map + legend (shown even without recent sessions) */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="heading">{t('sport.muscles.screen.globalState.title')}</Text>
              <Text variant="subtitle" color="accentData">
                {readiness}%
              </Text>
            </View>

            <View style={{ alignItems: 'center', marginTop: spacing[2] }}>
              <MuscleBody colorFor={colorFor} width={330} />
            </View>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing[3],
                justifyContent: 'center',
                marginTop: spacing[3],
              }}
            >
              {legend.map((state) => (
                <View
                  key={state}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stateColor(state) }} />
                  <Text variant="caption" color="textMuted">
                    {MUSCLE_STATE_LABEL[state]}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {ranked.length === 0 ? (
            <Card>
              <Text variant="body" color="textMuted">
                {t('sport.muscles.screen.emptyState.message')}
              </Text>
              <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
                <Button label={t('sport.muscles.screen.emptyState.action')} onPress={() => router.push('/sport/workout/new')} />
              </View>
            </Card>
          ) : (
          <>
          {/* Groupes musculaires — name + coloured status */}
          <Card>
            <Text variant="heading">{t('sport.muscles.screen.muscleGroups.title')}</Text>
            <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
              {ranked.map((s) => (
                <View key={s.muscle} style={{ gap: spacing[1] }}>
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Text variant="body">{MUSCLE_LABEL[s.muscle]}</Text>
                    <Text variant="subtitle" style={{ color: stateColor(s.state) }}>
                      {MUSCLE_STATE_LABEL[s.state]}
                    </Text>
                  </View>
                  <Meter value={s.freshness} color={stateColor(s.state)} height={6} />
                </View>
              ))}
            </View>
          </Card>

          {/* Coaching */}
          <Card>
            <View style={{ alignItems: 'flex-start' }}>
              <Badge label={coaching.pill} tone={coaching.tone} />
            </View>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {coaching.text}
            </Text>
            <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
              <Button label={t('sport.muscles.screen.coaching.planButton')} onPress={() => router.push('/sport/workout/new')} />
            </View>
          </Card>
          </>
          )}
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
