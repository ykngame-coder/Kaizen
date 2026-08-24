import React, { useMemo, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, Gradient, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { DataSource, HealthMetric, HealthMetricType } from '@supotsu/core';
import { useDeleteHealthMetric, useHealthMetrics } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDataRepository, exportUserData } from '@/lib/data/repository';

const DAY_MS = 86_400_000;

function sourceLabel(t: TFunction): Partial<Record<DataSource, { name: string; icon: string }>> {
  return {
    garmin: { name: 'Garmin', icon: '⌚' },
    apple_health: { name: 'Apple Santé', icon: '🍎' },
    renpho: { name: 'Renpho', icon: '⚖' },
    withings: { name: 'Withings', icon: '⚖' },
    polar: { name: 'Polar', icon: '❤️' },
    coros: { name: 'Coros', icon: '⌚' },
    oura: { name: 'Oura', icon: '💍' },
    fitbit: { name: 'Fitbit', icon: '⌚' },
    manual: { name: t('connectors.integrations.sourceLabel.manual'), icon: '✍️' },
  };
}

const CORE_TYPES: HealthMetricType[] = ['sleep_duration', 'hrv', 'resting_heart_rate', 'weight', 'body_fat', 'muscle_mass'];

function typeLabel(t: TFunction): Partial<Record<HealthMetricType, string>> {
  return {
    sleep_duration: t('connectors.integrations.typeLabel.sleepDuration'),
    hrv: t('connectors.integrations.typeLabel.hrv'),
    resting_heart_rate: t('connectors.integrations.typeLabel.restingHeartRate'),
    weight: t('connectors.integrations.typeLabel.weight'),
    body_fat: t('connectors.integrations.typeLabel.bodyFat'),
    muscle_mass: t('connectors.integrations.typeLabel.muscleMass'),
  };
}

function outputBranches(t: TFunction): string[] {
  return [
    t('connectors.integrations.outputBranches.recovery'),
    t('connectors.integrations.outputBranches.sleep'),
    t('connectors.integrations.outputBranches.nutrition'),
    t('connectors.integrations.outputBranches.statistics'),
    t('connectors.integrations.outputBranches.reports'),
    t('connectors.integrations.outputBranches.recommendations'),
  ];
}

function fmtAgo(iso: string, t: TFunction): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return t('connectors.integrations.ago.minutes', { count: Math.max(1, mins) });
  const h = Math.round(mins / 60);
  if (h < 24) return t('connectors.integrations.ago.hours', { count: h });
  return t('connectors.integrations.ago.days', { count: Math.round(h / 24) });
}

/** Quality diagnostic row — tappable when `onPress` is given (e.g. duplicates, to expand detail). */
function QRow({ ok, label, value, onPress }: { ok: 'good' | 'warn'; label: string; value: string; onPress?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok === 'good' ? colors.accentData : colors.warning }} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="caption" color="textSubtle">
        {value}
      </Text>
      {onPress ? <Text variant="caption" color="textSubtle">{'›'}</Text> : null}
    </View>
  );
  if (!onPress) return row;
  return <Pressable onPress={onPress}>{row}</Pressable>;
}

/** One entry within a duplicate group, with a delete action. */
function DuplicateEntryRow({ metric, onDelete, deleting }: { metric: HealthMetric; onDelete: () => void; deleting: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const label = sourceLabel(t)[metric.source]?.name ?? metric.source;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
      <View style={{ flex: 1 }}>
        <Text variant="body">
          {metric.value} {metric.unit}
        </Text>
        <Text variant="caption" color="textSubtle">
          {typeLabel(t)[metric.type] ?? metric.type} · {label} · {fmtAgo(metric.measuredAt, t)}
        </Text>
      </View>
      <Button label={deleting ? t('connectors.integrations.duplicates.deleting') : t('connectors.integrations.duplicates.delete')} variant="secondary" onPress={onDelete} disabled={deleting} />
    </View>
  );
}

