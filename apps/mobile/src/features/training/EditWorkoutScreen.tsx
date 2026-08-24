import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, EmptyState, Icon, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { BlockFormat } from '@supotsu/core';
import { EXERCISES, MUSCLE_LABEL, toCatalogExercise, type Exercise } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { useCustomExercises, useEditCircuitWorkout, useEditWorkout, useWorkoutBlocks, useWorkoutSets, useWorkouts } from '@/lib/data/queries';

const LIMIT = 60;

function formatLabel(format: BlockFormat, t: TFunction): string {
  if (format === 'strength') return t('sport.newWorkout.blockFormat.strength');
  if (format === 'for_time') return t('sport.newWorkout.blockFormat.forTime');
  if (format === 'amrap') return 'AMRAP';
  return 'EMOM';
}

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

/** Edit an existing session's name and exercise list — same search-to-add UI as Nouvelle séance, pre-filled from the current sets. */
export function EditWorkoutScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: workouts = [], isLoading: loadingWorkout } = useWorkouts();
  const { data: existingSets, isLoading: loadingSets } = useWorkoutSets(id);
  const { data: existingBlocks, isLoading: loadingBlocks } = useWorkoutBlocks(id);
  const { data: customExercises = [] } = useCustomExercises();
  const editWorkout = useEditWorkout();
  const editCircuitWorkout = useEditCircuitWorkout();

  const FORMAT_OPTIONS: { value: BlockFormat; label: string }[] = useMemo(
    () => [
      { value: 'strength', label: formatLabel('strength', t) },
      { value: 'amrap', label: formatLabel('amrap', t) },
      { value: 'emom', label: formatLabel('emom', t) },
      { value: 'for_time', label: formatLabel('for_time', t) },
    ],
    [t],
  );

  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  // Flat (single exercise list) mode — a plain strength session with no blocks.
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, SetDraft>>({});
  // Block mode — a circuit session (AMRAP/EMOM/Pour le temps/multi-block strength).
  const [isCircuit, setIsCircuit] = useState(false);
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [activeBlock, setActiveBlock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const updateActiveBlock = (patch: Partial<BlockDraft>): void => {
    setBlocks((prev) => prev.map((b, i) => (i === activeBlock ? { ...b, ...patch } : b)));
  };
  const addBlock = (): void => {
    setBlocks((prev) => [...prev, emptyBlock()]);
    setActiveBlock(blocks.length);
  };
  const removeBlock = (index: number): void => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setActiveBlock(0);
  };

  // The list currently being edited — the active block's when this session
  // has blocks, otherwise the flat single list.
  const activeOrder = isCircuit ? (blocks[activeBlock]?.order ?? []) : order;
  const activeSelected = isCircuit ? (blocks[activeBlock]?.selected ?? {}) : selected;

  const allExercises = useMemo(() => [...customExercises.map(toCatalogExercise), ...EXERCISES], [customExercises]);
  const byId = useMemo(() => new Map(allExercises.map((ex) => [ex.id, ex])), [allExercises]);
  const isCustom = (exId: string): boolean => exId.startsWith('custom-');

  // Pre-fill once the workout, its sets and its blocks have all loaded.
  // A session with blocks pre-fills into `blocks` (grouped by blockId);
  // otherwise it's the flat single-list path, exactly as before.
  useEffect(() => {
    if (prefilled || !workout || !existingSets || !existingBlocks) return;
    setName(workout.name);
    if (existingBlocks.length > 0) {
      setIsCircuit(true);
      setBlocks(
        existingBlocks.map((b) => {
          const blockSets = existingSets.filter((s) => s.blockId === b.id).sort((a, c) => a.order - c.order);
          const nextOrder: string[] = [];
          const nextSelected: Record<string, SetDraft> = {};
          for (const s of blockSets) {
            if (!nextSelected[s.exerciseId]) {
              nextOrder.push(s.exerciseId);
              nextSelected[s.exerciseId] = {
                reps: s.reps != null ? String(s.reps) : '',
                weight: s.weightKg != null ? String(s.weightKg) : '',
                rest: s.restSec != null ? String(s.restSec) : '',
              };
            }
          }
          return {
            format: b.format,
            timeCapSec: b.timeCapSec != null ? String(b.format === 'amrap' ? Math.round(b.timeCapSec / 60) : b.timeCapSec) : '12',
            targetRounds: b.targetRounds != null ? String(b.targetRounds) : '10',
            order: nextOrder,
            selected: nextSelected,
          };
        }),
      );
    } else {
      const nextOrder: string[] = [];
      const nextSelected: Record<string, SetDraft> = {};
      for (const s of existingSets) {
        if (!nextSelected[s.exerciseId]) {
          nextOrder.push(s.exerciseId);
          nextSelected[s.exerciseId] = {
            reps: s.reps != null ? String(s.reps) : '',
            weight: s.weightKg != null ? String(s.weightKg) : '',
            rest: s.restSec != null ? String(s.restSec) : '',
          };
        }
      }
      setOrder(nextOrder);
      setSelected(nextSelected);
    }
    setPrefilled(true);
  }, [prefilled, workout, existingSets, existingBlocks]);

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? allExercises
        .filter(
          (ex) =>
            !activeSelected[ex.id] &&
            (ex.name.toLowerCase().includes(q) || MUSCLE_LABEL[ex.primary].toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q)),
        )
        .slice(0, LIMIT)
    : [];

  const add = (exId: string): void => {
    if (isCircuit) {
      updateActiveBlock({ selected: { ...activeSelected, [exId]: { reps: '', weight: '', rest: '' } }, order: [...activeOrder, exId] });
    } else {
      setSelected((prev) => ({ ...prev, [exId]: { reps: '', weight: '', rest: '' } }));
      setOrder((prev) => [...prev, exId]);
    }
    setQuery('');
  };
  const remove = (exId: string): void => {
    if (isCircuit) {
      const nextSelected = { ...activeSelected };
      delete nextSelected[exId];
      updateActiveBlock({ selected: nextSelected, order: activeOrder.filter((x) => x !== exId) });
    } else {
      setSelected((prev) => {
        const next = { ...prev };
        delete next[exId];
        return next;
      });
      setOrder((prev) => prev.filter((x) => x !== exId));
    }
  };
  const update = (exId: string, patch: Partial<SetDraft>): void => {
    if (isCircuit) {
      updateActiveBlock({ selected: { ...activeSelected, [exId]: { ...activeSelected[exId]!, ...patch } } });
    } else {
      setSelected((prev) => ({ ...prev, [exId]: { ...prev[exId]!, ...patch } }));
    }
  };

  const submit = async (): Promise<void> => {
    setError(null);
    if (!workout) return;
    if (isCircuit) {
      if (!name.trim() || blocks.every((b) => b.order.length === 0)) {
        setError(t('sport.editWorkout.errors.missingFields'));
        return;
      }
      try {
        await editCircuitWorkout.mutateAsync({
          workoutId: workout.id,
          name: name.trim(),
          notes: workout.notes,
          blocks: blocks.map((b) => ({
            format: b.format,
            timeCapSec: b.format === 'amrap' ? (Number(b.timeCapSec) || 0) * 60 || undefined : b.format === 'emom' ? Number(b.timeCapSec) || undefined : undefined,
            targetRounds: b.format === 'emom' || b.format === 'for_time' ? Number(b.targetRounds) || undefined : undefined,
            sets: b.order.map((exerciseId, index) => {
              const s = b.selected[exerciseId]!;
              return {
                exerciseId,
                order: index,
                reps: s.reps ? Number(s.reps) : undefined,
                weightKg: b.format === 'strength' && s.weight ? Number(s.weight) : undefined,
                restSec: b.format === 'strength' && s.rest ? Number(s.rest) : undefined,
              };
            }),
          })),
        });
        router.back();
      } catch {
        setError(t('sport.editWorkout.errors.saveFailed'));
      }
      return;
    }
    if (!name.trim() || order.length === 0) {
      setError(t('sport.editWorkout.errors.missingFields'));
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
      await editWorkout.mutateAsync({ workoutId: workout.id, name: name.trim(), notes: workout.notes, sets });
      router.back();
    } catch {
      setError(t('sport.editWorkout.errors.saveFailed'));
    }
  };

  const isSaving = editWorkout.isPending || editCircuitWorkout.isPending;

  const exerciseSubtitle = (ex: Exercise): string =>
    `${isCustom(ex.id) ? t('sport.editWorkout.exercise.customPrefix') : ''}${[ex.primary, ...ex.secondary].map((m) => MUSCLE_LABEL[m]).join(', ')} · ${ex.equipment}`;

  if (loadingWorkout || loadingSets || loadingBlocks) {
    return (
      <Screen scroll>
        <Text variant="body" color="textMuted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (!workout) {
    return (
      <Screen scroll>
        <EmptyState icon={<Icon name="dumbbell" size={44} color={colors.textSubtle} />} title={t('sport.editWorkout.notFound.title')} actionLabel={t('common.back')} onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{t('sport.editWorkout.title')}</Text>
      <Input
        label={t('sport.editWorkout.form.nameLabel')}
        placeholder={t('sport.editWorkout.form.namePlaceholder')}
        value={name}
        onChangeText={setName}
      />

      {isCircuit ? (
        <View style={{ gap: spacing[3] }}>
          {blocks.map((b, i) => (
            <Pressable key={i} onPress={() => setActiveBlock(i)}>
              <Card elevated={i === activeBlock} style={i === activeBlock ? { borderColor: colors.primary } : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="caption" style={{ color: '#04140b', fontWeight: '700' }}>{i + 1}</Text>
                    </View>
                    <Text variant="body" style={{ fontWeight: '700' }}>{formatLabel(b.format, t)}</Text>
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
                      <Input label={t('sport.newWorkout.block.timeCapLabel')} keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => updateActiveBlock({ timeCapSec: v })} />
                    ) : null}
                    {b.format === 'emom' ? (
                      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                        <View style={{ flex: 1 }}>
                          <Input label={t('sport.newWorkout.block.intervalLabel')} keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => updateActiveBlock({ timeCapSec: v })} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Input label={t('sport.newWorkout.block.intervalCountLabel')} keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => updateActiveBlock({ targetRounds: v })} />
                        </View>
                      </View>
                    ) : null}
                    {b.format === 'for_time' ? (
                      <Input label={t('sport.newWorkout.block.roundsLabel')} keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => updateActiveBlock({ targetRounds: v })} />
                    ) : null}
                  </>
                ) : (
                  <Text variant="caption" color="textSubtle">{t('sport.newWorkout.block.exerciseCount', { count: b.order.length })}</Text>
                )}
              </Card>
            </Pressable>
          ))}
          <Pressable onPress={addBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
              <Text variant="body" color="textMuted">{t('sport.newWorkout.block.addBlock')}</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      <Text variant="heading">{t('sport.editWorkout.addExercise.title')}</Text>
      <Input
        label={t('sport.editWorkout.addExercise.searchLabel')}
        placeholder={t('sport.editWorkout.addExercise.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
      />
      {q ? (
        searchResults.length === 0 ? (
          <Text variant="caption" color="textSubtle">{t('sport.editWorkout.addExercise.noResults', { query })}</Text>
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
        {activeOrder.length > 0 ? t('sport.editWorkout.session.titleWithCount', { count: activeOrder.length }) : t('sport.editWorkout.session.title')}
      </Text>
      {activeOrder.length === 0 ? (
        <Text variant="caption" color="textSubtle">{t('sport.editWorkout.session.emptyHint')}</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {activeOrder.map((exId) => {
            const ex = byId.get(exId);
            if (!ex) return null;
            const activeFormat = isCircuit ? blocks[activeBlock]!.format : 'strength';
            return (
              <Card key={exId} elevated>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="subtitle">{ex.name}</Text>
                    <Text variant="caption" color="textMuted">{exerciseSubtitle(ex)}</Text>
                  </View>
                  <Pressable onPress={() => remove(exId)} hitSlop={8}>
                    <Text variant="heading" style={{ color: colors.error }}>×</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[2] }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label={t('sport.editWorkout.set.repsLabel')}
                      keyboardType="numeric"
                      value={activeSelected[exId]!.reps}
                      onChangeText={(v) => update(exId, { reps: v })}
                    />
                  </View>
                  {activeFormat === 'strength' ? (
                    <View style={{ flex: 1 }}>
                      <Input
                        label={t('sport.editWorkout.set.weightLabel')}
                        keyboardType="numeric"
                        value={activeSelected[exId]!.weight}
                        onChangeText={(v) => update(exId, { weight: v })}
                      />
                    </View>
                  ) : null}
                </View>
                {activeFormat === 'strength' ? (
                  <View style={{ marginTop: spacing[2] }}>
                    <Input
                      label={t('sport.editWorkout.set.restLabel')}
                      placeholder={t('sport.editWorkout.set.restPlaceholder')}
                      keyboardType="numeric"
                      value={activeSelected[exId]!.rest}
                      onChangeText={(v) => update(exId, { rest: v })}
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
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={isSaving ? '…' : t('sport.editWorkout.form.submit')}
          onPress={submit}
          disabled={isSaving}
        />
      </View>
    </Screen>
  );
}
