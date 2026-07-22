import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Badge, Card, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { buildDailyBriefing, estimateTargets } from '@supotsu/engines';
import type { Confidence } from '@supotsu/core';
import { useActivities, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';

const CONFIDENCE: Record<Confidence, { label: string; tone: BadgeTone }> = {
  high: { label: 'Confiance élevée', tone: 'success' },
  medium: { label: 'Confiance moyenne', tone: 'info' },
  to_confirm: { label: 'À confirmer', tone: 'warning' },
};

/**
 * "Bilan du jour": the Decision Engine's orchestration surfaced as one card —
 * a single priority message (health-first) plus each pillar's readout. This is
 * where all the imported data pays off: HRV/sleep → recovery, load → readiness,
 * meals → nutrition, each explained.
 */
export function DailyBriefingCard(): React.JSX.Element {
  const { colors } = useTheme();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const { data: nutrition = [] } = useNutritionEntries();
  const asOf = new Date().toISOString();

  const weight = useMemo(
    () =>
      health
        .filter((m) => m.type === 'weight')
        .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.value,
    [health],
  );

  const briefing = useMemo(
    () =>
      buildDailyBriefing({
        activities,
        healthMetrics: health,
        nutritionEntries: nutrition,
        targets: estimateTargets({ weightKg: weight }, asOf).value,
        asOf,
      }),
    [activities, health, nutrition, weight, asOf],
  );

  const conf = CONFIDENCE[briefing.confidence];

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading">Bilan du jour</Text>
        <Badge label={conf.label} tone={conf.tone} />
      </View>

      <Text variant="caption" color="textMuted">
        {briefing.headline.observation}
      </Text>
      <Text variant="caption" color="textMuted">
        {briefing.headline.analysis}
      </Text>
      <Text variant="body">{briefing.headline.action}</Text>

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        {briefing.sections.map((s) => (
          <View
            key={s.key}
            style={{
              flex: 1,
              padding: spacing[2],
              borderRadius: 10,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text variant="label" color="textMuted">
              {s.title.toUpperCase()}
            </Text>
            <Text variant="data">{s.value !== null ? String(s.value) : '—'}</Text>
            <Text variant="caption" color="textMuted">
              {s.caption}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