/** Données & Intégrations (mockup #23) — data flow, quality, import/export. */
export function IntegrationsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: health = [] } = useHealthMetrics();
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const SOURCE_LABEL = sourceLabel(t);
  const OUTPUT_BRANCHES = outputBranches(t);

  const sources = useMemo(() => {
    const map = new Map<DataSource, string>();
    for (const m of health) {
      const prev = map.get(m.source);
      if (!prev || m.measuredAt > prev) map.set(m.source, m.measuredAt);
    }
    return [...map.entries()].sort((a, b) => b[1].localeCompare(a[1]));
  }, [health]);

  const lastSync = sources[0]?.[1] ?? null;

  const [showDuplicates, setShowDuplicates] = useState(false);
  const deleteMetric = useDeleteHealthMetric();

  const quality = useMemo(() => {
    const present = new Set(health.map((m) => m.type));
    const completeness = Math.round((CORE_TYPES.filter((t2) => present.has(t2)).length / CORE_TYPES.length) * 100);
    // Duplicate = same type+source+measuredAt seen twice — group entries so the user can see and delete one.
    const groups = new Map<string, HealthMetric[]>();
    for (const m of health) {
      const k = `${m.type}|${m.source}|${m.measuredAt}`;
      const arr = groups.get(k);
      if (arr) arr.push(m);
      else groups.set(k, [m]);
    }
    const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
    const duplicates = duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0);
    const missing = CORE_TYPES.filter((t2) => !present.has(t2)).map((t2) => typeLabel(t)[t2] ?? t2);
    const weights = health.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const lastWeight = weights.at(-1)?.measuredAt;
    const weightAgeDays = lastWeight ? Math.floor((Date.now() - new Date(lastWeight).getTime()) / DAY_MS) : null;
    return { completeness, duplicates, duplicateGroups, missing, weightAgeDays };
  }, [health, t]);

  const onExport = async (): Promise<void> => {
    if (!user) return;
    setExportState('working');
    try {
      const data = await exportUserData(createDataRepository(), user.id);
      await Share.share({ message: JSON.stringify(data, null, 2) });
      setExportState('done');
    } catch {
      setExportState('error');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">{t('connectors.integrations.title')}</Text>
      <Text variant="caption" color="textSubtle">
        {t('connectors.integrations.subtitle')}
      </Text>

      {/* Résumé */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <Sum value={`${sources.length}`} label={t('connectors.integrations.summary.connectedSources')} />
        <Sum value={`${health.length}`} label={t('connectors.integrations.summary.healthData')} />
        <Sum value={lastSync ? fmtAgo(lastSync, t) : '—'} label={t('connectors.integrations.summary.lastSync')} small />
        <Sum
          value={health.length > 0 ? t('connectors.integrations.summary.allWorking') : t('connectors.integrations.summary.pending')}
          label={t('connectors.integrations.summary.status')}
          small
          color={health.length > 0 ? colors.accentData : colors.textMuted}
        />
      </View>

      {/* Flux de données */}
      <Card>
        <Text variant="heading">{t('connectors.integrations.dataFlow.title')}</Text>
        <View style={{ alignItems: 'center', marginTop: spacing[3], gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'center' }}>
            {(sources.length > 0 ? sources.map(([s]) => SOURCE_LABEL[s]?.name ?? s) : [t('connectors.integrations.dataFlow.noSource')]).map((s) => (
              <View key={s} style={{ backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2] }}>
                <Text variant="caption" color="textMuted">
                  {s}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.primary, fontSize: 18 }}>↓</Text>
          <Gradient style={{ borderRadius: radii.md, paddingHorizontal: spacing[5], paddingVertical: spacing[3] }}>
            <Text style={{ color: colors.onGradient, fontWeight: '800', letterSpacing: 0.5 }}>KAIZEN SUPOTSU</Text>
          </Gradient>
          <Text style={{ color: colors.primary, fontSize: 18 }}>↓</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'center' }}>
            {OUTPUT_BRANCHES.map((b) => (
              <View key={b} style={{ backgroundColor: colors.surfaceElevated, borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[2] }}>
                <Text variant="caption" color="textMuted">
                  {b}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* Historique par source */}
      {sources.length > 0 ? (
        <Card>
          <Text variant="heading">{t('connectors.integrations.sourcesHistory.title')}</Text>
          <View style={{ marginTop: spacing[2] }}>
            {sources.map(([s, ts], i) => {
              const meta = SOURCE_LABEL[s] ?? { name: s, icon: '📡' };
              return (
                <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < sources.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
                  </View>
                  <Text variant="body" style={{ flex: 1 }}>
                    {meta.name}
                  </Text>
                  <Text variant="caption" color="textSubtle">
                    {fmtAgo(ts, t)}
                  </Text>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentData }} />
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {/* Qualité des données */}
      <Card>
        <Text variant="heading">{t('connectors.integrations.quality.title')}</Text>
        <View style={{ marginTop: spacing[2] }}>
          <QRow ok={quality.completeness >= 80 ? 'good' : 'warn'} label={t('connectors.integrations.quality.completeness')} value={`${quality.completeness} %`} />
          <QRow
            ok={quality.duplicates === 0 ? 'good' : 'warn'}
            label={t('connectors.integrations.quality.duplicates')}
            value={quality.duplicates === 0 ? t('connectors.integrations.quality.noneDetected') : t('connectors.integrations.quality.detected', { count: quality.duplicates })}
            onPress={quality.duplicateGroups.length > 0 ? () => setShowDuplicates((v) => !v) : undefined}
          />
          <QRow
            ok={quality.missing.length === 0 ? 'good' : 'warn'}
            label={t('connectors.integrations.quality.missingData')}
            value={quality.missing.length === 0 ? t('connectors.integrations.quality.none') : quality.missing.join(' · ')}
          />
          <QRow
            ok={quality.weightAgeDays == null || quality.weightAgeDays <= 7 ? 'good' : 'warn'}
            label={t('connectors.integrations.quality.lastWeighIn')}
            value={quality.weightAgeDays == null ? '—' : t('connectors.integrations.ago.days', { count: quality.weightAgeDays })}
          />
        </View>
        {showDuplicates && quality.duplicateGroups.length > 0 ? (
          <View style={{ marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border, gap: spacing[3] }}>
            <Text variant="caption" color="textSubtle">
              {t('connectors.integrations.duplicates.hint')}
            </Text>
            {quality.duplicateGroups.map((group, gi) => (
              <View key={gi} style={{ backgroundColor: colors.surfaceElevated, borderRadius: radii.md, paddingHorizontal: spacing[3] }}>
                {group.map((m) => (
                  <DuplicateEntryRow key={m.id} metric={m} onDelete={() => deleteMetric.mutate(m.id)} deleting={deleteMetric.isPending && deleteMetric.variables === m.id} />
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {/* Import / Export */}
      <Card>
        <Text variant="heading">{t('connectors.integrations.importExport.title')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2], flexWrap: 'wrap' }}>
          <Button label={t('connectors.integrations.importExport.importButton')} onPress={() => router.push('/profile/import')} />
          <Button
            label={
              exportState === 'working'
                ? t('connectors.integrations.importExport.exporting')
                : exportState === 'done'
                  ? t('connectors.integrations.importExport.exported')
                  : t('connectors.integrations.importExport.exportButton')
            }
            variant="secondary"
            onPress={onExport}
            disabled={exportState === 'working' || !user}
          />
        </View>
        {exportState === 'error' ? (
          <Text variant="caption" color="error" style={{ marginTop: spacing[1] }}>
            {t('connectors.integrations.importExport.exportError')}
          </Text>
        ) : null}
      </Card>

      {/* Ajouter une intégration */}
      <Card>
        <Text variant="heading">{t('connectors.integrations.addIntegration.title')}</Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button label={t('connectors.integrations.addIntegration.manageButton')} onPress={() => router.push('/profile/connectors')} />
        </View>
      </Card>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function Sum({ value, label, small, color }: { value: string; label: string; small?: boolean; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant={small ? 'subtitle' : 'data'} style={{ color: color ?? colors.text, ...(small ? { fontSize: 16 } : {}) }}>
        {value}
      </Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}
