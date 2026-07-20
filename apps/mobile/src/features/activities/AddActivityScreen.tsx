import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { activityInputSchema, type ActivityInput } from '@supotsu/shared';
import { useAddActivity } from '@/lib/data/queries';

const TYPES = [
  { value: 'running', label: 'Course' },
  { value: 'walking', label: 'Marche' },
  { value: 'cycling', label: 'Vélo' },
  { value: 'strength', label: 'Musculation' },
  { value: 'hyrox', label: 'Hyrox' },
  { value: 'mobility', label: 'Mobilité' },
  { value: 'other', label: 'Autre' },
] as const;

const INTENSITIES = [
  { value: 'low', label: 'Faible' },
  { value: 'moderate', label: 'Modérée' },
  { value: 'high', label: 'Élevée' },
  { value: 'max', label: 'Max' },
] as const;

const WHEN = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
] as const;

/** Manual activity logging form (Master Prompt MVP P20.3 — ajout manuel). */
export function AddActivityScreen(): React.JSX.Element {
  const router = useRouter();
  const addActivity = useAddActivity();

  const [type, setType] = useState<(typeof TYPES)[number]['value']>('running');
  const [when, setWhen] = useState<(typeof WHEN)[number]['value']>('today');
  const [intensity, setIntensity] = useState<(typeof INTENSITIES)[number]['value']>('moderate');
  const [durationMin, setDurationMin] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const startedAt = new Date(Date.now() - (when === 'yesterday' ? 86_400_000 : 0)).toISOString();

    const candidate = {
      type,
      source: 'manual' as const,
      startedAt,
      durationSec: Math.round(Number(durationMin) * 60),
      intensity,
      distanceM: distanceKm ? Math.round(Number(distanceKm) * 1000) : undefined,
    };

    const parsed = activityInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Vérifie la durée (en minutes) et la distance.');
      return;
    }
    try {
      await addActivity.mutateAsync(parsed.data as ActivityInput);
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Nouvelle activité</Text>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          TYPE
        </Text>
        <SegmentedControl options={TYPES} value={type} onChange={setType} vertical />
      </View>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          QUAND
        </Text>
        <SegmentedControl options={WHEN} value={when} onChange={setWhen} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[4] }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Durée (min)"
            keyboardType="numeric"
            value={durationMin}
            onChangeText={setDurationMin}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Distance (km)"
            keyboardType="numeric"
            value={distanceKm}
            onChangeText={setDistanceKm}
          />
        </View>
      </View>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          INTENSITÉ
        </Text>
        <SegmentedControl options={INTENSITIES} value={intensity} onChange={setIntensity} />
      </View>

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addActivity.isPending ? '…' : 'Enregistrer'}
          onPress={submit}
          disabled={addActivity.isPending}
        />
      </View>
    </Screen>
  );
}
