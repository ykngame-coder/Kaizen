import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, Icon, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { averageSleepHours, computeRecoveryScore } from '@supotsu/engines';
import { BackButton } from '@/features/navigation/BackButton';
import { HubRow } from '@/features/navigation/HubRow';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';

const DAY_MS = 86_400_000;

interface Section {
  title: string;
  subtitle: string;
  icon: string;
  path?: Href;
  soon?: boolean;
}

/** Weekly snapshot stat. */
function Snap({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radii.lg, padding: spacing[3], alignItems: 'center' }}>
      {typeof icon === 'string' ? <Text style={{ fontSize: 16 }}>{icon}</Text> : icon}
      <Text variant="subtitle" style={{ marginTop: spacing[1] }}>
        {value}
      </Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

/** Progression hub (architecture: Application → Progression) — snapshot + sections. */
export function ProgressionScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const asOf = new Date().toISOString();

  const snap = useMemo(() => {
    const since = new Date(asOf).getTime() - 7 * DAY_MS;
    const sessions = activities.filter((a) => new Date(a.startedAt).getTime() >= since).length;
    const avgSleep = averageSleepHours(health, asOf, 7);
    const rec = computeRecoveryScore(health, asOf);
    const weights = health.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const wLast = weights.at(-1)?.value;
    const wRef = weights.find((m) => new Date(m.measuredAt).getTime() >= since)?.value;
    const wDelta = wLast != null && wRef != null ? wLast - wRef : null;
    return {
      sessions,
      sleep: avgSleep != null && avgSleep > 0 ? `${avgSleep.toFixed(1)} h` : '—',
      recovery: rec.confidence === 'to_confirm' ? '—' : `${rec.value}`,
      weight: wDelta != null ? `${wDelta > 0 ? '+' : ''}${wDelta.toFixed(1)} kg` : '—',
    };
  }, [activities, health, asOf]);

  // Cross-pillar only — per-pillar trends (objectifs, records, photos) live in
  // their own hub now (Sport/Sommeil/Nutrition mini-accueils).
  const sections: Section[] = [
    { title: t('sport.progress.progression.sections.weeklyReport.title'), subtitle: t('sport.progress.progression.sections.weeklyReport.subtitle'), icon: '📄', path: '/profile/report' },
    { title: t('sport.progress.progression.sections.stats.title'), subtitle: t('sport.progress.progression.sections.stats.subtitle'), icon: '📊', path: '/profile/analytics' },
    { title: t('sport.progress.progression.sections.trends.title'), subtitle: t('sport.progress.progression.sections.trends.subtitle'), icon: '📈', path: '/profile/analytics' },
    { title: t('sport.progress.progression.sections.badges.title'), subtitle: t('sport.progress.progression.sections.badges.subtitle'), icon: '🏅', soon: true },
    { title: t('sport.progress.progression.sections.comparisons.title'), subtitle: t('sport.progress.progression.sections.comparisons.subtitle'), icon: '⚖', soon: true },
  ];

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{t('sport.progress.progression.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.progress.progression.subtitle')}
      </Text>

      {/* Bilan de la semaine */}
      <Card style={{ marginTop: spacing[3] }}>
        <Text variant="heading">{t('sport.progress.progression.weekHeading')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] }}>
          <Snap icon={<Icon name="armFlex" size={16} />} value={`${snap.sessions}`} label={t('sport.progress.progression.snap.sessions')} />
          <Snap icon={<Icon name="bedtime" size={16} />} value={snap.sleep} label={t('sport.progress.progression.snap.sleep')} />
          <Snap icon={<Icon name="checkCircle" size={16} />} value={snap.recovery} label={t('sport.progress.progression.snap.recovery')} />
          <Snap icon={<Icon name="scale" size={16} />} value={snap.weight} label={t('sport.progress.progression.snap.weight')} />
        </View>
      </Card>

      <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
        {sections.map((s) => (
          <HubRow key={s.title} title={s.title} subtitle={s.subtitle} icon={s.icon} soon={s.soon} onPress={s.path ? () => router.push(s.path!) : undefined} />
        ))}
      </View>
    </Screen>
  );
}
