import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { suggestProgression } from '@supotsu/engines';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import type { BlockFormat } from '@supotsu/core';
import { EXERCISES, MUSCLE_LABEL, toCatalogExercise, type Exercise } from '@/features/exercises/catalog';
import { useAddCircuitWorkout, useAddWorkout, useCustomExercises, useExerciseHistory, useWorkouts, useWorkoutSets } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const LIMIT = 60;
/** Name Garmin imports are stored under (repository.ts upsertImportedWorkouts) — flags the badge below. */
const GARMIN_IMPORT_NAME = 'Musculation (import Garmin)';

const FORMAT_OPTIONS: { value: BlockFormat; label: string }[] = [
  { value: 'strength', label: 'Musculation' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
  { value: 'for_time', label: 'Pour le temps' },
];
const FORMAT_LABEL: Record<BlockFormat, string> = { strength: 'Musculation', amrap: 'AMRAP', emom: 'EMOM', for_time: 'Pour le temps' };

interface SetDraft {
  reps: string;
  weight: string;
  rest: string;
}

interface BlockDraft {
  format: BlockFormat;
  timeCapSec: string;
  targetRounds: string;
  order: string[];
  selected: Record<string, SetDraft>;
}

const emptyBlock = (): BlockDraft => ({ format: 'strength', timeCapSec: '12', targetRounds: '10', order: [], selected: {} });

/**
 * Create a session plan: name, one or more blocks (Musculation/AMRAP/EMOM/
 * Pour le temps), each with its own search + add exercises, set target
 * reps/charge. It's saved "planned" — the muscle map, ACWR etc. only count
 * it once the user actually marks it done from Planification (or runs it
 * live via CircuitRunnerScreen for a circuit-format session).
 */
export function NewWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ openPicker?: string }>();
  const addWorkout = useAddWorkout();
  const addCircuitWorkout = useAddCircuitWorkout();
  const { data: history = {} } = useExerciseHistory();
  const { data: customExercises = [] } = useCustomExercises();
  const { data: allWorkouts = [] } = useWorkouts();

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [blocks, setBlocks] = useState<BlockDraft[]>([emptyBlock()]);
  const [activeBlock, setActiveBlock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(params.openPicker === '1');
  const [importSourceId, setImportSourceId] = useState<string | undefined>();

  const order = blocks[activeBlock]!.order;
  const selected = blocks[activeBlock]!.selected;
  const updateActiveBlock = (patch: Partial<BlockDraft>): void => {
    setBlocks((prev) => prev.map((b, i) => (i === activeBlock ? { ...b, ...patch } : b)));
  };

  const allExercises = useMemo(() => [...customExercises.map(toCatalogExercise), ...EXERCISES], [customExercises]);
  // Lookup used to resolve an exercise id to its card (name, muscles…) — wider
  // than `allExercises` (the search/pick surface) on purpose: it also covers
  // EXERCISE_LIBRARY ids that aren't offered in manual search (e.g.
  // ex-garmin-*, auto-mapped from a Garmin import), so a resumed/imported
  // session still resolves instead of silently dropping every row.
  const byId = useMemo(() => {
    const map = new Map(allExercises.map((ex) => [ex.id, ex]));
    for (const ex of EXERCISE_LIBRARY) if (!map.has(ex.id)) map.set(ex.id, toCatalogExercise(ex));
    return map;
  }, [allExercises]);
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
  // Un import démarre toujours une séance à un seul bloc musculation (les séances
  // reprises/importées, notamment Garmin, sont toujours de ce format aujourd'hui).
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
    setBlocks([{ ...emptyBlock(), order: nextOrder, selected: nextSelected }]);
    setActiveBlock(0);
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
    updateActiveBlock({ selected: { ...selected, [id]: { reps: '', weight: '', rest: '' } }, order: [...order, id] });
    setQuery('');
  };
  const remove = (id: string): void => {
    const nextSelected = { ...selected };
    delete nextSelected[id];
    updateActiveBlock({ selected: nextSelected, order: order.filter((x) => x !== id) });
  };
  const update = (id: string, patch: Partial<SetDraft>): void => {
    updateActiveBlock({ selected: { ...selected, [id]: { ...selected[id], ...patch } } });
  };

  const addBlock = (): void => {
    setBlocks((prev) => [...prev, emptyBlock()]);
    setActiveBlock(blocks.length);
  };
  const removeBlock = (index: number): void => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setActiveBlock(0);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (!name.trim()) {
      setError('Donne un nom à ta séance.');
      return;
    }
    if (blocks.every((b) => b.order.length === 0)) {
      setError('Ajoute au moins un exercice.');
      return;
    }
    const isSingleStrength = blocks.length === 1 && blocks[0]!.format === 'strength';
    try {
      if (isSingleStrength) {
        await addWorkout.mutateAsync({
          name: name.trim(),
          sets: blocks[0]!.order.map((id, i) => {
            const s = blocks[0]!.selected[id]!;
            return {
              exerciseId: id,
              order: i,
              reps: s.reps ? Number(s.reps) : undefined,
              weightKg: s.weight ? Number(s.weight) : undefined,
              restSec: s.rest ? Number(s.rest) : undefined,
            };
          }),
        });
      } else {
        await addCircuitWorkout.mutateAsync({
          name: name.trim(),
          blocks: blocks.map((b) => ({
            format: b.format,
            // AMRAP's field is minutes ("Temps limite (min)"); EMOM's is already seconds ("Intervalle (s)") — timeCapSec is always stored in seconds.
            timeCapSec: b.format === 'amrap' ? (Number(b.timeCapSec) || 0) * 60 || undefined : b.format === 'emom' ? Number(b.timeCapSec) || undefined : undefined,
            targetRounds: b.format === 'emom' || b.format === 'for_time' ? Number(b.targetRounds) || undefined : undefined,
            sets: b.order.map((id, i) => {
              const s = b.selected[id]!;
              return {
                exerciseId: id,
                order: i,
                reps: s.reps ? Number(s.reps) : undefined,
                weightKg: b.format === 'strength' && s.weight ? Number(s.weight) : undefined,
                restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
              };
            }),
          })),
        });
      }
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  const isPending = addWorkout.isPending || addCircuitWorkout.isPending;

  const exerciseSubtitle = (ex: Exercise): string =>
    `${isCustom(ex.id) ? '✨ Perso · ' : ''}${[ex.primary, ...ex.secondary].map((m) => MUSCLE_LABEL[m]).join(', ')} · ${ex.equipment}`;

  return (
    <Screen scroll>
      <Text variant="title">Nouvelle séance</Text>
      <Text variant="caption" color="textMuted">
        Enchaîne plusieurs formats dans la même séance — chaque bloc a son propre chrono.
      </Text>

      <View style={{ marginTop: spacing[2], alignItems: 'flex-start' }}>
        <Button
          label={pickerOpen ? 'Fermer' : 'Importer une séance déjà faite (ex : Garmin)'}
          variant="secondary"
          onPress={() => setPickerOpen((v) => !v)}
        />
      </View>
      {pickerOpen && (
        <Card style={{ marginTop: spacing[2] }}>
          <Text variant="heading">Reprendre une séance déjà faite</Text>
          <Text variant="caption" color="textMuted" style={{ marginBottom: spacing[2] }}>
            Préremplit le nom et les exercices — tu peux tout modifier avant de créer.
          </Text>
          {pastWorkouts.length === 0 ? (
            <Text variant="body" color="textMuted">
              Aucune séance à reprendre pour l'instant. Importe ton historique Garmin depuis
              Profil › Données & intégrations › Importer un fichier, puis reviens ici.
            </Text>
          ) : (
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
          )}
        </Card>
      )}

      <Input
        label="Nom de la séance"
        placeholder="Ex : Push A"
        value={name}
        onChangeText={setName}
      />

      <View style={{ gap: spacing[3] }}>
        {blocks.map((b, i) => (
          <Pressable key={i} onPress={() => setActiveBlock(i)}>
            <Card elevated={i === activeBlock} style={i === activeBlock ? { borderColor: colors.primary } : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text variant="caption" style={{ color: '#04140b', fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text variant="body" style={{ fontWeight: '700' }}>{FORMAT_LABEL[b.format]}</Text>
                </View>
                {blocks.length > 1 ? (
                  <Pressable onPress={() => removeBlock(i)} hitSlop={8}>
                    <Text variant="body" style={{ color: colors.error }}>×</Text>
                  </Pressable>
                ) : null}
              </View>
              {i === activeBlock ? (
                <>
                  <SegmentedControl options={FORMAT_OPTIONS} value={b.format} onChange={(v) => updateActiveBlock({ format: v })} />
                  {b.format === 'amrap' ? (
                    <Input label="Temps limite (min)" keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => updateActiveBlock({ timeCapSec: v })} />
                  ) : null}
                  {b.format === 'emom' ? (
                    <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                      <View style={{ flex: 1 }}>
                        <Input label="Intervalle (s)" keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => updateActiveBlock({ timeCapSec: v })} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Input label="Nombre d'intervalles" keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => updateActiveBlock({ targetRounds: v })} />
                      </View>
                    </View>
                  ) : null}
                  {b.format === 'for_time' ? (
                    <Input label="Nombre de rounds" keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => updateActiveBlock({ targetRounds: v })} />
                  ) : null}
                </>
              ) : (
                <Text variant="caption" color="textSubtle">{b.order.length} exercice{b.order.length > 1 ? 's' : ''}</Text>
              )}
            </Card>
          </Pressable>
        ))}
        <Pressable onPress={addBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
            <Text variant="body" color="textMuted">+ Ajouter un bloc</Text>
          </View>
        </Pressable>
      </View>

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
            const activeFormat = blocks[activeBlock]!.format;
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

                {activeFormat === 'strength' &&
                  (() => {
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
                  {activeFormat === 'strength' ? (
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Charge (kg)"
                        keyboardType="numeric"
                        value={selected[id]!.weight}
                        onChangeText={(v) => update(id, { weight: v })}
                      />
                    </View>
                  ) : null}
                </View>
                {activeFormat === 'strength' ? (
                  <View style={{ marginTop: spacing[2] }}>
                    <Input
                      label="Repos entre séries (sec)"
                      placeholder="Ex : 90"
                      keyboardType="numeric"
                      value={selected[id]!.rest}
                      onChangeText={(v) => update(id, { rest: v })}
                    />
                  </View>
                ) : null}
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
          label={isPending ? '…' : 'Créer la séance'}
          onPress={submit}
          disabled={isPending}
        />
      </View>
    </Screen>
  );
}
