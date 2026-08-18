import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
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

/** The primary-goal archetypes from the mockup — one active selection. */
const ARCHETYPES: { key: string; emoji: string; name: string; desc: string }[] = [
  { key: 'fat_loss', emoji: '🔥', name: 'Perte de graisse', desc: 'Déficit, poids, masse grasse' },
  { key: 'muscle', emoji: '💪', name: 'Prise de masse', desc: 'Surplus, force, volume' },
  { key: 'hyrox', emoji: '🏃', name: 'Préparation Hyrox', desc: 'Charge, VO₂, endurance' },
  { key: 'marathon', emoji: '🏅', name: 'Marathon', desc: 'Distance, allure, récup' },
  { key: 'sleep', emoji: '😴', name: 'Sommeil', desc: 'Durée, régularité, HRV' },
  { key: 'stress', emoji: '🧘', name: 'Réduction du stress', desc: 'HRV, respiration, repos' },
];

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
function ArchetypeTile({ item, active, onPress }: { item: (typeof ARCHETYPES)[number]; active: boolean; onPress: () => void }): React.JSX.Element {
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

/** Objectifs (mockup #17): primary goal, body targets, tracked goals, priorities. */
export function GoalsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: goals = [], isLoading } = useGoals();
  const { data: metrics = [] } = useHealthMetrics();
  const { preferences, setPreference } = usePreferences();
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
  const currentWeight = latestMetric(metrics, 'weight');
  const bodyFat = latestMetric(metrics, 'body_fat');
  const bodyGoal = goals.find((g) => g.type === 'body_composition' && g.status !== 'abandoned');

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
          <Text variant="title">Objectifs</Text>
          <Text variant="caption" color="textSubtle">
            Performance • Santé • Bien-être
          </Text>
        </View>
        <Button label={showForm ? 'Fermer' : '+ Objectif'} onPress={() => setShowForm((s) => !s)} />
      </View>

      {/* Objectif principal */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Objectif principal
      </Text>
      <Text variant="caption" color="textSubtle">
        Une seule sélection active — elle personnalise toute l'app.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        {ARCHETYPES.map((a) => (
          <View key={a.key} style={{ width: '47%' }}>
            <ArchetypeTile item={a} active={primaryKey === a.key} onPress={() => setPreference('primaryGoal', a.key)} />
          </View>
        ))}
      </View>

      {/* Objectifs corporels */}
      <Card>
        <Text variant="heading">Objectifs corporels</Text>
        <Field label="Poids actuel" value={currentWeight != null ? formatWeight(currentWeight, preferences.units) : '—'} />
        <Field label="Poids cible" value={bodyGoal?.targetValue != null ? formatWeight(bodyGoal.targetValue, preferences.units) : 'À définir'} />
        <Field label="Masse grasse actuelle" value={bodyFat != null ? `${bodyFat.toFixed(1)} %` : '—'} />
        <Field label="Date cible" value={bodyGoal?.deadline ? formatDate(bodyGoal.deadline) : '—'} last />
      </Card>

      {weightSummary && weight.length >= 2 && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="heading">Tendance du poids</Text>
            <Text variant="subtitle">{formatWeight(weightSummary.last, preferences.units)}</Text>
          </View>
          <Text variant="caption" color="textMuted">
            {weightSummary.changeAbs >= 0 ? '+' : '−'}
            {formatWeight(Math.abs(weightSummary.changeAbs), preferences.units)} sur la période
          </Text>
          <View style={{ marginTop: spacing[2] }}>
            <Sparkline values={weight.map((p) => p.value)} width={280} height={60} color={colors.primary} />
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
              <Button label={addGoal.isPending ? 'Création…' : 'Créer l’objectif'} onPress={save} disabled={!canSave} />
            </View>
          </View>
        </Card>
      )}

      {/* Mes objectifs suivis */}
      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        Mes objectifs
      </Text>
      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : active.length === 0 ? (
        <EmptyState
          icon={<Icon name="target" size={44} color={colors.textSubtle} />}
          title="Aucun objectif"
          message="Fixe un premier objectif — poids, performance ou habitude — et suis ta progression."
          actionLabel="Créer un objectif"
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
                  Projection : cible atteinte vers {formatDate(eta)} au rythme actuel.
                </Text>
              )}
            </View>
          );
        })
      )}

      {/* Priorités */}
      {active.length > 1 ? (
        <Card>
          <Text variant="heading">Priorités</Text>
          <Text variant="caption" color="textSubtle">
            Kaizen hiérarchise les conseils selon cet ordre.
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
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
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
