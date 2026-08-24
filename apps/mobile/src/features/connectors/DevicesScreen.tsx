import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, Screen, Text, useTheme, type BadgeTone } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { CONNECTORS } from '@supotsu/connectors';
import type { DataSource, HealthMetricType } from '@supotsu/core';
import { useHealthMetrics, useImportHealth } from '@/lib/data/queries';
import { errorMessage } from '@/lib/errors';
import { healthKitAvailable, syncHealthKit } from './healthKitClient';
import { markHealthKitConnected } from './useHealthKitAutoSync';
import {
  disconnectGarmin,
  fetchGarminStatus,
  garminAvailable,
  startGarminConnect,
} from './garminClient';
import {
  disconnectStrava,
  fetchStravaStatus,
  startStravaConnect,
  stravaAvailable,
  syncStrava,
} from './stravaClient';
import { appleHealthAvailable, createIngestToken, ingestUrl } from './appleHealthClient';

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
    manual: { name: t('connectors.devices.sourceLabel.manual'), icon: '✍️' },
  };
}

function metricLabel(t: TFunction): Partial<Record<HealthMetricType, string>> {
  return {
    sleep_duration: t('connectors.devices.metricLabel.sleepDuration'),
    hrv: t('connectors.devices.metricLabel.hrv'),
    resting_heart_rate: t('connectors.devices.metricLabel.restingHeartRate'),
    weight: t('connectors.devices.metricLabel.weight'),
    body_fat: t('connectors.devices.metricLabel.bodyFat'),
    muscle_mass: t('connectors.devices.metricLabel.muscleMass'),
  };
}

/** Supported devices shown in the compatibility grid. */
const COMPATIBLE = ['Garmin', 'Apple Watch', 'Polar', 'Coros', 'Whoop', 'Oura', 'Withings', 'Renpho', 'Fitbit', 'Wahoo', 'Dexcom', 'Strava'];

function garminStatusUi(t: TFunction): Record<string, { label: string; tone: BadgeTone }> {
  return {
    connected: { label: t('connectors.devices.garmin.status.connected'), tone: 'success' },
    pending: { label: t('connectors.devices.garmin.status.pending'), tone: 'warning' },
    revoked: { label: t('connectors.devices.garmin.status.revoked'), tone: 'error' },
    disconnected: { label: t('connectors.devices.garmin.status.disconnected'), tone: 'neutral' },
  };
}

function fmtAgo(iso: string, t: TFunction): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return t('connectors.devices.ago.minutes', { count: Math.max(1, mins) });
  const h = Math.round(mins / 60);
  if (h < 24) return t('connectors.devices.ago.hours', { count: h });
  return t('connectors.devices.ago.days', { count: Math.round(h / 24) });
}

/** Summary KPI cell (2-up). */
function KpiCell({ value, label, small, color }: { value: string; label: string; small?: boolean; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[4] }}>
      <Text variant={small ? 'subtitle' : 'data'} style={{ color: color ?? colors.text, ...(small ? { fontSize: 18 } : {}) }}>
        {value}
      </Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

