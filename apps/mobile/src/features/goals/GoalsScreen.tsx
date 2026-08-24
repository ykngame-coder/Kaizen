import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Gradient,
  Icon,
  Input,
  Screen,
  SegmentedControl,
  Sparkline,
  Text,
  useTheme,
} from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { Goal, GoalType, HealthMetricType } from '@supotsu/core';
import type { GoalInput } from '@supotsu/shared';
import {
  computeGoalProgress,
  projectTargetDate,
  summarizeTrend,
  weightTrend,
} from '@supotsu/engines';
import { useAddGoal, useDeleteGoal, useGoals, useHealthMetrics, useUpdateGoal, useUpdateGoalCurrent } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { formatWeight, usePreferences } from '@/lib/preferences';
import { DatePickerModal } from '@/features/navigation/DatePickerModal';

type TypeOption = { value: GoalType; label: string };
function typeOptions(t: TFunction): TypeOption[] {
  return [
    { value: 'body_composition', label: t('sport.goals.screen.typeOptions.bodyComposition') },
    { value: 'performance', label: t('sport.goals.screen.typeOptions.performance') },
    { value: 'strength', label: t('sport.goals.screen.typeOptions.strength') },
    { value: 'endurance', label: t('sport.goals.screen.typeOptions.endurance') },
    { value: 'health', label: t('sport.goals.screen.typeOptions.health') },
    { value: 'habit', label: t('sport.goals.screen.typeOptions.habit') },
  ];
}

/** The primary-goal archetypes from the mockup — one active selection. */
type Archetype = { key: string; emoji: string; name: string; desc: string };
function archetypes(t: TFunction): Archetype[] {
  return [
    { key: 'fat_loss', emoji: '🔥', name: t('sport.goals.screen.archetypes.fatLoss.name'), desc: t('sport.goals.screen.archetypes.fatLoss.desc') },
    { key: 'muscle', emoji: '💪', name: t('sport.goals.screen.archetypes.muscle.name'), desc: t('sport.goals.screen.archetypes.muscle.desc') },
    { key: 'hyrox', emoji: '🏃', name: t('sport.goals.screen.archetypes.hyrox.name'), desc: t('sport.goals.screen.archetypes.hyrox.desc') },
    { key: 'marathon', emoji: '🏅', name: t('sport.goals.screen.archetypes.marathon.name'), desc: t('sport.goals.screen.archetypes.marathon.desc') },
    { key: 'sleep', emoji: '😴', name: t('sport.goals.screen.archetypes.sleep.name'), desc: t('sport.goals.screen.archetypes.sleep.desc') },
    { key: 'stress', emoji: '🧘', name: t('sport.goals.screen.archetypes.stress.name'), desc: t('sport.goals.screen.archetypes.stress.desc') },
  ];
}

