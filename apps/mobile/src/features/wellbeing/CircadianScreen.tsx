import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { computeCircadianProfile, type Chronotype } from '@supotsu/engines';
import { useHealthMetrics } from '@/lib/data/queries';
import { EnergyWave } from './EnergyWave';

const CHRONOTYPE_TONE: Record<Chronotype, 'info' | 'success' | 'warning'> = {
  précoce: 'info',
  intermédiaire: 'success',
  tardif: 'warning',
};

/**
 * Circadian Engine screen (Sleep Suite §3.2). Derives the user's chronotype and
 * optimal timing from sleep history, in local time. Every figure is explained;
 * recommendations are guidance, not medical advice.
 */
export function CircadianScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: metrics = [], isLoading } = useHealthMetrics();
  const asOf = new Date().toISOString();
  // getTimezoneOffset() is minutes to add to local to reach UTC (negative east);
  // negate it to get "minutes to add to UTC to reach local".
  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  const result = useMemo(
    () => computeCircadianProfile(metrics, asOf, { tzOffsetMinutes }),
    [metrics, asOf, tzOffsetMinutes],
  );
  const profile = result.value;
  const explanation = result.explanation;

  const CHRONOTYPE_HINT: Record<Chronotype, string> = {
    précoce: t('wellbeing.circadian.chronotypeHint.précoce'),
    intermédiaire: t('wellbeing.circadian.chronotypeHint.intermédiaire'),
    tardif: t('wellbeing.circadian.chronotypeHint.tardif'),
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('wellbeing.circadian.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('wellbeing.circadian.subtitle')}
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          {t('wellbeing.circadian.loading')}
        </Text>
      ) : !profile ? (
        <EmptyState
          icon={<Icon name="moon" size={44} color={colors.textSubtle} />}
          title={t('wellbeing.circadian.emptyTitle')}
          message={t('wellbeing.circadian.emptyMessage')}
          actionLabel={t('wellbeing.circadian.emptyAction')}
          onAction={() => router.push('/profile/import')}
        />
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text variant="heading">{t('wellbeing.circadian.chronotypeTitle')}</Text>
              <Badge label={profile.chronotype} tone={CHRONOTYPE_TONE[profile.chronotype]} />
            </View>
            <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
              {CHRONOTYPE_HINT[profile.chronotype]}
            </Text>
          </Card>

          <Card>
            <Text variant="heading">{t('wellbeing.circadian.windowTitle')}</Text>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[2] }}
            >
              <View>
                <Text variant="caption" color="textSubtle">
                  {t('wellbeing.circadian.habitual')}
                </Text>
                <Text variant="subtitle">
                  {profile.habitualBedtime} → {profile.habitualWake}
                </Text>
              </View>
              <View>
                <Text variant="caption" color="textSubtle">
                  {t('wellbeing.circadian.ideal')}
                </Text>
                <Text variant="subtitle" color="primary">
                  {profile.idealBedtime} → {profile.idealWake}
                </Text>
              </View>
            </View>
            {profile.socialJetlagMin !== null && (
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing[2] }}>
                {t(
                  profile.socialJetlagMin >= 60
                    ? 'wellbeing.circadian.socialJetlagHigh'
                    : 'wellbeing.circadian.socialJetlagLow',
                  { min: profile.socialJetlagMin },
                )}
              </Text>
            )}
          </Card>

          <Card>
            <Text variant="heading">{t('wellbeing.circadian.energyTitle')}</Text>
            <Text variant="caption" color="textSubtle" style={{ marginTop: 2, marginBottom: spacing[2] }}>
              {t('wellbeing.circadian.energyHint')}
            </Text>
            <View style={{ alignItems: 'center' }}>
              <EnergyWave points={profile.energyCurve} />
            </View>
          </Card>

          <Card>
            <Text variant="heading">{t('wellbeing.circadian.scheduleTitle')}</Text>
            <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
              {profile.recommendations.map((r) => (
                <View key={r.key} style={{ gap: spacing[1] }}>
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                  >
                    <Text variant="body">{r.label}</Text>
                    <Text variant="subtitle" color="primary">
                      {r.value}
                    </Text>
                  </View>
                  <Text variant="caption" color="textSubtle">
                    {r.detail}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {explanation && (
            <Card>
              <Text variant="heading">{t('wellbeing.circadian.summaryTitle')}</Text>
              <Text variant="caption" color="textMuted">
                {t(explanation.observation.key, explanation.observation.params)}
              </Text>
              <Text variant="caption" color="textMuted">
                {t(explanation.analysis.key, explanation.analysis.params)}
              </Text>
              <Text variant="body" style={{ marginTop: spacing[1], color: colors.text }}>
                {t(explanation.action.key, explanation.action.params)}
              </Text>
            </Card>
          )}
        </>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
