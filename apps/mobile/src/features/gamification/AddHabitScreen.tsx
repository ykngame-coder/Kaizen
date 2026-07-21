import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { habitInputSchema, type HabitInput } from '@supotsu/shared';
import { useAddHabit } from '@/lib/data/queries';

const PILLARS = [
  { value: 'habits', label: 'Habitude' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'recovery', label: 'Récup' },
  { value: 'sleep', label: 'Sommeil' },
] as const;

const CADENCE = [
  { value: 'daily', label: 'Quotidienne' },
  { value: 'weekly', label: 'Hebdo' },
] as const;

/** Create a habit (Master Prompt P12 habitudes). */
export function AddHabitScreen(): React.JSX.Element {
  const router = useRouter();
  const addHabit = useAddHabit();

  const [name, setName] = useState('');
  const [pillar, setPillar] = useState<(typeof PILLARS)[number]['value']>('habits');
  const [cadence, setCadence] = useState<(typeof CADENCE)[number]['value']>('daily');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const parsed = habitInputSchema.safeParse({ name, pillar, cadence, targetPerPeriod: 1 });
    if (!parsed.success) {
      setError('Donne un nom à ton habitude.');
      return;
    }
    try {
      await addHabit.mutateAsync(parsed.data as HabitInput);
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Nouvelle habitude</Text>
      <Text variant="caption" color="textMuted">
        Petite, concrète, répétable : c'est la régularité qui compte.
      </Text>

      <Input label="Nom (ex. Boire 2L d'eau)" value={name} onChangeText={setName} />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          PILIER
        </Text>
        <SegmentedControl options={PILLARS} value={pillar} onChange={setPillar} />
      </View>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          FRÉQUENCE
        </Text>
        <SegmentedControl options={CADENCE} value={cadence} onChange={setCadence} />
      </View>

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addHabit.isPending ? '…' : 'Créer'}
          onPress={submit}
          disabled={addHabit.isPending}
        />
      </View>
    </Screen>
  );
}
