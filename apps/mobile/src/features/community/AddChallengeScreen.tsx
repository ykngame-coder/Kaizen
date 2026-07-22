import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { challengeInputSchema, type ChallengeInput } from '@supotsu/shared';
import { useCreateChallenge } from '@/lib/data/queries';

const METRICS = [
  { value: 'activity_count', label: 'Nb activités' },
  { value: 'active_days', label: 'Jours actifs' },
] as const;

const DURATIONS = [
  { value: '7', label: '7 jours' },
  { value: '14', label: '14 jours' },
  { value: '30', label: '30 jours' },
] as const;

/** Create a community challenge (Master Prompt P37). */
export function AddChallengeScreen(): React.JSX.Element {
  const router = useRouter();
  const create = useCreateChallenge();

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
      setError('Donne un titre et un objectif valide (nombre).');
      return;
    }
    try {
      await create.mutateAsync(parsed.data as ChallengeInput);
      router.back();
    } catch {
      setError('Création impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Nouveau défi</Text>
      <Text variant="caption" color="textMuted">
        Défini clairement : une métrique, un objectif, une période.
      </Text>

      <Input label="Titre (ex. 5 activités cette semaine)" value={title} onChangeText={setTitle} />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          MÉTRIQUE
        </Text>
        <SegmentedControl options={METRICS} value={metric} onChange={setMetric} />
      </View>

      <Input label="Objectif (nombre)" keyboardType="numeric" value={target} onChangeText={setTarget} />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          DURÉE
        </Text>
        <SegmentedControl options={DURATIONS} value={days} onChange={setDays} />
      </View>

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={create.isPending ? '…' : 'Créer le défi'}
          onPress={submit}
          disabled={create.isPending}
        />
      </View>
    </Screen>
  );
}
