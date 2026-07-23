import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Screen,
  SegmentedControl,
  Sparkline,
  Text,
  useTheme,
} from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { Goal, GoalType } from '@supotsu/core';
import type { GoalInput } from '@supotsu/shared';
import {
  computeGoalProgress,
  projectTargetDate,
  summarizeTrend,
  weightTrend,
} from '@supotsu/engines';
import { useAddGoal, useGoals, useHealthMetrics, useUpdateGoalCurrent } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { formatWeight, usePreferences } from '@/lib/preferences';

const TYPE_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'body_composition', label: 'Poids / compo' },
  { value: 'performance', label: 'Performance' },
  { value: 'strength', label: 'Force' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'health', label: 'Santé' },
  { value: 'habit', label: 'Habitude' },
];

function ProgressBar({ pct, color }: { pct: number; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

function GoalCard({ goal }: { goal: Goal }): React.JSX.Element {
  const { colors } = useTheme();
  const update = useUpdateGoalCurrent();
  const [value, setValue] = useState('');
  const progress = computeGoalProgress(goal, goal.startValue);
  const pct = Math.round(progress * 100);
  const done = goal.status === 'achieved';

  const submit = (): void => {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    update.mutate({ goalId: goal.id, currentValue: n }, { onSuccess: () => setValue('') });
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="subtitle">{goal.title}</Text>
        {done ? <Badge label="Atteint 🎉" tone="success" /> : <Badge label={`${pct}%`} tone="info" />}
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
          Échéance : {formatDate(goal.deadline)}
        </Text>
      )}
      {!done && goal.targetValue !== undefined && (
        <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end', marginTop: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Valeur actuelle"
              placeholder={String(goal.currentValue ?? '')}
              value={value}
              onChangeText={setValue}
              keyboardType="numeric"
            />
          </View>
          <Button label={update.isPending ? '…' : 'Mettre à jour'} onPress={submit} />
        </View>
      )}
    </Card>
  );
}

/** Objectives & progression (Master Prompt P3 Objectifs, P34): goals + trends. */
export function GoalsScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: goals = [], isLoading } = useGoals();
  const { data: metrics = [] } = useHealthMetrics();
  const { preferences } = usePreferences();
  const addGoal = useAddGoal();
  const asOf = new Date().toISOString();

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<GoalType>('body_composition');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('kg');
  const [current, setCurrent] = useState('');

  const weight = useMemo(() => weightTrend(metrics, asOf, 120), [metrics, asOf]);
  const weightSummary = useMemo(() => summarizeTrend(weight), [weight]);

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

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title">Objectifs</Text>
        <Button label={showForm ? 'Fermer' : '+ Objectif'} onPress={() => setShowForm((s) => !s)} />
      </View>
      <Text variant="caption" color="textMuted">
        Fixe des objectifs mesurables et suis ta progression dans le temps.
      </Text>

      {weightSummary && weight.length >= 2 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="heading">Poids</Text>
            <Text variant="subtitle">{formatWeight(weightSummary.last, preferences.units)}</Text>
          </View>
          <Text variant="caption" color="textMuted">
            {weightSummary.changeAbs >= 0 ? '+' : '−'}
            {formatWeight(Math.abs(weightSummary.changeAbs), preferences.units)} sur la période
          </Text>
          <View style={{ marginTop: spacing[2] }}>
            <Sparkline values={weight.map((p) => p.value)} width={280} height={60} />
          </View>
        </Card>
      )}

      {showForm && (
        <Card>
          <Text variant="heading">Nouvel objectif</Text>
          <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                TYPE
              </Text>
              <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={setType} />
            </View>
            <Input label="Titre" placeholder="Ex. Descendre à 96 kg" value={title} onChangeText={setTitle} />
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Input label="Actuel" placeholder="102" value={current} onChangeText={setCurrent} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Cible" placeholder="96" value={target} onChangeText={setTarget} keyboardType="numeric" />
              </View>
              <View style={{ width: 72 }}>
                <Input label="Unité" placeholder="kg" value={unit} onChangeText={setUnit} />
              </View>
            </View>
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                label={addGoal.isPending ? 'Création…' : 'Créer l’objectif'}
                onPress={save}
                disabled={!canSave}
              />
            </View>
          </View>
        </Card>
      )}

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : active.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Aucun objectif"
          message="Fixe un premier objectif — poids, performance ou habitude — et suis ta progression."
          actionLabel="Créer un objectif"
          onAction={() => setShowForm(true)}
        />
      ) : (
        active.map((g) => {
          const eta =
            g.targetValue !== undefined && g.type === 'body_composition'
              ? projectTargetDate(weight, g.targetValue, asOf)
              : undefined;
          return (
            <View key={g.id} style={{ gap: 0 }}>
              <GoalCard goal={g} />
              {eta && (
                <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1], marginLeft: spacing[1] }}>
                  Projection : cible atteinte vers {formatDate(eta)} au rythme actuel.
                </Text>
              )}
            </View>
          );
        })
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
