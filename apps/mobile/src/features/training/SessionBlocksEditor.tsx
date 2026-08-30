import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, Input, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { BlockFormat, MuscleGroup } from '@supotsu/core';
import { exerciseImageUrl, MUSCLE_ICON, MUSCLE_LABEL, type Exercise } from '@/features/exercises/catalog';
import { formatLabel, type SessionBlocksBuilder } from './sessionBuilder';

const MUSCLE_ORDER: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'];

interface LastKnown {
  reps?: number;
  weightKg?: number;
  restSec?: number;
}

export interface SessionBlocksEditorProps {
  t: TFunction;
  builder: SessionBlocksBuilder;
  /** Rendered above the Name field — screen-specific extras (import button, quota hint…). */
  headerTop?: React.ReactNode;
  /** Rendered right after the Name field — Visibility / "Ajouter à Mes séances" toggle. */
  headerAfterName?: React.ReactNode;
  /** The exerciser's last known values for one exercise, if any — powers the always-visible "Dernière fois" line. */
  lastKnownFor?: (exerciseId: string) => LastKnown | undefined;
  isCustomExercise: (exerciseId: string) => boolean;
  onCreateExercise: () => void;
  error?: string | null;
  saving: boolean;
  saveLabel: string;
  onSave: () => void;
  cancelLabel: string;
  onCancel: () => void;
}

