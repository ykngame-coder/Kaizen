import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup, Workout } from '@supotsu/core';
import { computeMuscleStates } from '@supotsu/engines';
import {
  useAddPlannedWorkout,
  useCustomExercises,
  useDeletePlannedWorkout,
  useMuscleSessions,
  usePlannedWorkouts,
  useReprogramWorkout,
  useSetWorkoutStatus,
  useWorkoutSets,
  useWorkouts,
} from '@/lib/data/queries';
import { EXERCISES, toCatalogExercise } from '@/features/exercises/catalog';

const BUILT_IN_EXERCISE_NAME: Record<string, string> = Object.fromEntries(EXERCISES.map((e) => [e.id, e.name]));

const DAY_MS = 86_400_000;

/** Translation-key lookup for muscle display names used on this screen (local to Planning). */
const MUSCLE_LABEL_KEY: Partial<Record<MuscleGroup, string>> = {
  chest: 'sport.planning.muscles.chest', back: 'sport.planning.muscles.back', shoulders: 'sport.planning.muscles.shoulders',
  biceps: 'sport.planning.muscles.biceps', triceps: 'sport.planning.muscles.triceps',
  quads: 'sport.planning.muscles.quads', hamstrings: 'sport.planning.muscles.hamstrings', glutes: 'sport.planning.muscles.glutes',
  calves: 'sport.planning.muscles.calves', core: 'sport.planning.muscles.core',
  full_body: 'sport.planning.muscles.fullBody',
};

/** Session focus templates → target muscles. Focus is derived from the name so
 * no schema column is needed (planned sessions live on the workouts table).
 * `match` keywords are a language-agnostic matching heuristic against stored
 * workout names/notes — not display text, so they are not translated. */
interface Focus {
  key: string;
  labelKey: string;
  icon: string;
  muscles: MuscleGroup[];
  match: string[];
}
const FOCUS: Focus[] = [
  { key: 'push', labelKey: 'sport.planning.focus.push', icon: '🔺', muscles: ['chest', 'shoulders', 'triceps'], match: ['push', 'poussée', 'pousse'] },
  { key: 'pull', labelKey: 'sport.planning.focus.pull', icon: '🔻', muscles: ['back', 'biceps'], match: ['pull', 'tirage'] },
  { key: 'legs', labelKey: 'sport.planning.focus.legs', icon: '🦵', muscles: ['quads', 'hamstrings', 'glutes', 'calves'], match: ['jambe', 'legs', 'leg', 'bas du corps'] },
  { key: 'upper', labelKey: 'sport.planning.focus.upper', icon: '💪', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'], match: ['haut'] },
  { key: 'full', labelKey: 'sport.planning.focus.full', icon: '🔥', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'core'], match: ['full', 'complet', 'corps entier'] },
  { key: 'core', labelKey: 'sport.planning.focus.core', icon: '🧱', muscles: ['core'], match: ['abdo', 'gainage', 'core'] },
  { key: 'cardio', labelKey: 'sport.planning.focus.cardio', icon: '🏃', muscles: [], match: ['cardio', 'course', 'vélo', 'velo', 'run'] },
  { key: 'mobility', labelKey: 'sport.planning.focus.mobility', icon: '🧘', muscles: [], match: ['mobilit', 'étirement', 'etirement', 'yoga', 'souplesse'] },
];
function focusFor(name: string): Focus | null {
  const n = name.toLowerCase();
  for (const f of FOCUS) if (f.match.some((m) => n.includes(m))) return f;
  return null;
}

// --- local date helpers (work in YYYY-MM-DD, matching the planned_for DATE) ---
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow);
  return x;
}
function longDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const s = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Muscles that would still be under-recovered on a given date, given past load. */
function notReadyOn(
  dateKey: string,
  muscles: MuscleGroup[],
  sessions: Parameters<typeof computeMuscleStates>[0],
): MuscleGroup[] {
  if (muscles.length === 0) return [];
  const asOf = new Date(`${dateKey}T12:00:00`).toISOString();
  const states = computeMuscleStates(sessions, asOf);
  const byMuscle = new Map(states.map((s) => [s.muscle, s]));
  return muscles.filter((m) => {
    const st = byMuscle.get(m);
    return st != null && (st.state === 'fatigued' || st.state === 'worked');
  });
}

