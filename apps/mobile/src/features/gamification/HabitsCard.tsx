import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useHabitLogs, useHabits, useLogHabit } from '@/lib/data/queries';

const sameDay = (a: string, b: string): boolean => a.slice(0, 10) === b.slice(0, 10);

/**
 * Daily habits with one-tap completion (Master Prompt P12 habitudes). Completing
 * a habit feeds the habits pillar and, over consecutive days, the streak/badges.
 */
export function HabitsCard(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: habits = [] } = useHabits();
  const { data: logs = [] } = useHabitLogs();
  const logHabit = useLogHabit();
  const today = new Date().toISOString();

  const doneToday = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) if (sameDay(l.completedAt, today)) set.add(l.habitId);
    return set;
  }, [logs, today]);

  return (
    <Card>
      <Text variant="heading">{t('sport.gamification.habitsCard.heading')}</Text>
      {habits.length === 0 ? (
        <Text variant="body" color="textMuted">
          {t('sport.gamification.habitsCard.emptyMessage')}
        </Text>
      ) : (
        <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
          {habits.map((h) => {
            const done = doneToday.has(h.id);
            return (
              <View
                key={h.id}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text variant="body" color={done ? 'textMuted' : 'text'}>
                  {done ? '✓ ' : ''}
                  {h.name}
                </Text>
                <Button
                  label={done ? t('sport.gamification.habitsCard.done') : t('sport.gamification.habitsCard.validate')}
                  variant={done ? 'secondary' : 'primary'}
                  disabled={done || logHabit.isPending}
                  onPress={() => logHabit.mutate(h.id)}
                />
              </View>
            );
          })}
        </View>
      )}
      <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
        <Button label={t('sport.gamification.habitsCard.newHabit')} variant="secondary" onPress={() => router.push('/profile/habit/new')} />
      </View>
      <Text variant="caption" style={{ color: colors.textMuted, marginTop: spacing[1] }}>
        {t('sport.gamification.habitsCard.footerHint')}
      </Text>
    </Card>
  );
}
