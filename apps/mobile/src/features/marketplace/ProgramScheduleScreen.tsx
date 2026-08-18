import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import {
  useAssignProgramSession,
  useProgramSessions,
  useRemoveProgramSession,
  useUserPrograms,
  useUserSessions,
} from '@/lib/data/queries';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Assign the owner's own sessions to week×day slots of one of their programs. */
export function ProgramScheduleScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: programs = [], isLoading: programsLoading } = useUserPrograms();
  const { data: slots = [] } = useProgramSessions(id);
  const { data: sessions = [] } = useUserSessions();
  const assign = useAssignProgramSession();
  const remove = useRemoveProgramSession();

  const program = useMemo(() => programs.find((p) => p.id === id), [programs, id]);
  const [week, setWeek] = useState(1);
  const [pickingDay, setPickingDay] = useState<number | null>(null);

  if (programsLoading) {
    return (
      <Screen>
        <Text variant="body" color="textMuted">Chargement…</Text>
      </Screen>
    );
  }

  if (!program) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="calendarClock" size={44} color={colors.textSubtle} />} title="Programme introuvable" message="Ce programme n'existe plus." actionLabel="Retour" onAction={() => router.back()} />
      </Screen>
    );
  }

  const slotsForWeek = slots.filter((s) => s.weekNumber === week);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const onAssign = (dayIndex: number, sessionId: string): void => {
    setPickingDay(null);
    assign.mutate({ programId: program.id, slot: { sessionId, weekNumber: week, dayIndex, order: 0 } });
  };

  return (
    <Screen scroll>
      <Text variant="title">{program.title}</Text>
      <Text variant="caption" color="textSubtle">
        {program.weeks} semaines · glisse tes séances sur chaque jour
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[3] }}>
        <Button label="‹" variant="secondary" disabled={week <= 1} onPress={() => setWeek((w) => Math.max(1, w - 1))} />
        <Text variant="heading">Semaine {week} / {program.weeks}</Text>
        <Button label="›" variant="secondary" disabled={week >= program.weeks} onPress={() => setWeek((w) => Math.min(program.weeks, w + 1))} />
      </View>

      <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
        {DAY_LABELS.map((label, dayIndex) => {
          const slot = slotsForWeek.find((s) => s.dayIndex === dayIndex);
          const assignedSession = slot ? sessionById.get(slot.sessionId) : undefined;
          const isPicking = pickingDay === dayIndex;

          return (
            <Card key={dayIndex}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="body" style={{ fontWeight: '600' }}>{label}</Text>
                {slot ? (
                  <Pressable onPress={() => remove.mutate({ programSessionId: slot.id, programId: program.id })}>
                    <Text variant="caption" style={{ color: colors.error }}>Retirer</Text>
                  </Pressable>
                ) : null}
              </View>

              {assignedSession ? (
                <Text variant="body" color="primary" style={{ marginTop: spacing[1] }}>{assignedSession.name}</Text>
              ) : (
                <Pressable onPress={() => setPickingDay(isPicking ? null : dayIndex)}>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
                    {isPicking ? 'Choisis une séance ci-dessous ↓' : '+ Assigner une séance'}
                  </Text>
                </Pressable>
              )}

              {isPicking ? (
                <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
                  {sessions.length === 0 ? (
                    <Text variant="caption" color="textSubtle">
                      Aucune séance dans ta bibliothèque — crée-en une d'abord depuis Mes créations.
                    </Text>
                  ) : (
                    sessions.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => onAssign(dayIndex, s.id)}
                        style={{
                          paddingVertical: spacing[2],
                          paddingHorizontal: spacing[3],
                          borderRadius: radii.md,
                          backgroundColor: colors.surfaceElevated,
                        }}
                      >
                        <Text variant="body">{s.name}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      {program.visibility === 'public' ? <Badge label="Public — visible dans Communauté" tone="info" /> : null}

      <View style={{ alignItems: 'flex-start', marginTop: spacing[4] }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
