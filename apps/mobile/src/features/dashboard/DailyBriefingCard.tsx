import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { buildDailyBriefing, estimateTargets } from '@supotsu/engines';
import type { Confidence } from '@supotsu/core';
import { useActivities, useHealthMetrics, useNutritionEntries } from '@/lib/data/queries';

const CONFIDENCE_TONE: Record<Confidence, BadgeTone> = {
  high: 'success',
  medium: 'info',
  to_confirm: 'warning',
};

/**
 * "Bilan du jour": the Decision Engine's orchestration surfaced as one card —
 * a single priority message (health-first) plus each pillar's readout. This is
 * where all the imported data pays off: HRV/sleep → recovery, load → readiness,
 * meals → nutrition, each explained.
 */
export function DailyBriefingCard(): React.JSX.Element {
  const { t } = useTranslation();
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

  const CONFIDENCE_LABEL: Record<Confidence, string> = {
    high: t('common.confidence.high'),
    medium: t('common.confidence.medium'),
    to_confirm: t('common.confidence.toConfirm'),
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading">{t('home.dailyBriefing.title')}</Text>
        <Badge label={CONFIDENCE_LABEL[briefing.confidence]} tone={CONFIDENCE_TONE[briefing.confidence]} />
      </View>

      <Text variant="caption" color="textMuted">
        {t(briefing.headline.observation.key, briefing.headline.observation.params)}
      </Text>
      <Text variant="caption" color="textMuted">
        {t(briefing.headline.analysis.key, briefing.headline.analysis.params)}
      </Text>
      <Text variant="body">{t(briefing.headline.action.key, briefing.headline.action.params)}</Text>

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
              {t(s.title.key).toUpperCase()}
            </Text>
            <Text variant="data">{s.value !== null ? String(s.value) : '—'}</Text>
            <Text variant="caption" color="textMuted">
              {t(s.caption.key)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
