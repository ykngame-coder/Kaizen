import React, { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Gradient, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { DataSource, HealthMetricType } from '@supotsu/core';
import { useHealthMetrics } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDataRepository, exportUserData } from '@/lib/data/repository';

const DAY_MS = 86_400_000;

const SOURCE_LABEL: Partial<Record<DataSource, { name: string; icon: string }>> = {
  garmin: { name: 'Garmin', icon: '⌚' },
  apple_health: { name: 'Apple Santé', icon: '🍎' },
  renpho: { name: 'Renpho', icon: '⚖' },
  withings: { name: 'Withings', icon: '⚖' },
  polar: { name: 'Polar', icon: '❤️' },
  coros: { name: 'Coros', icon: '⌚' },
  oura: { name: 'Oura', icon: '💍' },
  fitbit: { name: 'Fitbit', icon: '⌚' },
  manual: { name: 'Manuel', icon: '✍️' },
};

const CORE_TYPES: HealthMetricType[] = ['sleep_duration', 'hrv', 'resting_heart_rate', 'weight', 'body_fat', 'muscle_mass'];
const TYPE_LABEL: Partial<Record<HealthMetricType, string>> = {
  sleep_duration: 'Sommeil', hrv: 'HRV', resting_heart_rate: 'FC repos', weight: 'Poids', body_fat: 'Masse grasse', muscle_mass: 'Masse musc.',
};

const OUTPUT_BRANCHES = ['Recovery', 'Sommeil', 'Nutrition', 'Statistiques', 'Rapports', 'Recommandations'];

function fmtAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `il y a ${Math.max(1, mins)} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/** Quality diagnostic row. */
function QRow({ ok, label, value }: { ok: 'good' | 'warn'; label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok === 'good' ? colors.accentData : colors.warning }} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="caption" color="textSubtle">
        {value}
      </Text>
    </View>
  );
}

/** Données & Intégrations (mockup #23) — data flow, quality, import/export. */
export function IntegrationsScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: health = [] } = useHealthMetrics();
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const sources = useMemo(() => {
    const map = new Map<DataSource, string>();
    for (const m of health) {
      const prev = map.get(m.source);
      if (!prev || m.measuredAt > prev) map.set(m.source, m.measuredAt);
    }
    return [...map.entries()].sort((a, b) => b[1].localeCompare(a[1]));
  }, [health]);

  const lastSync = sources[0]?.[1] ?? null;

  const quality = useMemo(() => {
    const present = new Set(health.map((m) => m.type));
    const completeness = Math.round((CORE_TYPES.filter((t) => present.has(t)).length / CORE_TYPES.length) * 100);
    // Duplicate = same type+source+measuredAt seen twice.
    const seen = new Set<string>();
    let duplicates = 0;
    for (const m of health) {
      const k = `${m.type}|${m.source}|${m.measuredAt}`;
      if (seen.has(k)) duplicates += 1;
      else seen.add(k);
    }
    const missing = CORE_TYPES.filter((t) => !present.has(t)).map((t) => TYPE_LABEL[t] ?? t);
    const weights = health.filter((m) => m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const lastWeight = weights.at(-1)?.measuredAt;
    const weightAgeDays = lastWeight ? Math.floor((Date.now() - new Date(lastWeight).getTime()) / DAY_MS) : null;
    return { completeness, duplicates, missing, weightAgeDays };
  }, [health]);

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
      <Text variant="title">Données & intégrations</Text>
      <Text variant="caption" color="textSubtle">
        Synchronisation • Import • Export
      </Text>

      {/* Résumé */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <Sum value={`${sources.length}`} label="Sources connectées" />
        <Sum value={`${health.length}`} label="Données santé" />
        <Sum value={lastSync ? fmtAgo(lastSync) : '—'} label="Dernière sync" small />
        <Sum value={health.length > 0 ? 'Tout fonctionne' : 'En attente'} label="État" small color={health.length > 0 ? colors.accentData : colors.textMuted} />
      </View>

      {/* Flux de données */}
      <Card>
        <Text variant="heading">Flux de données</Text>
        <View style={{ alignItems: 'center', marginTop: spacing[3], gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'center' }}>
            {(sources.length > 0 ? sources.map(([s]) => SOURCE_LABEL[s]?.name ?? s) : ['Aucune source']).map((s) => (
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
          <Text variant="heading">Sources & dernière donnée</Text>
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
                    {fmtAgo(ts)}
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
        <Text variant="heading">Qualité des données</Text>
        <View style={{ marginTop: spacing[2] }}>
          <QRow ok={quality.completeness >= 80 ? 'good' : 'warn'} label="Complétude" value={`${quality.completeness} %`} />
          <QRow ok={quality.duplicates === 0 ? 'good' : 'warn'} label="Doublons" value={quality.duplicates === 0 ? '0 détecté' : `${quality.duplicates} détecté(s)`} />
          <QRow ok={quality.missing.length === 0 ? 'good' : 'warn'} label="Données manquantes" value={quality.missing.length === 0 ? 'Aucune' : quality.missing.join(' · ')} />
          <QRow ok={quality.weightAgeDays == null || quality.weightAgeDays <= 7 ? 'good' : 'warn'} label="Dernière pesée" value={quality.weightAgeDays == null ? '—' : `il y a ${quality.weightAgeDays} j`} />
        </View>
      </Card>

      {/* Import / Export */}
      <Card>
        <Text variant="heading">Import & export</Text>
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2], flexWrap: 'wrap' }}>
          <Button label="Importer un fichier" onPress={() => router.push('/profile/import')} />
          <Button
            label={exportState === 'working' ? 'Export…' : exportState === 'done' ? 'Exporté ✓' : 'Exporter mes données'}
            variant="secondary"
            onPress={onExport}
            disabled={exportState === 'working' || !user}
          />
        </View>
        {exportState === 'error' ? (
          <Text variant="caption" color="error" style={{ marginTop: spacing[1] }}>
            Export impossible.
          </Text>
        ) : null}
      </Card>

      {/* Ajouter une intégration */}
      <Card>
        <Text variant="heading">Ajouter une intégration</Text>
        <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
          <Button label="Gérer les appareils & connexions" onPress={() => router.push('/profile/connectors')} />
        </View>
      </Card>

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
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
