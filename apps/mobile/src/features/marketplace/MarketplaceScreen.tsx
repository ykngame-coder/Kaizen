import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { recommendProgram } from '@supotsu/engines';
import type { Activity, ProgramFocus } from '@supotsu/core';
import {
  useActivities,
  useEnrolledProgramIds,
  useEnrollProgram,
  usePrograms,
} from '@/lib/data/queries';

const FOCUS_LABEL: Record<ProgramFocus, string> = {
  strength: 'Force',
  endurance: 'Endurance',
  hyrox: 'Hyrox',
  weight_loss: 'Perte de poids',
  mobility: 'Mobilité',
  general: 'Général',
};

/** Transparent rule: the user's dominant recent activity implies a focus. */
function inferFocus(activities: Activity[]): ProgramFocus | undefined {
  if (activities.length === 0) return undefined;
  const map: Record<string, ProgramFocus> = {
    running: 'endurance',
    walking: 'endurance',
    cycling: 'endurance',
    swimming: 'endurance',
    strength: 'strength',
    hyrox: 'hyrox',
    cross_training: 'hyrox',
    mobility: 'mobility',
    yoga: 'mobility',
  };
  const counts = new Map<ProgramFocus, number>();
  for (const a of activities) {
    const focus = map[a.type];
    if (focus) counts.set(focus, (counts.get(focus) ?? 0) + 1);
  }
  let best: ProgramFocus | undefined;
  let bestN = 0;
  for (const [focus, n] of counts) if (n > bestN) [best, bestN] = [focus, n];
  return best;
}

const priceLabel = (cents: number): string => (cents === 0 ? 'Gratuit' : `${(cents / 100).toFixed(0)} €`);

/** Marketplace: explainable program recommendation + catalogue (P39). */
export function MarketplaceScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { data: programs = [], isLoading } = usePrograms();
  const { data: activities = [] } = useActivities();
  const { data: enrolledIds = [] } = useEnrolledProgramIds();
  const enroll = useEnrollProgram();
  const enrolledSet = new Set(enrolledIds);
  const asOf = new Date().toISOString();

  const goalFocus = useMemo(() => inferFocus(activities), [activities]);
  const reco = useMemo(
    () => recommendProgram({ goalFocus }, programs, asOf),
    [goalFocus, programs, asOf],
  );
  const confTone: Record<string, BadgeTone> = { high: 'success', medium: 'info', to_confirm: 'warning' };

  return (
    <Screen scroll>
      <Text variant="title">Programmes</Text>
      <Text variant="caption" style={{ color: colors.textMuted }}>
        Des programmes de coachs, recommandés selon ce que tu pratiques — reco expliquée.
      </Text>

      {reco.value ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="heading">Recommandé pour toi</Text>
            <Badge
              label={
                reco.confidence === 'high'
                  ? 'Confiance élevée'
                  : reco.confidence === 'medium'
                    ? 'Confiance moyenne'
                    : 'À confirmer'
              }
              tone={confTone[reco.confidence]}
            />
          </View>
          <Text variant="subtitle">{reco.value.title}</Text>
          <Text variant="caption" color="textMuted">
            {reco.explanation?.observation}
          </Text>
          <Text variant="caption" color="textMuted">
            {reco.explanation?.analysis}
          </Text>
          <Text variant="body">{reco.explanation?.action}</Text>
        </Card>
      ) : null}

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {programs.map((p) => {
            const enrolled = enrolledSet.has(p.id);
            return (
              <Card key={p.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="subtitle">{p.title}</Text>
                  <Badge label={priceLabel(p.priceCents)} tone={p.priceCents === 0 ? 'success' : 'neutral'} />
                </View>
                <Text variant="caption" color="textMuted">
                  {p.author} · {FOCUS_LABEL[p.focus]} · niveau {p.level}
                </Text>
                <Text variant="caption" color="textMuted">
                  {p.weeks} semaines · {p.sessionsPerWeek} séances/semaine
                </Text>
                <Text variant="body">{p.description}</Text>
                <View style={{ alignItems: 'flex-start', marginTop: spacing[1] }}>
                  <Button
                    label={enrolled ? 'Inscrit ✓' : enroll.isPending ? '…' : "S'inscrire"}
                    variant={enrolled ? 'secondary' : 'primary'}
                    disabled={enrolled || enroll.isPending}
                    onPress={() => enroll.mutate(p.id)}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
