import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, EmptyState, Icon, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { habitInputSchema } from '@supotsu/shared';
import { BackButton } from '@/features/navigation/BackButton';
import { useArchiveHabit, useHabits, useUpdateHabit } from '@/lib/data/queries';
import { linkedKindFor, LINKED_LABEL } from './linkedHabits';

type PillarOption = 'habits' | 'nutrition' | 'recovery' | 'sleep' | 'performance';

function pillarOptions(t: TFunction) {
  return [
    { value: 'habits', label: t('sport.gamification.addHabit.pillars.habits') },
    { value: 'nutrition', label: t('sport.gamification.addHabit.pillars.nutrition') },
    { value: 'recovery', label: t('sport.gamification.addHabit.pillars.recovery') },
    { value: 'sleep', label: t('sport.gamification.addHabit.pillars.sleep') },
    { value: 'performance', label: t('sport.gamification.addHabit.pillars.performance') },
  ] as const;
}

function cadenceOptions(t: TFunction) {
  return [
    { value: 'daily', label: t('sport.gamification.addHabit.cadence.daily') },
    { value: 'weekly', label: t('sport.gamification.addHabit.cadence.weekly') },
  ] as const;
}

/**
 * Edit an existing habit (rename/repillar/recadence/retarget) or archive it —
 * previously the only way to change a habit was to delete-and-recreate it by
 * hand, since AddHabitScreen only ever created new ones. Archiving is a soft
 * delete (sets archivedAt) so log history and streaks survive.
 */
export function EditHabitScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: habits = [], isLoading } = useHabits();
  const updateHabit = useUpdateHabit();
  const archiveHabit = useArchiveHabit();
  const PILLARS = pillarOptions(t);
  const CADENCE = cadenceOptions(t);

  const habit = habits.find((h) => h.id === id);

  const [name, setName] = useState('');
  const [pillar, setPillar] = useState<PillarOption>('habits');
  const [cadence, setCadence] = useState<(typeof CADENCE)[number]['value']>('daily');
  const [target, setTarget] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (prefilled || !habit) return;
    setName(habit.name);
    setPillar(PILLARS.some((p) => p.value === habit.pillar) ? (habit.pillar as PillarOption) : 'habits');
    setCadence(habit.cadence);
    setTarget(habit.targetPerPeriod);
    setPrefilled(true);
  }, [prefilled, habit]);

  const linked = linkedKindFor(name);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!habit) return;
    const parsed = habitInputSchema.safeParse({ name, pillar, cadence, targetPerPeriod: target });
    if (!parsed.success) {
      setError(t('sport.gamification.addHabit.errors.nameRequired'));
      return;
    }
    try {
      await updateHabit.mutateAsync({
        habitId: habit.id,
        name: parsed.data.name,
        pillar: parsed.data.pillar,
        cadence: parsed.data.cadence,
        targetPerPeriod: parsed.data.targetPerPeriod,
      });
      router.back();
    } catch {
      setError(t('sport.gamification.addHabit.errors.saveFailed'));
    }
  };

  const runArchive = async (): Promise<void> => {
    if (!habit) return;
    try {
      await archiveHabit.mutateAsync(habit.id);
      router.back();
    } catch {
      setError(t('sport.gamification.addHabit.errors.saveFailed'));
    }
  };

  const confirmArchive = (): void => {
    const title = t('sport.gamification.editHabit.archiveConfirm.title', { name: habit?.name ?? '' });
    const message = t('sport.gamification.editHabit.archiveConfirm.message');
    // Alert.alert's multi-button form is a no-op on web — see SettingsScreen's danger zone for the same dance.
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) void runArchive();
      return;
    }
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('sport.gamification.editHabit.archiveConfirm.confirmButton'), style: 'destructive', onPress: () => void runArchive() },
    ]);
  };

  if (isLoading) {
    return (
      <Screen scroll>
        <Text variant="body" color="textMuted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (!habit) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="checkCircle" size={44} color={colors.textSubtle} />} title={t('sport.gamification.editHabit.notFound.title')} actionLabel={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title" style={{ marginTop: spacing[2] }}>{t('sport.gamification.editHabit.title')}</Text>
      <Text variant="caption" color="textMuted">{t('sport.gamification.editHabit.subtitle')}</Text>

      <Input label={t('sport.gamification.addHabit.nameLabel')} value={name} onChangeText={setName} />
      {linked ? (
        <Text variant="caption" color="primary">
          {t('sport.gamification.addHabit.linkedHint', { source: LINKED_LABEL[linked] })}
        </Text>
      ) : null}

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">{t('sport.gamification.addHabit.pillarLabel')}</Text>
        <SegmentedControl options={PILLARS} value={pillar} onChange={setPillar} />
      </View>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">{t('sport.gamification.addHabit.frequencyLabel')}</Text>
        <SegmentedControl options={CADENCE} value={cadence} onChange={setCadence} />
      </View>

      {!linked && (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" color="textMuted">
            {cadence === 'daily' ? t('sport.gamification.addHabit.targetPerDay') : t('sport.gamification.addHabit.targetPerWeek')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <Pressable
              onPress={() => setTarget((n) => Math.max(1, n - 1))}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
            >
              <Text variant="body" style={{ fontWeight: '700' }}>−</Text>
            </Pressable>
            <Text variant="subtitle" style={{ minWidth: 28, textAlign: 'center' }}>{target}</Text>
            <Pressable
              onPress={() => setTarget((n) => Math.min(50, n + 1))}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
            >
              <Text variant="body" style={{ fontWeight: '700' }}>+</Text>
            </Pressable>
            <Text variant="caption" color="textSubtle">{t('sport.gamification.addHabit.timesLabel')}</Text>
          </View>
        </View>
      )}

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={updateHabit.isPending ? '…' : t('sport.gamification.editHabit.saveButton')}
          onPress={submit}
          disabled={updateHabit.isPending}
        />
      </View>

      <Card>
        <Text variant="heading">{t('sport.gamification.editHabit.dangerZone.heading')}</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>{t('sport.gamification.editHabit.dangerZone.hint')}</Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
          <Button
            label={archiveHabit.isPending ? '…' : t('sport.gamification.editHabit.archiveButton')}
            variant="secondary"
            onPress={confirmArchive}
            disabled={archiveHabit.isPending}
          />
        </View>
      </Card>
    </Screen>
  );
}
