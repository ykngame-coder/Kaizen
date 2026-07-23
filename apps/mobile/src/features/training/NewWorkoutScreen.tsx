import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { suggestProgression } from '@supotsu/engines';
import { useAddWorkout, useExerciseHistory } from '@/lib/data/queries';

interface SetDraft {
  reps: string;
  weight: string;
}

/** Create/log a session: name, pick exercises, record one set each (P36.5/P36.8). */
export function NewWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const addWorkout = useAddWorkout();
  const { data: history = {} } = useExerciseHistory();

  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Record<string, SetDraft>>({});
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { reps: '', weight: '' };
      return next;
    });
  };

  const update = (id: string, patch: Partial<SetDraft>): void => {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const ids = Object.keys(selected);
    if (!name.trim() || ids.length === 0) {
      setError('Donne un nom et sélectionne au moins un exercice.');
      return;
    }
    const sets = ids.map((exerciseId, index) => ({
      exerciseId,
      order: index,
      reps: selected[exerciseId].reps ? Number(selected[exerciseId].reps) : undefined,
      weightKg: selected[exerciseId].weight ? Number(selected[exerciseId].weight) : undefined,
    }));
    try {
      await addWorkout.mutateAsync({ name: name.trim(), sets });
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Nouvelle séance</Text>
      <Input
        label="Nom de la séance"
        placeholder="Ex : Push A"
        value={name}
        onChangeText={setName}
      />

      <Text variant="heading">Bibliothèque d'exercices</Text>
      <View style={{ gap: spacing[2] }}>
        {EXERCISE_LIBRARY.map((ex) => {
          const isSelected = !!selected[ex.id];
          return (
            <Card key={ex.id} elevated={isSelected}>
              <Pressable
                onPress={() => toggle(ex.id)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="subtitle">{ex.name}</Text>
                  <Text variant="caption" color="textMuted">
                    {ex.primaryMuscles.join(', ')}
                  </Text>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: radii.full,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                  }}
                />
              </Pressable>

              {isSelected ? (
                <>
                  {(() => {
                    const suggestion = history[ex.id] ? suggestProgression(history[ex.id]) : undefined;
                    if (!suggestion) return null;
                    return (
                      <View
                        style={{
                          marginTop: spacing[2],
                          padding: spacing[2],
                          borderRadius: radii.md,
                          backgroundColor: colors.surfaceElevated,
                          gap: spacing[1],
                        }}
                      >
                        <Text variant="caption" color="textMuted">
                          💡 Surcharge progressive : {suggestion.rationale}
                        </Text>
                        <View style={{ alignItems: 'flex-start' }}>
                          <Button
                            label="Utiliser la suggestion"
                            variant="secondary"
                            onPress={() =>
                              update(ex.id, {
                                reps: suggestion.reps !== undefined ? String(suggestion.reps) : '',
                                weight: suggestion.weightKg !== undefined ? String(suggestion.weightKg) : '',
                              })
                            }
                          />
                        </View>
                      </View>
                    );
                  })()}
                  <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[2] }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Répétitions"
                        keyboardType="numeric"
                        value={selected[ex.id].reps}
                        onChangeText={(v) => update(ex.id, { reps: v })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Charge (kg)"
                        keyboardType="numeric"
                        value={selected[ex.id].weight}
                        onChangeText={(v) => update(ex.id, { weight: v })}
                      />
                    </View>
                  </View>
                </>
              ) : null}
            </Card>
          );
        })}
      </View>

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addWorkout.isPending ? '…' : 'Enregistrer la séance'}
          onPress={submit}
          disabled={addWorkout.isPending}
        />
      </View>
    </Screen>
  );
}
