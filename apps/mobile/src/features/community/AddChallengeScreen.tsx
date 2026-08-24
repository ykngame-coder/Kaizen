import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { challengeInputSchema, type ChallengeInput } from '@supotsu/shared';
import { useCreateChallenge } from '@/lib/data/queries';

/** Create a community challenge (Master Prompt P37). */
export function AddChallengeScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const create = useCreateChallenge();

  const METRICS = [
    { value: 'activity_count', label: t('community.addChallenge.metrics.activityCount') },
    { value: 'active_days', label: t('community.addChallenge.metrics.activeDays') },
  ] as const;

  const DURATIONS = [
    { value: '7', label: t('community.addChallenge.durations.7') },
    { value: '14', label: t('community.addChallenge.durations.14') },
    { value: '30', label: t('community.addChallenge.durations.30') },
  ] as const;

  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<(typeof METRICS)[number]['value']>('activity_count');
  const [target, setTarget] = useState('');
  const [days, setDays] = useState<(typeof DURATIONS)[number]['value']>('7');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + Number(days) * 86_400_000).toISOString();
    const parsed = challengeInputSchema.safeParse({
      title,
      metric,
      target: Number(target),
      startsAt,
      endsAt,
      visibility: 'public',
    });
    if (!parsed.success) {
      setError(t('community.addChallenge.errors.invalid'));
      return;
    }
    try {
      await create.mutateAsync(parsed.data as ChallengeInput);
      router.back();
    } catch {
      setError(t('community.addChallenge.errors.createFailed'));
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('community.addChallenge.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('community.addChallenge.subtitle')}
      </Text>

      <Input label={t('community.addChallenge.titleInputLabel')} value={title} onChangeText={setTitle} />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          {t('community.addChallenge.metricLabel')}
        </Text>
        <SegmentedControl options={METRICS} value={metric} onChange={setMetric} />
      </View>

      <Input label={t('community.addChallenge.targetInputLabel')} keyboardType="numeric" value={target} onChangeText={setTarget} />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          {t('community.addChallenge.durationLabel')}
        </Text>
        <SegmentedControl options={DURATIONS} value={days} onChange={setDays} />
      </View>

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={create.isPending ? t('community.addChallenge.creating') : t('community.addChallenge.submit')}
          onPress={submit}
          disabled={create.isPending}
        />
      </View>
    </Screen>
  );
}
