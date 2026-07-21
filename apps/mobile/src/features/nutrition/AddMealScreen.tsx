import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { nutritionEntryInputSchema, type NutritionEntryInput } from '@supotsu/shared';
import { useAddNutritionEntry } from '@/lib/data/queries';

const MEALS = [
  { value: 'breakfast', label: 'Petit-déj' },
  { value: 'lunch', label: 'Déjeuner' },
  { value: 'dinner', label: 'Dîner' },
  { value: 'snack', label: 'Collation' },
] as const;

const numOrUndef = (s: string): number | undefined => (s ? Number(s) : undefined);

/** Manual meal logging form (Master Prompt P11 nutrition). */
export function AddMealScreen(): React.JSX.Element {
  const router = useRouter();
  const addMeal = useAddNutritionEntry();

  const [mealType, setMealType] = useState<(typeof MEALS)[number]['value']>('lunch');
  const [description, setDescription] = useState('');
  const [kcal, setKcal] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [hydrationMl, setHydrationMl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const candidate = {
      mealType,
      description,
      kcal: Number(kcal),
      proteinG: numOrUndef(proteinG),
      hydrationMl: numOrUndef(hydrationMl),
      source: 'manual' as const,
      loggedAt: new Date().toISOString(),
    };
    const parsed = nutritionEntryInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Renseigne au moins une description et des calories valides.');
      return;
    }
    try {
      await addMeal.mutateAsync(parsed.data as NutritionEntryInput);
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Nouveau repas</Text>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          MOMENT
        </Text>
        <SegmentedControl options={MEALS} value={mealType} onChange={setMealType} />
      </View>

      <Input label="Description" value={description} onChangeText={setDescription} />

      <View style={{ flexDirection: 'row', gap: spacing[4] }}>
        <View style={{ flex: 1 }}>
          <Input label="Calories (kcal)" keyboardType="numeric" value={kcal} onChangeText={setKcal} />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Protéines (g)"
            keyboardType="numeric"
            value={proteinG}
            onChangeText={setProteinG}
          />
        </View>
      </View>

      <Input
        label="Eau (ml, optionnel)"
        keyboardType="numeric"
        value={hydrationMl}
        onChangeText={setHydrationMl}
      />

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addMeal.isPending ? '…' : 'Enregistrer'}
          onPress={submit}
          disabled={addMeal.isPending}
        />
      </View>
    </Screen>
  );
}
