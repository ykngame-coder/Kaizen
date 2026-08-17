import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { ProgramFocus } from '@supotsu/core';
import { PICKABLE_EXERCISES } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { useEnrolledProgramIds, useEnrollProgram, usePrograms } from '@/lib/data/queries';

const FOCUS_LABEL: Record<ProgramFocus, string> = {
  strength: 'Force',
  endurance: 'Endurance',
  hyrox: 'Hyrox',
  weight_loss: 'Perte de poids',
  mobility: 'Mobilité',
  general: 'Général',
};
const priceLabel = (cents: number): string => (cents === 0 ? 'Gratuit' : `${(cents / 100).toFixed(0)} €`);

const EXERCISE_NAME_BY_ID = new Map<string, string>([
  ...PICKABLE_EXERCISES.map((e) => [e.id, e.name] as const),
  ...EXERCISES.map((e) => [e.id, e.name] as const),
]);
const exerciseName = (id: string): string => EXERCISE_NAME_BY_ID.get(id) ?? id;

/** Preview a catalogue program's actual weekly session content before enrolling — what a tester asked for after finding enrollment a black box. */
export function ProgramCatalogDetailScreen(): React.JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: programs = [], isLoading } = usePrograms();
  const { data: enrolledIds = [] } = useEnrolledProgramIds();
  const enroll = useEnrollProgram();

  const program = useMemo(() => programs.find((p) => p.id === id), [programs, id]);
  const enrolled = enrolledIds.includes(id ?? '');

  // One week's worth — sessionTemplates repeats the same weekly pattern (or a per-week plan), so the first sessionsPerWeek entries are what every enrolled week actually looks like.
  const weekPreview = program?.sessionTemplates.slice(0, program.sessionsPerWeek) ?? [];

  if (isLoading) {
    return (
      <Screen scroll>
        <Text variant="body" color="textMuted">Chargement…</Text>
      </Screen>
    );
  }

  if (!program) {
    return (
      <Screen scroll>
        <EmptyState icon="🗓" title="Programme introuvable" actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackButton />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{program.title}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {program.author} · {FOCUS_LABEL[program.focus]} · niveau {program.level}
          </Text>
        </View>
        <Badge label={priceLabel(program.priceCents)} tone={program.priceCents === 0 ? 'success' : 'neutral'} />
      </View>

      <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>{program.description}</Text>
      <Text variant="caption" color="textSubtle">
        {program.weeks} semaines · {program.sessionsPerWeek} séances/semaine
      </Text>

      <Text variant="heading" style={{ marginTop: spacing[3] }}>Une semaine type</Text>
      <Text variant="caption" color="textSubtle" style={{ marginBottom: spacing[2] }}>
        Ce schéma se répète chaque semaine du programme.
      </Text>
      <View style={{ gap: spacing[2] }}>
        {weekPreview.map((t, i) => (
          <Card key={i}>
            <Text variant="subtitle">{t.title}</Text>
            {t.notes ? (
              <Text variant="body" color="textMuted" style={{ marginTop: spacing[1], lineHeight: 20 }}>{t.notes}</Text>
            ) : null}
            {t.exercises && t.exercises.length > 0 ? (
              <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
                {t.exercises.map((ex, j) => (
                  <View key={j} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                      {exerciseName(ex.exerciseId)}
                    </Text>
                    <Text variant="caption" color="textSubtle">{ex.sets} × {ex.reps}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ))}
      </View>

      <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[2] }}>
        En t'inscrivant, {program.sessionTemplates.length} séances sont automatiquement ajoutées à ta Planification.
      </Text>

      <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
        <Button
          label={enrolled ? 'Inscrit ✓' : enroll.isPending ? '…' : "S'inscrire"}
          variant={enrolled ? 'secondary' : 'primary'}
          disabled={enrolled || enroll.isPending}
          onPress={() => enroll.mutate(program.id, { onSuccess: () => router.push('/sport/planning') })}
        />
      </View>
    </Screen>
  );
}
