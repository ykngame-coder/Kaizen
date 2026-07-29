import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { WorkoutStatus } from '@supotsu/core';
import { useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

const STATUS: Record<WorkoutStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'warning' },
  completed: { label: 'Terminée', tone: 'success' },
  skipped: { label: 'Manquée', tone: 'error' },
};

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Small stat block. */
function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant="caption" color="textSubtle">
        {label}
      </Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Détail d'une séance (mockup #8). Shows the fields the model actually tracks —
 * name, status, date, duration, RPE, notes. Exercise-by-exercise logging is not
 * yet in the data model, so that section is an honest "coming soon".
 */
export function WorkoutDetailScreen(): React.JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: workouts = [], isLoading } = useWorkouts();
  const workout = useMemo(() => workouts.find((w) => w.id === id), [workouts, id]);

  if (isLoading) {
    return (
      <Screen scroll>
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      </Screen>
    );
  }

  if (!workout) {
    return (
      <Screen scroll>
        <EmptyState icon="🏋️" title="Séance introuvable" message="Cette séance n'existe plus ou n'a pas encore été synchronisée." actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  const status = STATUS[workout.status];

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{workout.name}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {formatDate(workout.completedAt ?? workout.plannedFor ?? workout.createdAt)}
          </Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>

      {/* Résumé */}
      <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
        <Stat label="Durée" value={workout.durationSec ? fmtDur(workout.durationSec) : '—'} />
        <Stat label="RPE" value={workout.rpe != null ? `${workout.rpe}/10` : '—'} />
        <Stat label="Statut" value={status.label} />
      </View>

      {/* Notes */}
      {workout.notes ? (
        <Card>
          <Text variant="heading">Notes</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
            {workout.notes}
          </Text>
        </Card>
      ) : null}

      {/* Exercices — not yet modelled */}
      <Card>
        <Text variant="heading">Exercices</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 21 }}>
          Le détail par exercice (séries, répétitions, charges) arrive bientôt. Pour l'instant, Kaizen suit la séance au niveau global (durée, RPE, statut).
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