function Collapsible({
  open,
  onToggle,
  heading,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  heading: string;
  summary?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Card>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text variant="heading">{heading}</Text>
          {summary ? <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{summary}</Text> : null}
        </View>
        <Text variant="heading" style={{ color: colors.textSubtle, transform: [{ rotate: open ? '180deg' : '0deg' }] }}>⌄</Text>
      </Pressable>
      {open ? <View style={{ marginTop: spacing[3] }}>{children}</View> : null}
    </Card>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step,
  unit,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  step: number;
  unit?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const n = Number(value) || 0;
  const bump = (dir: 1 | -1): void => {
    const next = Math.max(0, Math.round((n + dir * step) * 100) / 100);
    onChange(next === 0 ? '' : String(next));
  };
  return (
    <View style={{ flex: 1 }}>
      <Text variant="caption" color="textSubtle" style={{ marginBottom: 4 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceElevated }}>
        <Pressable onPress={() => bump(-1)} hitSlop={8} style={{ width: 34, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" style={{ color: colors.primary, fontWeight: '700' }}>−</Text>
        </Pressable>
        <Text variant="body" style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}>
          {value || '—'}{value && unit ? ` ${unit}` : ''}
        </Text>
        <Pressable onPress={() => bump(1)} hitSlop={8} style={{ width: 34, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" style={{ color: colors.primary, fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Thumb({ exercise, size = 34 }: { exercise: Exercise; size?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const img = exerciseImageUrl(exercise.image);
  return (
    <View style={{ width: size, height: size, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {img ? (
        <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Text style={{ fontSize: size * 0.45 }}>{MUSCLE_ICON[exercise.primary]}</Text>
      )}
    </View>
  );
}

/**
 * The block/exercise editor shared by NewWorkoutScreen, EditWorkoutScreen and
 * SessionBuilderScreen — name, blocks (Musculation/AMRAP/EMOM/Pour le temps),
 * muscle-filtered exercise search with recents, and a draggable selected list
 * with steppers. Owns its own scroll (DraggableFlatList) — screens pass
 * screen-specific chrome via headerTop/headerAfterName instead of wrapping
 * this in their own ScrollView.
 */
export function SessionBlocksEditor({
  t,
  builder,
  headerTop,
  headerAfterName,
  lastKnownFor,
  isCustomExercise,
  onCreateExercise,
  error,
  saving,
  saveLabel,
  onSave,
  cancelLabel,
  onCancel,
}: SessionBlocksEditorProps): React.JSX.Element {
  const { colors } = useTheme();
  const [blocksOpen, setBlocksOpen] = useState(!builder.isSingleStrength);
  const [addOpen, setAddOpen] = useState(true);
  const [selectedOpen, setSelectedOpen] = useState(true);

  const FORMAT_OPTIONS: { value: BlockFormat; label: string }[] = [
    { value: 'strength', label: formatLabel('strength', t) },
    { value: 'amrap', label: formatLabel('amrap', t) },
    { value: 'emom', label: formatLabel('emom', t) },
    { value: 'for_time', label: formatLabel('for_time', t) },
  ];

  const exerciseSubtitle = (ex: Exercise): string =>
    `${isCustomExercise(ex.id) ? t('sport.sessionBuilder.exercise.customPrefix') : ''}${MUSCLE_LABEL[ex.primary]} · ${ex.equipment}`;

  const activeFormat = builder.blocks[builder.activeBlock]?.format ?? 'strength';

  const header = (
    <View style={{ gap: spacing[4] }}>
      {headerTop}

      <Input
        label={t('sport.sessionBuilder.form.nameLabel')}
        placeholder={t('sport.sessionBuilder.form.namePlaceholder')}
        value={builder.name}
        onChangeText={builder.setName}
      />

      {headerAfterName}

      <Collapsible
        open={blocksOpen}
        onToggle={() => setBlocksOpen((v) => !v)}
        heading={t('sport.sessionBuilder.block.heading')}
        summary={t('sport.sessionBuilder.block.summary', { count: builder.blocks.length, format: formatLabel(builder.blocks[0]!.format, t) })}
      >
        <View style={{ gap: spacing[3] }}>
          {builder.blocks.map((b, i) => (
            <Pressable key={i} onPress={() => builder.setActiveBlock(i)}>
              <Card elevated={i === builder.activeBlock} style={i === builder.activeBlock ? { borderColor: colors.primary } : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="caption" style={{ color: '#04140b', fontWeight: '700' }}>{i + 1}</Text>
                    </View>
                    <Text variant="body" style={{ fontWeight: '700' }}>{formatLabel(b.format, t)}</Text>
                  </View>
                  {builder.blocks.length > 1 ? (
                    <Pressable onPress={() => builder.removeBlock(i)} hitSlop={8}>
                      <Text variant="body" style={{ color: colors.error }}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
                {i === builder.activeBlock ? (
                  <>
                    <SegmentedControl options={FORMAT_OPTIONS} value={b.format} onChange={(v) => builder.updateActiveBlock({ format: v })} />
                    {b.format === 'amrap' ? (
                      <Input label={t('sport.sessionBuilder.block.timeCapLabel')} keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => builder.updateActiveBlock({ timeCapSec: v })} />
                    ) : null}
                    {b.format === 'emom' ? (
                      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                        <View style={{ flex: 1 }}>
                          <Input label={t('sport.sessionBuilder.block.intervalLabel')} keyboardType="numeric" value={b.timeCapSec} onChangeText={(v) => builder.updateActiveBlock({ timeCapSec: v })} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Input label={t('sport.sessionBuilder.block.intervalCountLabel')} keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => builder.updateActiveBlock({ targetRounds: v })} />
                        </View>
                      </View>
                    ) : null}
                    {b.format === 'for_time' ? (
                      <Input label={t('sport.sessionBuilder.block.roundsLabel')} keyboardType="numeric" value={b.targetRounds} onChangeText={(v) => builder.updateActiveBlock({ targetRounds: v })} />
                    ) : null}
                  </>
                ) : (
                  <Text variant="caption" color="textSubtle">
                    {t('sport.sessionBuilder.block.exerciseCount', { count: b.order.length })} · {t('sport.sessionBuilder.block.tapToEdit')}
                  </Text>
                )}
              </Card>
            </Pressable>
          ))}
          <Pressable onPress={builder.addBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
              <Text variant="body" color="textMuted">{t('sport.sessionBuilder.block.addBlock')}</Text>
            </View>
          </Pressable>
        </View>
      </Collapsible>

      <Collapsible
        open={addOpen}
        onToggle={() => setAddOpen((v) => !v)}
        heading={t('sport.sessionBuilder.addExercise.title')}
        summary={builder.blocks.length > 1 ? t('sport.sessionBuilder.addExercise.activeBlock', { n: builder.activeBlock + 1, format: formatLabel(activeFormat, t) }) : t('sport.sessionBuilder.addExercise.resultCount', { count: builder.searchResults.length })}
      >
        <Input
          label={t('sport.sessionBuilder.addExercise.searchLabel')}
          placeholder={t('sport.sessionBuilder.addExercise.searchPlaceholder')}
          value={builder.query}
          onChangeText={builder.setQuery}
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] }}>
          <Pressable
            onPress={() => builder.setMuscleFilter('all')}
            style={{
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.full,
              backgroundColor: builder.muscleFilter === 'all' ? colors.primary : colors.surfaceElevated,
              borderWidth: 1, borderColor: builder.muscleFilter === 'all' ? colors.primary : colors.border,
            }}
          >
            <Text variant="caption" style={{ color: builder.muscleFilter === 'all' ? colors.onPrimary : colors.text, fontWeight: '700' }}>
              {t('sport.sessionBuilder.addExercise.allMuscles')}
            </Text>
          </Pressable>
          {MUSCLE_ORDER.map((m) => {
            const active = builder.muscleFilter === m;
            return (
              <Pressable
                key={m}
                onPress={() => builder.setMuscleFilter(m)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.full,
                  backgroundColor: active ? colors.primary : colors.surfaceElevated,
                  borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text variant="caption" style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '700' }}>
                  {MUSCLE_LABEL[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {builder.recentExercises.length > 0 ? (
          <>
            <Text variant="label" color="textMuted" style={{ marginTop: spacing[4] }}>
              {t('sport.sessionBuilder.addExercise.recentHeading')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
              {builder.recentExercises.map((ex) => (
                <Pressable
                  key={ex.id}
                  onPress={() => builder.addExercise(ex.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
                >
                  <Thumb exercise={ex} size={22} />
                  <Text variant="caption" style={{ fontWeight: '600' }}>{ex.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text variant="label" color="textMuted" style={{ marginTop: spacing[4] }}>
          {t('sport.sessionBuilder.addExercise.resultsHeading')}
        </Text>
        {builder.searchResults.length === 0 ? (
          <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
            {t('sport.sessionBuilder.addExercise.noResults', { query: builder.query })}{' '}
            <Text variant="caption" color="primary" onPress={onCreateExercise}>
              {t('sport.sessionBuilder.addExercise.createLink')}
            </Text>
          </Text>
        ) : (
          <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
            {builder.searchResults.map((ex) => (
              <Pressable key={ex.id} onPress={() => builder.addExercise(ex.id)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                    <Thumb exercise={ex} />
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
        )}
      </Collapsible>

      <Pressable onPress={() => setSelectedOpen((v) => !v)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="heading">
            {builder.activeOrder.length > 0 ? t('sport.sessionBuilder.session.titleWithCount', { count: builder.activeOrder.length }) : t('sport.sessionBuilder.session.title')}
          </Text>
          <Text variant="heading" style={{ color: colors.textSubtle, transform: [{ rotate: selectedOpen ? '180deg' : '0deg' }] }}>⌄</Text>
        </View>
      </Pressable>
      {!selectedOpen ? null : builder.activeOrder.length === 0 ? (
        <Text variant="caption" color="textSubtle">{t('sport.sessionBuilder.session.emptyHint')}</Text>
      ) : null}
    </View>
  );

  const renderSelectedRow = ({ item: exerciseId, drag, isActive }: RenderItemParams<string>): React.JSX.Element | null => {
    const ex = builder.byId.get(exerciseId);
    if (!ex) return null;
    const draft = builder.activeSelected[exerciseId]!;
    const known = lastKnownFor?.(exerciseId);
    const isStrength = activeFormat === 'strength';
    return (
      <View style={{ opacity: isActive ? 0.6 : 1, backgroundColor: isActive ? colors.surfaceElevated : 'transparent', borderRadius: radii.lg, paddingHorizontal: spacing[1] }}>
        <Card style={{ marginBottom: spacing[2] }} elevated>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Pressable onLongPress={drag} disabled={isActive} hitSlop={10} style={{ padding: 2 }}>
              <Text style={{ fontSize: 16 }} color="textSubtle">☰</Text>
            </Pressable>
            <Thumb exercise={ex} />
            <View style={{ flex: 1 }}>
              <Text variant="subtitle">{ex.name}</Text>
              <Text variant="caption" color="textMuted">{exerciseSubtitle(ex)}</Text>
            </View>
            <Pressable onPress={() => builder.removeExercise(exerciseId)} hitSlop={8}>
              <Text variant="heading" style={{ color: colors.error }}>×</Text>
            </Pressable>
          </View>

          {known && (known.reps != null || known.weightKg != null) ? (
            <Pressable
              onPress={() => builder.updateExercise(exerciseId, {
                reps: known.reps != null ? String(known.reps) : draft.reps,
                weight: known.weightKg != null ? String(known.weightKg) : draft.weight,
              })}
              style={{ marginTop: spacing[2] }}
            >
              <Text variant="caption" style={{ color: colors.accentData, fontWeight: '600' }}>
                {t('sport.sessionBuilder.set.lastTime', {
                  value: [
                    known.reps != null ? t('sport.sessionBuilder.set.repsShort', { count: known.reps }) : null,
                    known.weightKg != null ? `${known.weightKg} kg` : null,
                  ].filter(Boolean).join(' × '),
                })}
              </Text>
            </Pressable>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
            <Stepper label={t('sport.sessionBuilder.set.repsLabel')} value={draft.reps} step={1} onChange={(v) => builder.updateExercise(exerciseId, { reps: v })} />
            {isStrength ? (
              <Stepper label={t('sport.sessionBuilder.set.weightLabel')} value={draft.weight} step={2.5} unit="kg" onChange={(v) => builder.updateExercise(exerciseId, { weight: v })} />
            ) : null}
          </View>
          {isStrength ? (
            <View style={{ marginTop: spacing[2] }}>
              <Stepper label={t('sport.sessionBuilder.set.restLabel')} value={draft.rest} step={15} unit="s" onChange={(v) => builder.updateExercise(exerciseId, { rest: v })} />
            </View>
          ) : null}
        </Card>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <DraggableFlatList
        style={{ flex: 1 }}
        containerStyle={{ flex: 1 }}
        data={selectedOpen ? builder.activeOrder : []}
        keyExtractor={(id) => id}
        renderItem={renderSelectedRow}
        onDragEnd={({ from, to }) => builder.reorderExercise(from, to)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: spacing[3], gap: spacing[2] }}
      />
      <View style={{ paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
        {error ? <Badge label={error} tone="error" /> : null}
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: error ? spacing[2] : 0 }}>
          <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
          <View style={{ flex: 1 }}>
            <Button label={saving ? '…' : saveLabel} onPress={onSave} disabled={saving} fullWidth />
          </View>
        </View>
      </View>
    </View>
  );
}
