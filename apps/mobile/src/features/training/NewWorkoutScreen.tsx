import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { suggestProgression } from '@supotsu/engines';
import { EXERCISES, MUSCLE_LABEL, toCatalogExercise, type Exercise } from '@/features/exercises/catalog';
import { useAddWorkout, useCustomExercises, useExerciseHistory } from '@/lib/data/queries';

const LIMIT = 60;

interface SetDraft {
  reps: string;
  weight: string;
}

/** Create a session plan: name, search + add exercises, set target reps/charge. It's saved "planned" — the muscle map, ACWR etc. only count it once the user actually marks it done from Planification. */
export function NewWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const addWorkout = useAddWorkout();
  const { data: history = {} } = useExerciseHistory();
  const { data: customExercises = [] } = useCustomExercises();

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, SetDraft>>({});
  const [error, setError] = useState<string | null>(null);

  const allExercises = useMemo(() => [...customExercises.map(toCatalogExercise), ...EXERCISES], [customExercises]);
  const byId = useMemo(() => new Map(allExercises.map((ex) => [ex.id, ex])), [allExercises]);
  const isCustom = (id: string): boolean => id.startsWith('custom-');

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? allExercises
        .filter(
          (ex) =>
            !selected[ex.id] &&
            (ex.name.toLowerCase().includes(q) || MUSCLE_LABEL[ex.primary].toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q)),
        )
        .slice(0, LIMIT)
    : [];

  const add = (id: string): void => {
    setSelected((prev) => ({ ...prev, [id]: { reps: '', weight: '' } }));
    setOrder((prev) => [...prev, id]);
    setQuery('');
  };
  const remove = (id: string): void => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((x) => x !== id));
  };
  const update = (id: string, patch: Partial<SetDraft>): void => {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (!name.trim() || order.length === 0) {
      setError('Donne un nom et ajoute au moins un exercice.');
      return;
    }
    const sets = order.map((exerciseId, index) => ({
      exerciseId,
      order: index,
      reps: selected[exerciseId]!.reps ? Number(selected[exerciseId]!.reps) : undefined,
      weightKg: selected[exerciseId]!.weight ? Number(selected[exerciseId]!.weight) : undefined,
    }));
    try {
      await addWorkout.mutateAsync({ name: name.trim(), sets });
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  const exerciseSubtitle = (ex: Exercise): string =>
    `${isCustom(ex.id) ? '✨ Perso · ' : ''}${[ex.primary, ...ex.secondary].map((m) => MUSCLE_LABEL[m]).join(', ')} · ${ex.equipment}`;

  return (
    <Screen scroll>
      <Text variant="title">Nouvelle séance</Text>
      <Text variant="caption" color="textMuted">
        Crée ta séance maintenant, tu la commenceras quand tu veux depuis Planification.
      </Text>
      <Input
        label="Nom de la séance"
        placeholder="Ex : Push A"
        value={name}
        onChangeText={setName}
      />

      <Text variant="heading">Ajouter un exercice</Text>
      <Input
        label="Rechercher un exercice"
        placeholder="Ex : développé, quads, curl…"
        value={query}
        onChangeText={setQuery}
      />
      {q ? (
        searchResults.length === 0 ? (
          <Text variant="caption" color="textSubtle">
            Aucun exercice ne correspond à "{query}". Tu peux{' '}
            <Text variant="caption" color="primary" onPress={() => router.push('/sport/exercise/new')}>
              créer un exercice personnalisé
            </Text>
            .
          </Text>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {searchResults.map((ex) => (
              <Pressable key={ex.id} onPress={() => add(ex.id)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="subtitle">{ex.name}</Text>
                      <Text variant="caption" color="textMuted">{exerciseSubtitle(ex)}</Text>
                    </View>
                    <Text variant="heading" style={{ color: colors.primary }}>+</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )
      ) : null}

      <Text variant="heading" style={{ marginTop: spacing[3] }}>
        Ta séance {order.length > 0 ? `(${order.length})` : ''}
      </Text>
      {order.length === 0 ? (
        <Text variant="caption" color="textSubtle">Recherche un exercice ci-dessus pour l'ajouter à ta séance.</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {order.map((id) => {
            const ex = byId.get(id);
            if (!ex) return null;
            return (
              <Card key={id} elevated>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="subtitle">{ex.name}</Text>
                    <Text variant="caption" color="textMuted">{exerciseSubtitle(ex)}</Text>
                  </View>
                  <Pressable onPress={() => remove(id)} hitSlop={8}>
                    <Text variant="heading" style={{ color: colors.error }}>×</Text>
                  </Pressable>
                </View>

                {(() => {
                  const suggestion = history[id] ? suggestProgression(history[id]) : undefined;
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
                            update(id, {
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
                      value={selected[id]!.reps}
                      onChangeText={(v) => update(id, { reps: v })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Charge (kg)"
                      keyboardType="numeric"
                      value={selected[id]!.weight}
                      onChangeText={(v) => update(id, { weight: v })}
                    />
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addWorkout.isPending ? '…' : 'Créer la séance'}
          onPress={submit}
          disabled={addWorkout.isPending}
        />
      </View>
    </Screen>
  );
}