export function PlanningScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: planned = [], isLoading } = usePlannedWorkouts();
  const { data: allWorkouts = [] } = useWorkouts();
  const { data: muscleSessions = [] } = useMuscleSessions();
  const addPlanned = useAddPlannedWorkout();
  const setStatus = useSetWorkoutStatus();
  const removePlanned = useDeletePlannedWorkout();
  const reprogram = useReprogramWorkout();

  const WEEKDAYS = t('sport.planning.weekdaysShort', { returnObjects: true }) as string[];

  function handleReprogram(w: Workout): void {
    const base = w.plannedFor ? new Date(`${w.plannedFor.slice(0, 10)}T12:00:00`) : new Date();
    const nextDate = new Date(base.getTime() + 7 * DAY_MS);
    const nextKey = dayKey(nextDate);
    reprogram.mutate(
      { workoutId: w.id, name: w.name, notes: w.notes, plannedFor: nextKey },
      {
        onSuccess: () => Alert.alert(t('sport.planning.reprogramSuccessTitle'), t('sport.planning.reprogramSuccessMessage', { name: w.name, date: longDate(nextKey) })),
        onError: () => Alert.alert(t('sport.planning.reprogramErrorTitle'), t('sport.planning.reprogramErrorMessage')),
      },
    );
  }

  const todayKey = dayKey(new Date());

  // Every dated session regardless of status (planned only drops out of view
  // once done/skipped) — lets the week strip show a done/missed mark instead
  // of just "has a session".
  const byDayAnyStatus = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of allWorkouts) {
      if (!w.plannedFor) continue;
      const k = w.plannedFor.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(w);
      map.set(k, arr);
    }
    return map;
  }, [allWorkouts]);
  const dayStatus = (k: string): 'done' | 'missed' | 'pending' | null => {
    const sessions = byDayAnyStatus.get(k);
    if (!sessions || sessions.length === 0) return null;
    if (sessions.every((w) => w.status === 'completed')) return 'done';
    const missed = sessions.some((w) => w.status === 'skipped') || (k < todayKey && sessions.some((w) => w.status === 'planned'));
    return missed ? 'missed' : 'pending';
  };
  const [weekAnchor, setWeekAnchor] = useState(() => mondayOf(new Date()));
  const [selected, setSelected] = useState(todayKey);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // planned sessions grouped by day
  const byDay = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of planned) {
      if (!w.plannedFor) continue;
      const k = w.plannedFor.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(w);
      map.set(k, arr);
    }
    return map;
  }, [planned]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekAnchor.getTime() + i * DAY_MS)),
    [weekAnchor],
  );
  const weekLabel = useMemo(() => {
    const end = new Date(weekAnchor.getTime() + 6 * DAY_MS);
    const a = weekAnchor.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const b = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `${a} – ${b}`;
  }, [weekAnchor]);

  const daySessions = byDay.get(selected) ?? [];
  const upcoming = useMemo(
    () => planned
      .filter((w) => (w.plannedFor ?? '').slice(0, 10) >= todayKey)
      .sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? ''))
      .slice(0, 6),
    [planned, todayKey],
  );

  function submit(): void {
    const label = name.trim() || t('sport.planning.defaultSessionName');
    addPlanned.mutate(
      { name: label, plannedFor: selected, notes: notes.trim() || undefined },
      { onSuccess: () => { setName(''); setNotes(''); setAdding(false); } },
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('sport.planning.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.planning.subtitle')}
      </Text>

      {/* Week navigator */}
      <Card style={{ marginTop: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => setWeekAnchor(new Date(weekAnchor.getTime() - 7 * DAY_MS))}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: spacing[1] })}
          >
            <Text variant="heading">‹</Text>
          </Pressable>
          <Text variant="subtitle">{weekLabel}</Text>
          <Pressable
            onPress={() => setWeekAnchor(new Date(weekAnchor.getTime() + 7 * DAY_MS))}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: spacing[1] })}
          >
            <Text variant="heading">›</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[1], marginTop: spacing[3] }}>
          {weekDays.map((d, i) => {
            const k = dayKey(d);
            const status = dayStatus(k);
            const isSel = k === selected;
            const isToday = k === todayKey;
            return (
              <Pressable
                key={k}
                onPress={() => setSelected(k)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing[2],
                  borderRadius: radii.md,
                  backgroundColor: isSel ? colors.primary : colors.surfaceElevated,
                  borderWidth: isToday && !isSel ? 1 : 0,
                  borderColor: colors.primary,
                }}
              >
                <Text variant="caption" style={{ color: isSel ? colors.onPrimary : colors.textSubtle }}>
                  {WEEKDAYS[i]}
                </Text>
                <Text variant="body" style={{ color: isSel ? colors.onPrimary : colors.text, fontWeight: '700', marginTop: 2 }}>
                  {d.getDate()}
                </Text>
                {status === 'done' ? (
                  <Text style={{ fontSize: 11, marginTop: 3 }}>✅</Text>
                ) : status === 'missed' ? (
                  <Text style={{ fontSize: 11, marginTop: 3 }}>🔴</Text>
                ) : (
                  <View
                    style={{
                      width: 5, height: 5, borderRadius: 3, marginTop: 4,
                      backgroundColor: status === 'pending' ? (isSel ? colors.onPrimary : colors.accentData) : 'transparent',
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Selected day */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[4] }}>
        <Text variant="heading">{longDate(selected)}</Text>
        <Pressable onPress={() => setAdding((v) => !v)} hitSlop={8}>
          <Text variant="body" style={{ color: colors.primary, fontWeight: '700' }}>
            {adding ? t('sport.planning.addToggleClose') : t('sport.planning.addToggleOpen')}
          </Text>
        </Pressable>
      </View>

      {adding && (
        <Card style={{ marginTop: spacing[2] }}>
          <Text variant="label" color="textMuted">
            {t('sport.planning.addForm.typeLabel')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] }}>
            {FOCUS.map((f) => {
              const label = t(f.labelKey);
              const active = name.trim() === label;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setName(label)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.full,
                    backgroundColor: active ? colors.primary : colors.surfaceElevated,
                    borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{f.icon}</Text>
                  <Text variant="caption" style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: spacing[3] }}>
            <Input label={t('sport.planning.addForm.nameLabel')} value={name} onChangeText={setName} placeholder={t('sport.planning.addForm.namePlaceholder')} />
          </View>
          <View style={{ marginTop: spacing[2] }}>
            <Input label={t('sport.planning.addForm.notesLabel')} value={notes} onChangeText={setNotes} placeholder={t('sport.planning.addForm.notesPlaceholder')} />
          </View>
          <View style={{ marginTop: spacing[3] }}>
            <Button
              label={addPlanned.isPending ? t('sport.planning.addForm.submitPending') : t('sport.planning.addForm.submit', { date: longDate(selected).split(' ').slice(1).join(' ') })}
              onPress={submit}
              disabled={addPlanned.isPending}
              fullWidth
            />
          </View>
        </Card>
      )}

      {isLoading ? (
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[3] }}>
          {t('common.loading')}
        </Text>
      ) : daySessions.length === 0 ? (
        <Card style={{ marginTop: spacing[2] }}>
          <Text variant="body" color="textMuted">
            {t('sport.planning.emptyDay')}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
          {daySessions.map((w) => (
            <SessionCard
              key={w.id}
              workout={w}
              sessions={muscleSessions}
              onDone={() => setStatus.mutate({ workoutId: w.id, status: 'completed', completedAt: new Date().toISOString() })}
              onSkip={() => setStatus.mutate({ workoutId: w.id, status: 'skipped' })}
              onDelete={() => removePlanned.mutate(w.id)}
              onReprogram={() => handleReprogram(w)}
            />
          ))}
        </View>
      )}

      {/* Upcoming + recovery forecast */}
      {upcoming.length > 0 && (
        <>
          <Text variant="heading" style={{ marginTop: spacing[4] }}>
            {t('sport.planning.upcoming.heading')}
          </Text>
          <Text variant="caption" color="textSubtle" style={{ marginBottom: spacing[2] }}>
            {t('sport.planning.upcoming.subtitle')}
          </Text>
          <View style={{ gap: spacing[2] }}>
            {upcoming.map((w) => {
              const k = (w.plannedFor ?? '').slice(0, 10);
              const focus = focusFor(w.name);
              const notReady = focus ? notReadyOn(k, focus.muscles, muscleSessions) : [];
              return (
                <Pressable key={w.id} onPress={() => { setSelected(k); setWeekAnchor(mondayOf(new Date(`${k}T12:00:00`))); }}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                      <Text style={{ fontSize: 18 }}>{focus?.icon ?? '🎽'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" style={{ fontWeight: '600' }}>{w.name}</Text>
                        <Text variant="caption" color="textSubtle">{longDate(k)}</Text>
                      </View>
                    </View>
                    {focus && focus.muscles.length > 0 && (
                      <Text
                        variant="caption"
                        style={{ marginTop: spacing[2], color: notReady.length ? colors.warning : colors.accentData, fontWeight: '600' }}
                      >
                        {notReady.length
                          ? t('sport.planning.upcoming.notReady', { muscles: notReady.map((m) => (MUSCLE_LABEL_KEY[m] ? t(MUSCLE_LABEL_KEY[m]!) : m)).join(', ') })
                          : t('sport.planning.upcoming.ready')}
                      </Text>
                    )}
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[4], textAlign: 'center' }}>
        {t('sport.planning.footerNote')}
      </Text>
    </Screen>
  );
}

function SessionCard({
  workout,
  sessions,
  onDone,
  onSkip,
  onDelete,
  onReprogram,
}: {
  workout: Workout;
  sessions: Parameters<typeof computeMuscleStates>[0];
  onDone: () => void;
  onSkip: () => void;
  onDelete: () => void;
  onReprogram: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const focus = focusFor(workout.name);
  const k = (workout.plannedFor ?? '').slice(0, 10);
  const notReady = focus ? notReadyOn(k, focus.muscles, sessions) : [];
  const { data: sets = [] } = useWorkoutSets(workout.id);
  const { data: customExercises = [] } = useCustomExercises();
  const exerciseNames = useMemo(() => {
    const custom = Object.fromEntries(customExercises.map((e) => [e.id, toCatalogExercise(e).name]));
    const order = [...sets].sort((a, b) => a.order - b.order);
    return order.map((s) => custom[s.exerciseId] ?? BUILT_IN_EXERCISE_NAME[s.exerciseId] ?? t('sport.planning.exerciseFallbackName')).join(' · ');
  }, [sets, customExercises, t]);
  return (
    <Swipeable
      renderRightActions={() => (
        <Pressable
          onPress={onDelete}
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            width: 84,
            marginLeft: spacing[2],
            borderRadius: radii.lg,
            backgroundColor: colors.error,
          }}
        >
          <Icon name="trash" size={18} color={colors.onPrimary} />
          <Text variant="caption" color="onPrimary" style={{ marginTop: 2, fontWeight: '600' }}>{t('sport.planning.sessionCard.delete')}</Text>
        </Pressable>
      )}
      overshootRight={false}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text style={{ fontSize: 20 }}>{focus?.icon ?? '🎽'}</Text>
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ fontWeight: '700' }}>{workout.name}</Text>
            {exerciseNames ? (
              <Text variant="caption" color="textMuted" style={{ marginTop: 1 }} numberOfLines={2}>{exerciseNames}</Text>
            ) : null}
            {workout.notes ? (
              <Text variant="caption" color="textSubtle" style={{ marginTop: 1 }}>{workout.notes}</Text>
            ) : null}
          </View>
        </View>

        {focus && focus.muscles.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[2] }}>
            {focus.muscles.map((m) => {
              const cold = notReady.includes(m);
              return (
                <View
                  key={m}
                  style={{
                    paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.full,
                    backgroundColor: cold ? 'rgba(255,139,94,0.14)' : 'rgba(43,227,139,0.12)',
                    borderWidth: 1, borderColor: cold ? 'rgba(255,139,94,0.3)' : 'rgba(43,227,139,0.28)',
                  }}
                >
                  <Text variant="caption" style={{ color: cold ? colors.accentStrength : colors.accentData, fontWeight: '600' }}>
                    {MUSCLE_LABEL_KEY[m] ? t(MUSCLE_LABEL_KEY[m]!) : m}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
          <View style={{ flex: 1 }}>
            <Button label={t('sport.planning.sessionCard.done')} variant="primary" onPress={onDone} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t('sport.planning.sessionCard.skip')} variant="secondary" onPress={onSkip} fullWidth />
          </View>
          <Pressable
            onPress={onReprogram}
            hitSlop={8}
            accessibilityLabel={t('sport.planning.sessionCard.reprogramA11y')}
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1, width: 44, alignItems: 'center', justifyContent: 'center',
              borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
            })}
          >
            <Text style={{ fontSize: 16 }}>↻</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1, width: 44, alignItems: 'center', justifyContent: 'center',
              borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
            })}
          >
            <Icon name="trash" size={16} color={colors.text} />
          </Pressable>
        </View>
      </Card>
    </Swipeable>
  );
}