/** Real Garmin connection card (OAuth via the Garmin Edge Function). */
function GarminCard(): React.JSX.Element {
  const { t } = useTranslation();
  const available = garminAvailable();
  const status = useQuery({
    queryKey: ['garminStatus'],
    queryFn: fetchGarminStatus,
    enabled: available,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ui = garminStatusUi(t)[status.data ?? 'disconnected'];

  const connect = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await startGarminConnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectors.devices.garmin.connectError'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await disconnectGarmin();
      await status.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectors.devices.garmin.disconnectError'));
    } finally {
      setBusy(false);
    }
  };

  const connected = status.data === 'connected' || status.data === 'pending';

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">Garmin Connect</Text>
          <Text variant="caption" color="textMuted">
            {t('connectors.devices.garmin.caption')}
          </Text>
        </View>
        <Badge label={available ? ui.label : t('connectors.devices.backendRequired')} tone={available ? ui.tone : 'neutral'} />
      </View>
      {available ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          {connected ? (
            <Button
              label={busy ? '…' : t('connectors.devices.disconnect')}
              variant="danger"
              onPress={disconnect}
              disabled={busy}
            />
          ) : (
            <Button label={busy ? '…' : t('connectors.devices.garmin.connect')} onPress={connect} disabled={busy} />
          )}
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          {t('connectors.devices.garmin.backendInfo')}
        </Text>
      )}
      {error ? (
        <Text variant="caption" style={{ marginTop: spacing[1] }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

/** Real Strava connection card (OAuth2 + pull sync via the Strava Edge Function). */
function StravaCard(): React.JSX.Element {
  const { t } = useTranslation();
  const available = stravaAvailable();
  const status = useQuery({
    queryKey: ['stravaStatus'],
    queryFn: fetchStravaStatus,
    enabled: available,
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const connected = status.data === 'connected';

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setNote(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const detail = errorMessage(e, '');
      setNote(detail ? t('connectors.devices.strava.errorWithDetail', { detail }) : t('connectors.devices.strava.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">Strava</Text>
          <Text variant="caption" color="textMuted">
            {t('connectors.devices.strava.caption')}
          </Text>
        </View>
        <Badge
          label={
            available
              ? connected
                ? t('connectors.devices.strava.status.connected')
                : status.data === 'pending'
                  ? t('connectors.devices.strava.status.pending')
                  : t('connectors.devices.strava.status.notConnected')
              : t('connectors.devices.backendRequired')
          }
          tone={available ? (connected ? 'success' : 'neutral') : 'neutral'}
        />
      </View>
      {available ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          {connected ? (
            <>
              <Button
                label={busy ? '…' : t('connectors.devices.strava.sync')}
                onPress={() =>
                  run(async () => {
                    const n = await syncStrava();
                    setNote(n === 0 ? t('connectors.devices.strava.upToDate') : t('connectors.devices.strava.imported', { count: n }));
                    qc.invalidateQueries({ queryKey: ['activities'] });
                  })
                }
                disabled={busy}
              />
              <Button
                label={t('connectors.devices.disconnect')}
                variant="danger"
                onPress={() => run(async () => { await disconnectStrava(); await status.refetch(); })}
                disabled={busy}
              />
            </>
          ) : (
            <Button label={busy ? '…' : t('connectors.devices.strava.connect')} onPress={() => run(startStravaConnect)} disabled={busy} />
          )}
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          {t('connectors.devices.strava.backendInfo')}
        </Text>
      )}
      {note ? (
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing[1] }}>
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

/** Apple Santé via iOS Shortcuts webhook (free, no dev build). */
function AppleHealthCard(): React.JSX.Element {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const available = appleHealthAvailable();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = ingestUrl();

  const generate = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      setToken(await createIngestToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectors.devices.appleHealthShortcuts.generateError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">{t('connectors.devices.appleHealthShortcuts.title')}</Text>
          <Text variant="caption" color="textMuted">
            {t('connectors.devices.appleHealthShortcuts.caption')}
          </Text>
        </View>
        <Badge label={available ? t('connectors.devices.appleHealthShortcuts.free') : t('connectors.devices.backendRequired')} tone={available ? 'success' : 'neutral'} />
      </View>
      {available ? (
        <>
          <Button
            label={busy ? '…' : token ? t('connectors.devices.appleHealthShortcuts.regenerateToken') : t('connectors.devices.appleHealthShortcuts.generateToken')}
            onPress={generate}
            disabled={busy}
          />
          {token && url ? (
            <View style={{ gap: spacing[1], marginTop: spacing[1] }}>
              <Text variant="label" color="textMuted">
                {t('connectors.devices.appleHealthShortcuts.urlLabel')}
              </Text>
              <Text variant="caption" selectable style={{ color: colors.text }}>
                {url}
              </Text>
              <Text variant="label" color="textMuted">
                {t('connectors.devices.appleHealthShortcuts.tokenLabel')}
              </Text>
              <Text variant="caption" selectable style={{ color: colors.text }}>
                {token}
              </Text>
              <Text variant="caption" color="textMuted">
                {t('connectors.devices.appleHealthShortcuts.tokenHint')}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text variant="caption" color="textMuted">
          {t('connectors.devices.appleHealthShortcuts.backendInfo')}
        </Text>
      )}
      {error ? (
        <Text variant="caption" style={{ marginTop: spacing[1] }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * Renpho smart scale. Renpho has no public API, but it writes body composition
 * into Apple Santé — so its data reaches Supotsu through the Apple Santé / Health
 * Auto Export import and is attributed to the 'renpho' source. This card surfaces
 * that bridge and how many Renpho measurements were detected.
 */
function RenphoCard(): React.JSX.Element {
  const { t } = useTranslation();
  const { data: health = [] } = useHealthMetrics();
  const renpho = health.filter((m) => m.source === 'renpho');
  const connected = renpho.length > 0;
  const days = new Set(renpho.map((m) => m.measuredAt.slice(0, 10))).size;
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">{t('connectors.devices.renpho.title')}</Text>
          <Text variant="caption" color="textMuted">
            {t('connectors.devices.renpho.caption')}
          </Text>
        </View>
        <Badge
          label={connected ? t('connectors.devices.renpho.synced') : t('connectors.devices.renpho.viaAppleHealth')}
          tone={connected ? 'success' : 'neutral'}
        />
      </View>
      {connected ? (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {t('connectors.devices.renpho.detected', { count: renpho.length, days })}
        </Text>
      ) : (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {t('connectors.devices.renpho.notConnected')}
        </Text>
      )}
    </Card>
  );
}

/** "Mes appareils connectés" (Master Prompt P9.13, P22.14). */
/** Native Apple HealthKit (iOS build only) — reads Health directly on-device. */
function HealthKitCard(): React.JSX.Element {
  const { t } = useTranslation();
  const importHealth = useImportHealth();
  const isIos = Platform.OS === 'ios';
  const available = isIos && healthKitAvailable();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const sync = async (): Promise<void> => {
    setNote(null);
    setBusy(true);
    try {
      const { activities, healthMetrics, sleepSessions } = await syncHealthKit();
      await markHealthKitConnected();
      if (activities.length + healthMetrics.length + sleepSessions.length === 0) {
        setNote(t('connectors.devices.healthKit.noNewData'));
      } else {
        await importHealth.mutateAsync({ activities, healthMetrics, records: [], sleepSessions, workouts: [] });
        setNote(t('connectors.devices.healthKit.imported', { activitiesCount: activities.length, healthCount: healthMetrics.length }));
      }
    } catch (e) {
      const detail = errorMessage(e, '');
      setNote(
        detail
          ? t('connectors.devices.healthKit.syncErrorWithDetail', { detail })
          : t('connectors.devices.healthKit.syncError'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle">{t('connectors.devices.healthKit.title')}</Text>
          <Text variant="caption" color="textMuted">
            {t('connectors.devices.healthKit.caption')}
          </Text>
        </View>
        <Badge label={available ? t('connectors.devices.healthKit.native') : t('connectors.devices.healthKit.iosRequired')} tone={available ? 'success' : 'neutral'} />
      </View>
      {available ? (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] }}>
          <Button label={busy ? '…' : t('connectors.devices.healthKit.authorizeAndSync')} onPress={sync} disabled={busy} />
        </View>
      ) : (
        <Text variant="caption" color="textMuted">
          {t('connectors.devices.healthKit.notAvailable')}
        </Text>
      )}
      {note ? (
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

export function DevicesScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: health = [] } = useHealthMetrics();

  // Real breakdown of imported data by source.
  const bySource = React.useMemo(() => {
    const map = new Map<DataSource, { count: number; types: Set<HealthMetricType> }>();
    for (const m of health) {
      const e = map.get(m.source) ?? { count: 0, types: new Set<HealthMetricType>() };
      e.count += 1;
      e.types.add(m.type);
      map.set(m.source, e);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [health]);

  const lastSync = React.useMemo(() => {
    if (health.length === 0) return null;
    return health.reduce((max, m) => (m.measuredAt > max ? m.measuredAt : max), health[0]!.measuredAt);
  }, [health]);

  const SOURCE_LABEL = sourceLabel(t);
  const METRIC_LABEL = metricLabel(t);

  return (
    <Screen scroll>
      <Text variant="title">{t('connectors.devices.title')}</Text>
      <Text variant="caption" color="textSubtle">
        {t('connectors.devices.subtitle')}
      </Text>

      {/* Résumé */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <KpiCell value={`${bySource.length}`} label={t('connectors.devices.kpi.activeSources')} />
        <KpiCell value={`${health.length}`} label={t('connectors.devices.kpi.healthData')} />
        <KpiCell value={lastSync ? fmtAgo(lastSync, t) : '—'} label={t('connectors.devices.kpi.lastData')} small />
        <KpiCell
          value={health.length > 0 ? t('connectors.devices.kpi.active') : t('connectors.devices.kpi.pending')}
          label={t('connectors.devices.kpi.status')}
          small
          color={health.length > 0 ? colors.accentData : colors.textMuted}
        />
      </View>

      <Text variant="heading" style={{ marginTop: spacing[2] }}>
        {t('connectors.devices.appsAndDevices')}
      </Text>
      <HealthKitCard />
      <AppleHealthCard />
      <RenphoCard />
      <GarminCard />
      <StravaCard />

      <View style={{ gap: spacing[2] }}>
        {CONNECTORS.filter((c) => c.provider !== 'garmin' && c.provider !== 'strava').map((c) => (
          <Card key={c.provider}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="subtitle">{c.name}</Text>
                <Text variant="caption" color="textMuted">
                  {c.capabilities.includes('activities') ? t('connectors.devices.capability.activities') : ''}
                  {c.capabilities.length === 2 ? ' · ' : ''}
                  {c.capabilities.includes('health') ? t('connectors.devices.capability.health') : ''}
                </Text>
              </View>
              <Badge label={t('connectors.devices.comingSoon')} tone="neutral" />
            </View>
          </Card>
        ))}
      </View>

      {/* Données par source (réel) */}
      {bySource.length > 0 ? (
        <Card>
          <Text variant="heading">{t('connectors.devices.dataBySource')}</Text>
          <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
            {bySource.map(([source, info]) => {
              const meta = SOURCE_LABEL[source] ?? { name: source, icon: '📡' };
              return (
                <View key={source} style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
                  <View style={{ width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 19 }}>{meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="body" style={{ fontWeight: '700' }}>
                        {meta.name}
                      </Text>
                      <Text variant="caption" color="textSubtle">
                        {t('connectors.devices.dataCount', { count: info.count })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {[...info.types].map((tp) => (
                        <View key={tp} style={{ backgroundColor: colors.surfaceElevated, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Text variant="caption" color="textMuted">
                            {METRIC_LABEL[tp] ?? tp}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {/* Compatibilité */}
      <Card>
        <Text variant="heading">{t('connectors.devices.compatibility.title')}</Text>
        <Text variant="caption" color="textSubtle">
          {t('connectors.devices.compatibility.subtitle')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[3] }}>
          {COMPATIBLE.map((d) => (
            <View key={d} style={{ backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2] }}>
              <Text variant="caption" color="textMuted">
                {d}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text variant="heading">{t('connectors.devices.importFile.title')}</Text>
        <Text variant="body" color="textMuted">
          {t('connectors.devices.importFile.description')}
        </Text>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label={t('connectors.devices.importFile.button')} onPress={() => router.push('/profile/import')} />
        </View>
      </Card>

      <Card>
        <Text variant="heading">{t('connectors.devices.importedHealthData.title')}</Text>
        <Text variant="body" color="textMuted">
          {health.length === 0
            ? t('connectors.devices.importedHealthData.empty')
            : t('connectors.devices.importedHealthData.summary', { count: health.length })}
        </Text>
      </Card>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
