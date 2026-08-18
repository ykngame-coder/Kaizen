import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { suggestProgression } from '@supotsu/engines';
import { EXERCISES, MUSCLE_LABEL, toCatalogExercise, type Exercise } from '@/features/exercises/catalog';
import { useAddWorkout, useCustomExercises, useExerciseHistory, useWorkouts, useWorkoutSets } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const LIMIT = 60;
/** Name Garmin imports are stored under (repository.ts upsertImportedWorkouts) — flags the badge below. */
const GARMIN_IMPORT_NAME = 'Musculation (import Garmin)';

interface SetDraft {
  reps: string;
  weight: string;
  rest: string;
}

/** Create a session plan: name, search + add exercises, set target reps/charge. It's saved "planned" — the muscle map, ACWR etc. only count it once the user actually marks it done from Planification. */
export function NewWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const addWorkout = useAddWorkout();
  const { data: history = {} } = useExerciseHistory();
  const { data: customExercises = [] } = useCustomExercises();
  const { data: allWorkouts = [] } = useWorkouts();

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, SetDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importSourceId, setImportSourceId] = useState<string | undefined>();

  const allExercises = useMemo(() => [...customExercises.map(toCatalogExercise), ...EXERCISES], [customExercises]);
  const byId = useMemo(() => new Map(allExercises.map((ex) => [ex.id, ex])), [allExercises]);
  const isCustom = (id: string): boolean => id.startsWith('custom-');

  // Séances déjà faites (incl. import Garmin) qu'on peut reprendre comme point de départ.
  const pastWorkouts = useMemo(
    () =>
      [...allWorkouts]
        .filter((w) => w.status === 'completed')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [allWorkouts],
  );
  const { data: importSets } = useWorkoutSets(importSourceId);

  // Une fois les séries de la séance choisie chargées, préremplit le formulaire — même
  // logique que le préremplissage d'EditWorkoutScreen, mais ça reste une nouvelle séance.
  useEffect(() => {
    if (!importSourceId || !importSets) return;
    const source = allWorkouts.find((w) => w.id === importSourceId);
    const nextOrder: string[] = [];
    const nextSelected: Record<string, SetDraft> = {};
    for (const s of [...importSets].sort((a, b) => a.order - b.order)) {
      if (!nextSelected[s.exerciseId]) {
        nextOrder.push(s.exerciseId);
        nextSelected[s.exerciseId] = {
          reps: s.reps != null ? String(s.reps) : '',
          weight: s.weightKg != null ? String(s.weightKg) : '',
          rest: s.restSec != null ? String(s.restSec) : '',
        };
      }
    }
    if (source && source.name !== GARMIN_IMPORT_NAME) {
      setName((prev) => (prev.trim() ? prev : source.name));
    }
    setOrder(nextOrder);
    setSelected(nextSelected);
    setImportSourceId(undefined);
    setPickerOpen(false);
  }, [importSourceId, importSets, allWorkouts]);

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
    setSelected((prev) => ({ ...prev, [id]: { reps: '', weight: '', rest: '' } }));
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
      restSec: selected[exerciseId]!.rest ? Number(selected[exerciseId]!.rest) : undefined,
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

      {pastWorkouts.length > 0 && (
        <View style={{ marginTop: spacing[2], alignItems: 'flex-start' }}>
          <Button
            label={pickerOpen ? 'Fermer' : 'Importer une séance déjà faite'}
            variant="secondary"
            onPress={() => setPickerOpen((v) => !v)}
          />
        </View>
      )}
      {pickerOpen && (
        <Card style={{ marginTop: spacing[2] }}>
          <Text variant="heading">Reprendre une séance déjà faite</Text>
          <Text variant="caption" color="textMuted" style={{ marginBottom: spacing[2] }}>
            Préremplit le nom et les exercices — tu peux tout modifier avant de créer.
          </Text>
          <View style={{ gap: spacing[2] }}>
            {pastWorkouts.slice(0, 20).map((w) => (
              <Pressable
                key={w.id}
                onPress={() => setImportSourceId(w.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Card elevated>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                        <Text variant="subtitle">{w.name}</Text>
                        {w.name === GARMIN_IMPORT_NAME && <Badge label="Garmin" tone="info" />}
                      </View>
                      {w.completedAt && (
                        <Text variant="caption" color="textMuted">
                          {formatDate(w.completedAt)}
                        </Text>
                      )}
                    </View>
                    <Text variant="heading" style={{ color: colors.primary }}>
                      {importSourceId === w.id ? '…' : '↓'}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        </Card>
      )}

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
                <View style={{ marginTop: spacing[2] }}>
                  <Input
                    label="Repos entre séries (sec)"
                    placeholder="Ex : 90"
                    keyboardType="numeric"
                    value={selected[id]!.rest}
                    onChangeText={(v) => update(id, { rest: v })}
                  />
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
