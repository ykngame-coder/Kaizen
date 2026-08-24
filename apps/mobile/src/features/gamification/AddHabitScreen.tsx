import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { habitInputSchema, type HabitInput } from '@supotsu/shared';
import { useAddHabit } from '@/lib/data/queries';
import { linkedKindFor, LINKED_LABEL } from './linkedHabits';

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
 * Ready-made habits — tapping one fills the form below instead of starting
 * from a blank name. "Boire de l'eau" / "Marche" are worded to match
 * linkedKindFor exactly, so they come with automatic tracking already on
 * (see the live hint under the name field) instead of the user having to
 * guess the right wording for that to kick in.
 */
type PillarOption = 'habits' | 'nutrition' | 'recovery' | 'sleep' | 'performance';

function presets(t: TFunction): { emoji: string; name: string; pillar: PillarOption; cadence: 'daily' | 'weekly'; targetPerPeriod: number }[] {
  return [
    { emoji: '💧', name: t('sport.gamification.addHabit.presets.water'), pillar: 'nutrition', cadence: 'daily', targetPerPeriod: 1 },
    { emoji: '🚶', name: t('sport.gamification.addHabit.presets.walk'), pillar: 'performance', cadence: 'daily', targetPerPeriod: 1 },
    { emoji: '😴', name: t('sport.gamification.addHabit.presets.sleep'), pillar: 'sleep', cadence: 'daily', targetPerPeriod: 1 },
    { emoji: '🧘', name: t('sport.gamification.addHabit.presets.stretch'), pillar: 'recovery', cadence: 'daily', targetPerPeriod: 1 },
    { emoji: '📖', name: t('sport.gamification.addHabit.presets.reading'), pillar: 'habits', cadence: 'daily', targetPerPeriod: 1 },
    { emoji: '💊', name: t('sport.gamification.addHabit.presets.medication'), pillar: 'habits', cadence: 'daily', targetPerPeriod: 2 },
    { emoji: '🏋️', name: t('sport.gamification.addHabit.presets.workout'), pillar: 'performance', cadence: 'weekly', targetPerPeriod: 3 },
  ];
}

/** Create a habit (Master Prompt P12 habitudes). */
export function AddHabitScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const addHabit = useAddHabit();
  const PILLARS = pillarOptions(t);
  const CADENCE = cadenceOptions(t);
  const PRESETS = presets(t);

  const [name, setName] = useState('');
  const [pillar, setPillar] = useState<(typeof PILLARS)[number]['value']>('habits');
  const [cadence, setCadence] = useState<(typeof CADENCE)[number]['value']>('daily');
  const [target, setTarget] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const linked = linkedKindFor(name);

  const applyPreset = (p: (typeof PRESETS)[number]): void => {
    setName(p.name);
    setPillar(p.pillar);
    setCadence(p.cadence);
    setTarget(p.targetPerPeriod);
    setError(null);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const parsed = habitInputSchema.safeParse({ name, pillar, cadence, targetPerPeriod: target });
    if (!parsed.success) {
      setError(t('sport.gamification.addHabit.errors.nameRequired'));
      return;
    }
    try {
      await addHabit.mutateAsync(parsed.data as HabitInput);
      router.back();
    } catch {
      setError(t('sport.gamification.addHabit.errors.saveFailed'));
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('sport.gamification.addHabit.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.gamification.addHabit.subtitle')}
      </Text>

      <Card>
        <Text variant="heading">{t('sport.gamification.addHabit.modelsHeading')}</Text>
        <Text variant="caption" color="textSubtle" style={{ marginBottom: spacing[2] }}>
          {t('sport.gamification.addHabit.modelsHint')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {PRESETS.map((p) => {
            const active = name === p.name;
            return (
              <Pressable
                key={p.name}
                onPress={() => applyPreset(p)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: spacing[2],
                  paddingHorizontal: spacing[3],
                  borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 15 }}>{p.emoji}</Text>
                <Text variant="caption" style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Input label={t('sport.gamification.addHabit.nameLabel')} value={name} onChangeText={setName} />
      {linked ? (
        <Text variant="caption" color="primary">
          {t('sport.gamification.addHabit.linkedHint', { source: LINKED_LABEL[linked] })}
        </Text>
      ) : null}

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          {t('sport.gamification.addHabit.pillarLabel')}
        </Text>
        <SegmentedControl options={PILLARS} value={pillar} onChange={setPillar} />
      </View>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          {t('sport.gamification.addHabit.frequencyLabel')}
        </Text>
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
          label={addHabit.isPending ? '…' : t('sport.gamification.addHabit.createButton')}
          onPress={submit}
          disabled={addHabit.isPending}
        />
      </View>
    </Screen>
  );
}