function latestMetric(m: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  return m.filter((x) => x.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
}

function ProgressBar({ pct, color }: { pct: number; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

/** Selectable primary-goal tile. Gradient border when active. */
function ArchetypeTile({ item, active, onPress }: { item: Archetype; active: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const inner = (
    <View style={{ backgroundColor: colors.surface, borderRadius: radii.lg - 1.5, padding: spacing[4], minHeight: 108 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
        {active ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <Gradient fill />
            <Text style={{ color: colors.onGradient, fontSize: 11 }}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text variant="body" style={{ fontWeight: '700', marginTop: spacing[2] }}>
        {item.name}
      </Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2, lineHeight: 15 }}>
        {item.desc}
      </Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {active ? (
        <Gradient style={{ borderRadius: radii.lg, padding: 1.5 }}>{inner}</Gradient>
      ) : (
        <View style={{ borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border }}>{inner}</View>
      )}
    </Pressable>
  );
}

function GoalCard({ goal }: { goal: Goal }): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const typeOpts = useMemo(() => typeOptions(t), [t]);
  const update = useUpdateGoalCurrent();
  const editGoal = useUpdateGoal();
  const removeGoal = useDeleteGoal();
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editType, setEditType] = useState<GoalType>(goal.type);
  const [editTitle, setEditTitle] = useState(goal.title);
  const [editTarget, setEditTarget] = useState(goal.targetValue !== undefined ? String(goal.targetValue) : '');
  const [editUnit, setEditUnit] = useState(goal.targetUnit ?? '');
  const progress = computeGoalProgress(goal, goal.startValue);
  const pct = Math.round(progress * 100);
  const done = goal.status === 'achieved';

  const submit = (): void => {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    update.mutate({ goalId: goal.id, currentValue: n }, { onSuccess: () => setValue('') });
  };

  const openEdit = (): void => {
    setEditType(goal.type);
    setEditTitle(goal.title);
    setEditTarget(goal.targetValue !== undefined ? String(goal.targetValue) : '');
    setEditUnit(goal.targetUnit ?? '');
    setEditing(true);
  };

  const saveEdit = (): void => {
    if (!editTitle.trim()) return;
    editGoal.mutate(
      {
        goalId: goal.id,
        title: editTitle.trim(),
        type: editType,
        targetValue: editTarget ? Number(editTarget.replace(',', '.')) : undefined,
        targetUnit: editUnit.trim() || undefined,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <Card>
        <Text variant="heading">{t('sport.goals.screen.goalCard.edit')}</Text>
        <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
          <SegmentedControl options={typeOpts} value={editType} onChange={setEditType} />
          <Input label={t('sport.goals.screen.goalCard.titleLabel')} value={editTitle} onChangeText={setEditTitle} />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Input label={t('sport.goals.screen.goalCard.targetLabel')} value={editTarget} onChangeText={setEditTarget} keyboardType="numeric" />
            </View>
            <View style={{ width: 72 }}>
              <Input label={t('sport.goals.screen.goalCard.unitLabel')} value={editUnit} onChangeText={setEditUnit} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setEditing(false)} />
            <Button
              label={editGoal.isPending ? '…' : t('common.save')}
              onPress={saveEdit}
              disabled={!editTitle.trim() || editGoal.isPending}
            />
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="subtitle" style={{ flex: 1 }}>{goal.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          {done ? <Badge label={t('sport.goals.screen.goalCard.achieved')} tone="success" /> : <Badge label={`${pct}%`} tone="info" />}
          <Pressable onPress={openEdit} hitSlop={8} accessibilityLabel={t('sport.goals.screen.goalCard.edit')}>
            <Icon name="pencil" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setConfirmingDelete(true)} hitSlop={8} accessibilityLabel={t('sport.goals.screen.goalCard.deleteA11y')}>
            <Icon name="trash" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
      {goal.targetValue !== undefined && (
        <Text variant="caption" color="textMuted">
          {goal.currentValue ?? goal.startValue ?? '—'} → {goal.targetValue} {goal.targetUnit ?? ''}
        </Text>
      )}
      <View style={{ marginTop: spacing[2] }}>
        <ProgressBar pct={pct} color={done ? colors.success : colors.primary} />
      </View>
      {goal.deadline && (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {t('sport.goals.screen.goalCard.deadline', { date: formatDate(goal.deadline) })}
        </Text>
      )}
      {confirmingDelete ? (
        <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
          <Text variant="body">{t('sport.goals.screen.goalCard.deleteConfirm')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => setConfirmingDelete(false)} />
            <Button
              label={removeGoal.isPending ? '…' : t('sport.goals.screen.goalCard.delete')}
              variant="danger"
              onPress={() => removeGoal.mutate(goal.id)}
              disabled={removeGoal.isPending}
            />
          </View>
        </View>
      ) : (
        !done &&
        goal.targetValue !== undefined && (
          <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end', marginTop: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Input
                label={t('sport.goals.screen.goalCard.currentValueLabel')}
                placeholder={String(goal.currentValue ?? '')}
                value={value}
                onChangeText={setValue}
                keyboardType="numeric"
              />
            </View>
            <Button label={update.isPending ? '…' : t('sport.goals.screen.goalCard.updateButton')} onPress={submit} />
          </View>
        )
      )}
    </Card>
  );
}

/** Objectifs (mockup #17): primary goal, body targets, tracked goals, priorities. */
export function GoalsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const typeOpts = useMemo(() => typeOptions(t), [t]);
  const archetypeList = useMemo(() => archetypes(t), [t]);
  const { data: goals = [], isLoading } = useGoals();
  const { data: metrics = [] } = useHealthMetrics();
  const { preferences, setPreference } = usePreferences();
  const addGoal = useAddGoal();
  const updateGoal = useUpdateGoal();
  const asOf = new Date().toISOString();

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<GoalType>('body_composition');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('kg');
  const [current, setCurrent] = useState('');

  const [editingBody, setEditingBody] = useState(false);
  const [bodyTarget, setBodyTarget] = useState('');
  const [bodyDeadline, setBodyDeadline] = useState<string | undefined>(undefined);
  const [bodyDatePickerOpen, setBodyDatePickerOpen] = useState(false);

  const weight = useMemo(() => weightTrend(metrics, asOf, 120), [metrics, asOf]);
  const weightSummary = useMemo(() => summarizeTrend(weight), [weight]);
  const currentWeight = latestMetric(metrics, 'weight');
  const bodyFat = latestMetric(metrics, 'body_fat');
  const bodyGoal = goals.find((g) => g.type === 'body_composition' && g.status !== 'abandoned');

  const openEditBody = (): void => {
    setBodyTarget(bodyGoal?.targetValue !== undefined ? String(bodyGoal.targetValue) : '');
    setBodyDeadline(bodyGoal?.deadline);
    setEditingBody(true);
  };
  const saveBodyGoal = (): void => {
    const targetValue = bodyTarget ? Number(bodyTarget.replace(',', '.')) : undefined;
    if (bodyGoal) {
      updateGoal.mutate(
        { goalId: bodyGoal.id, title: bodyGoal.title, type: 'body_composition', targetValue, targetUnit: 'kg', deadline: bodyDeadline },
        { onSuccess: () => setEditingBody(false) },
      );
    } else {
      addGoal.mutate(
        { type: 'body_composition', title: t('sport.goals.screen.body.defaultTitle'), priority: 'primary', targetValue, targetUnit: 'kg', currentValue: currentWeight, deadline: bodyDeadline },
        { onSuccess: () => setEditingBody(false) },
      );
    }
  };

  const canSave = title.trim().length > 0;
  const save = (): void => {
    const input: GoalInput = {
      type,
      title: title.trim(),
      priority: 'primary',
      targetValue: target ? Number(target.replace(',', '.')) : undefined,
      targetUnit: unit.trim() || undefined,
      currentValue: current ? Number(current.replace(',', '.')) : undefined,
    };
    addGoal.mutate(input, {
      onSuccess: () => {
        setTitle('');
        setTarget('');
        setCurrent('');
        setShowForm(false);
      },
    });
  };

  const active = goals.filter((g) => g.status !== 'abandoned');
  const primaryKey = preferences.primaryGoal ?? 'fat_loss';

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text variant="title">{t('sport.goals.screen.title')}</Text>
          <Text variant="caption" color="textSubtle">
            {t('sport.goals.screen.subtitle')}
          </Text>
        </View>
        <Button label={showForm ? t('common.close') : t('sport.goals.screen.addGoalButton')} onPress={() => setShowForm((s) => !s)} />
      </View>

      {/* Objectif principal */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        {t('sport.goals.screen.primaryGoal.heading')}
      </Text>
      <Text variant="caption" color="textSubtle">
        {t('sport.goals.screen.primaryGoal.hint')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        {archetypeList.map((a) => (
          <View key={a.key} style={{ width: '47%' }}>
            <ArchetypeTile item={a} active={primaryKey === a.key} onPress={() => setPreference('primaryGoal', a.key)} />
          </View>
        ))}
      </View>

      {/* Objectifs corporels */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading">{t('sport.goals.screen.body.heading')}</Text>
          {!editingBody && (
            <Pressable onPress={openEditBody} hitSlop={8} accessibilityLabel={t('sport.goals.screen.body.manageA11y')}>
              <Icon name="pencil" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Field label={t('sport.goals.screen.body.currentWeightLabel')} value={currentWeight != null ? formatWeight(currentWeight, preferences.units) : '—'} />
        {editingBody ? (
          <>
            <View style={{ paddingVertical: spacing[2] }}>
              <Input label={t('sport.goals.screen.body.targetWeightLabel')} value={bodyTarget} onChangeText={setBodyTarget} keyboardType="numeric" placeholder="96" />
            </View>
            <Field label={t('sport.goals.screen.body.bodyFatLabel')} value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
            <Pressable onPress={() => setBodyDatePickerOpen(true)}>
              <Field label={t('sport.goals.screen.body.targetDateLabel')} value={bodyDeadline ? formatDate(bodyDeadline) : t('sport.goals.screen.body.pickDate')} last />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
              <Button label={t('common.cancel')} variant="secondary" onPress={() => setEditingBody(false)} />
              <Button
                label={updateGoal.isPending || addGoal.isPending ? '…' : t('common.save')}
                onPress={saveBodyGoal}
                disabled={updateGoal.isPending || addGoal.isPending}
              />
            </View>
            <DatePickerModal
              visible={bodyDatePickerOpen}
              value={bodyDeadline ?? new Date().toISOString()}
              onSelect={setBodyDeadline}
              onClose={() => setBodyDatePickerOpen(false)}
              maxDaysFuture={365 * 3}
            />
          </>
        ) : (
          <>
            <Field label={t('sport.goals.screen.body.targetWeightSummaryLabel')} value={bodyGoal?.targetValue != null ? formatWeight(bodyGoal.targetValue, preferences.units) : t('sport.goals.screen.body.toDefine')} />
            <Field label={t('sport.goals.screen.body.bodyFatLabel')} value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
            <Field label={t('sport.goals.screen.body.targetDateLabel')} value={bodyGoal?.deadline ? formatDate(bodyGoal.deadline) : '—'} last />
          </>
        )}
      </Card>

      {weightSummary && weight.length >= 2 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="heading">{t('sport.goals.screen.weightTrend.heading')}</Text>
            <Text variant="subtitle">{formatWeight(weightSummary.last, preferences.units)}</Text>
          </View>
          <Text variant="caption" color="textMuted">
            {t('sport.goals.screen.weightTrend.overPeriod', {
              sign: weightSummary.changeAbs >= 0 ? '+' : '−',
              value: formatWeight(Math.abs(weightSummary.changeAbs), preferences.units),
            })}
          </Text>
          <View style={{ marginTop: spacing[2] }}>
            <Sparkline values={weight.map((p) => p.value)} width={280} height={60} color={colors.primary} />
          </View>
        </Card>
      )}

      {showForm && (
        <Card>
          <Text variant="heading">{t('sport.goals.screen.form.heading')}</Text>
          <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                {t('sport.goals.screen.form.typeLabel')}
              </Text>
              <SegmentedControl options={typeOpts} value={type} onChange={setType} />
            </View>
            <Input label={t('sport.goals.screen.form.titleLabel')} placeholder={t('sport.goals.screen.form.titlePlaceholder')} value={title} onChangeText={setTitle} />
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Input label={t('sport.goals.screen.form.currentLabel')} placeholder="102" value={current} onChangeText={setCurrent} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label={t('sport.goals.screen.form.targetLabel')} placeholder="96" value={target} onChangeText={setTarget} keyboardType="numeric" />
              </View>
              <View style={{ width: 72 }}>
                <Input label={t('sport.goals.screen.form.unitLabel')} placeholder="kg" value={unit} onChangeText={setUnit} />
              </View>
            </View>
            <View style={{ alignItems: 'flex-start' }}>
              <Button label={addGoal.isPending ? t('sport.goals.screen.form.creating') : t('sport.goals.screen.form.createButton')} onPress={save} disabled={!canSave} />
            </View>
          </View>
        </Card>
      )}

      {/* Mes objectifs suivis */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        {t('sport.goals.screen.myGoals.heading')}
      </Text>
      {isLoading ? (
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      ) : active.length === 0 ? (
        <EmptyState
          icon={<Icon name="target" size={44} color={colors.textSubtle} />}
          title={t('sport.goals.screen.myGoals.emptyTitle')}
          message={t('sport.goals.screen.myGoals.emptyMessage')}
          actionLabel={t('sport.goals.screen.myGoals.emptyAction')}
          onAction={() => setShowForm(true)}
        />
      ) : (
        active.map((g) => {
          const eta = g.targetValue !== undefined && g.type === 'body_composition' ? projectTargetDate(weight, g.targetValue, asOf) : undefined;
          return (
            <View key={g.id}>
              <GoalCard goal={g} />
              {eta && (
                <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1], marginLeft: spacing[1] }}>
                  {t('sport.goals.screen.myGoals.projection', { date: formatDate(eta) })}
                </Text>
              )}
            </View>
          );
        })
      )}

      {/* Priorités */}
      {active.length > 1 ? (
        <Card>
          <Text variant="heading">{t('sport.goals.screen.priorities.heading')}</Text>
          <Text variant="caption" color="textSubtle">
            {t('sport.goals.screen.priorities.hint')}
          </Text>
          <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
            {active.map((g, i) => (
              <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: colors.surfaceElevated, borderRadius: radii.md, padding: spacing[3] }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  <Gradient fill />
                  <Text style={{ color: colors.onGradient, fontSize: 12, fontWeight: '800' }}>{i + 1}</Text>
                </View>
                <Text variant="body" style={{ flex: 1 }}>
                  {g.title}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

/** Label ↔ value row (settings field). */
function Field({ label, value, last }: { label: string; value: string; last?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text variant="body" color="textMuted">
        {label}
      </Text>
      <Text variant="body" style={{ fontWeight: '700' }}>
        {value}
      </Text>
    </View>
  );
}
