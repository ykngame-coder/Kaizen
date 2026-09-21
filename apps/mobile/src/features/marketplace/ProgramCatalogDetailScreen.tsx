import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { ProgramFocus } from '@supotsu/core';
import { PICKABLE_EXERCISES } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { BackButton } from '@/features/navigation/BackButton';
import { withStandardSledWeights } from '@supotsu/engines';
import { useAthleteProfile, useEnrolledProgramIds, useEnrollProgram, useProgramSessionsContent, usePrograms } from '@/lib/data/queries';
import { describeBlock, describeSet } from '@/features/training/setGoal';

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
  const { data: content } = useProgramSessionsContent(program?.sessions);
  // Même charge à l'aperçu qu'à la séance : le traîneau se lit au standard de
  // la catégorie, sinon l'écran promettrait autre chose que ce qui sera fait.
  const { data: athlete } = useAthleteProfile();

  /**
   * Semaine par semaine, et non « une semaine type » : les semaines d'un vrai
   * programme n'ont ni le même nombre de séances ni le même contenu.
   */
  const weeks = useMemo(() => {
    const byWeek = new Map<number, NonNullable<typeof program>['sessions']>();
    for (const s of program?.sessions ?? []) {
      const week = byWeek.get(s.weekNumber) ?? [];
      week.push(s);
      byWeek.set(s.weekNumber, week);
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, sessions]) => ({ number, sessions: [...(sessions ?? [])].sort((a, b) => a.order - b.order) }));
  }, [program]);

  // Programmes d'origine, dont le contenu est encore bundlé dans l'app.
  const weekPreview = program?.sessions?.length ? [] : program?.sessionTemplates.slice(0, program.sessionsPerWeek) ?? [];

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
        <EmptyState icon={<Icon name="calendarClock" size={44} />} title="Programme introuvable" actionLabel="Retour" onAction={() => router.back()} />
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

      {weeks.length > 0 ? (
        <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
          {weeks.map((week) => (
            <View key={week.number} style={{ gap: spacing[2] }}>
              <Text variant="heading">Semaine {week.number}</Text>
              <Text variant="caption" color="textSubtle">
                {week.sessions.length} séance{week.sessions.length > 1 ? 's' : ''}
              </Text>
              {week.sessions.map((s) => {
                const detail = content?.get(s.sessionId);
                return (
                  <Card key={s.sessionId}>
                    <Text variant="subtitle">{s.title}</Text>
                    {(detail?.blocks ?? []).map((b) => {
                      const label = describeBlock({ format: b.format, timeCapSec: b.timeCapSec, targetRounds: b.targetRounds, sets: [] });
                      const sets = withStandardSledWeights(
                        (detail?.exercises ?? []).filter((e) => e.blockId === b.id),
                        athlete?.sex,
                      );
                      return (
                        <View key={b.id} style={{ marginTop: spacing[2] }}>
                          {label ? (
                            <Text variant="caption" color="primary" style={{ fontWeight: '700' }}>{label}</Text>
                          ) : null}
                          {sets.map((e) => (
                            <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2] }}>
                              <Text variant="caption" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
                                {exerciseName(e.exerciseId)}
                              </Text>
                              <Text variant="caption" color="textSubtle">{describeSet(e)}</Text>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </Card>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      {weekPreview.length > 0 ? (
        <>
          <Text variant="heading" style={{ marginTop: spacing[3] }}>Une semaine type</Text>
          <Text variant="caption" color="textSubtle" style={{ marginBottom: spacing[2] }}>
            Ce schéma se répète chaque semaine du programme.
          </Text>
        </>
      ) : null}
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
        En t'inscrivant, {program.sessions?.length ?? program.sessionTemplates.length} séances sont automatiquement ajoutées à ta Planification, à leur date.
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
