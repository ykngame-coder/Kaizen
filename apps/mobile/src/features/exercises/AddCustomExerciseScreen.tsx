import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, FilterChip, Input, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { customExerciseInputSchema } from '@supotsu/shared';
import { BackButton } from '@/features/navigation/BackButton';
import { useAddCustomExercise } from '@/lib/data/queries';
import { MUSCLE_LABEL } from './catalog';

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'];

/** Add a custom exercise the shared catalogue doesn't cover — home-gym equipment, a personal variant. */
export function AddCustomExerciseScreen(): React.JSX.Element {
  const router = useRouter();
  const addCustomExercise = useAddCustomExercise();

  const [name, setName] = useState('');
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const parsed = customExerciseInputSchema.safeParse({
      name,
      primaryMuscle,
      equipment: equipment.trim() || undefined,
    });
    if (!parsed.success) {
      setError('Donne un nom et choisis le muscle principal.');
      return;
    }
    try {
      await addCustomExercise.mutateAsync(parsed.data);
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">Exercice personnalisé</Text>
      <Text variant="caption" color="textMuted">
        Absent de la bibliothèque ? Ajoute-le — il rejoindra la liste pour tes séances.
      </Text>

      <Input label="Nom de l'exercice" placeholder="Ex : Presse à cuisses inclinée" value={name} onChangeText={setName} />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">MUSCLE PRINCIPAL</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {MUSCLES.map((m) => (
            <FilterChip key={m} label={MUSCLE_LABEL[m]} active={primaryMuscle === m} onPress={() => setPrimaryMuscle(m)} />
          ))}
        </View>
      </View>

      <Input
        label="Équipement (optionnel)"
        placeholder="Ex : Machine, Haltères, Poids du corps…"
        value={equipment}
        onChangeText={setEquipment}
      />

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addCustomExercise.isPending ? '…' : 'Créer'}
          onPress={submit}
          disabled={addCustomExercise.isPending}
        />
      </View>
    </Screen>
  );
}
