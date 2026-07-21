import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { useHabitLogs, useHabits, useLogHabit } from '@/lib/data/queries';

const sameDay = (a: string, b: string): boolean => a.slice(0, 10) === b.slice(0, 10);

/**
 * Daily habits with one-tap completion (Master Prompt P12 habitudes). Completing
 * a habit feeds the habits pillar and, over consecutive days, the streak/badges.
 */
export function HabitsCard(): React.JSX.Element {
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
      <Text variant="heading">Habitudes du jour</Text>
      {habits.length === 0 ? (
        <Text variant="body" color="textMuted">
          Crée une habitude simple (eau, mobilité, sommeil…) pour construire ta régularité.
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
                  label={done ? 'Fait' : 'Valider'}
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
        <Button label="Nouvelle habitude" variant="secondary" onPress={() => router.push('/habit/new')} />
      </View>
      <Text variant="caption" style={{ color: colors.textMuted, marginTop: spacing[1] }}>
        Chaque validation nourrit ta série et tes badges.
      </Text>
    </Card>
  );
}
