import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Gradient, ProgressRing, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetricType } from '@supotsu/core';
import { computeAcwr, computeRecoveryScore, recoveryBand, sleepTrend } from '@supotsu/engines';
import { useActivities, useHealthMetrics } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { MuscleWidget } from './MuscleWidget';
import { NutritionWidget } from './NutritionWidget';

const DAY_MS = 86_400_000;

const BAND_INFO: Record<string, { label: string; advice: string }> = {
  excellent: { label: 'Excellent', advice: 'Votre récupération est excellente. C’est une journée idéale pour une séance intensive.' },
  correct: { label: 'Bon', advice: 'Bonne récupération. Une séance de qualité est à votre portée aujourd’hui.' },
  moyen: { label: 'Moyen', advice: 'Récupération partielle — modérez l’intensité et soignez votre sommeil ce soir.' },
  faible: { label: 'Faible', advice: 'Récupération faible — privilégiez le repos, la mobilité ou une marche.' },
};

/** Decimal hours → "8 h 12". */
function fmtSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function greetingName(email: string | undefined): string {
  const handle = (email ?? '').split('@')[0] ?? '';
  const cleaned = handle.replace(/[._-]+/g, ' ').trim().split(' ')[0] ?? '';
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function longDate(d: Date): string {
  return `${FR_DAYS[d.getDay()]!.charAt(0).toUpperCase()}${FR_DAYS[d.getDay()]!.slice(1)} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
}

/** Latest value of a health metric type at/under `asOf`. */
function latestMetric(health: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  const sorted = health.filter((m) => m.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  return sorted[sorted.length - 1]?.value;
}

const QUICK_LINKS: { label: string; icon: string; path: Href }[] = [
  { label: 'Repas', icon: '🍽', path: '/nutrition' },
  { label: 'Séance', icon: '▶️', path: '/workouts' },
  { label: 'Pesée', icon: '⚖', path: '/analytics' },
  { label: 'Habitude', icon: '✓', path: '/wellness' },
  { label: 'Objectif', icon: '🎯', path: '/goals' },
  { label: 'Sommeil', icon: '😴', path: '/sleep' },
  { label: 'Coach IA', icon: '✦', path: '/coach' },
  { label: 'Stats', icon: '📊', path: '/analytics' },
];

/** Small KPI tile (3-up grid) — icon, big value, delta, label. */
function KpiTile({ icon, value, delta, deltaTone, label }: { icon: string; value: string; delta?: string; deltaTone?: 'up' | 'down' | 'muted'; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dColor = deltaTone === 'up' ? colors.accentData : deltaTone === 'down' ? colors.error : colors.textSubtle;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <Text variant="subtitle" style={{ marginTop: spacing[1], letterSpacing: -0.4 }}>
        {value}
      </Text>
      {delta ? <Text variant="caption" style={{ color: dColor, marginTop: 2, fontWeight: '600' }}>{delta}</Text> : null}
      <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Accueil (Dashboard, mockup #1) — premium home. Header greeting + date, a
 * gradient "Focus du jour", the recovery ring with day-state, a KPI grid from
 * real health metrics, muscle/nutrition depth widgets, and a quick-access grid.
 */
export function DashboardScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: activities = [] } = useActivities();
  const { data: health = [] } = useHealthMetrics();
  const asOf = new Date().toISOString();

  const recovery = useMemo(() => {
    const today = computeRecoveryScore(health, asOf);
    if (today.confidence === 'to_confirm') return null;
    const yIso = new Date(new Date(asOf).getTime() - DAY_MS).toISOString();
    const y = computeRecoveryScore(health, yIso);
    return { value: today.value, band: recoveryBand(today.value), delta: y.confidence !== 'to_confirm' ? today.value - y.value : null };
  }, [health, asOf]);

  const nights = useMemo(() => [...sleepTrend(health, asOf, 7)].sort((a, b) => a.date.localeCompare(b.date)), [health, asOf]);
  const lastNight = nights[nights.length - 1];
  const prevNight = nights[nights.length - 2];
  const sleepDelta = lastNight && prevNight ? Math.round((lastNight.hours - prevNight.hours) * 60) : null;

  const acwr = useMemo(() => computeAcwr(activities, asOf), [activities, asOf]);

  const hrv = latestMetric(health, 'hrv');
  const rhr = latestMetric(health, 'resting_heart_rate');
  const weight = latestMetric(health, 'weight');
  const weekAgoWeight = useMemo(() => {
    const cutoff = new Date(new Date(asOf).getTime() - 7 * DAY_MS).getTime();
    const before = health.filter((m) => m.type === 'weight' && new Date(m.measuredAt).getTime() <= cutoff).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    return before[before.length - 1]?.value;
  }, [health, asOf]);
  const weightDelta = weight != null && weekAgoWeight != null ? weight - weekAgoWeight : null;

  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  };

  const firstName = greetingName(user?.email);
  const initial = (firstName || user?.email || 'K').charAt(0).toUpperCase();

  // Day-state derived from recovery + load.
  const energie = recovery ? (recovery.value >= 70 ? { t: 'Élevée', c: colors.accentData } : recovery.value >= 50 ? { t: 'Moyenne', c: colors.warning } : { t: 'Basse', c: colors.error }) : null;
  const fatigue = recovery ? (recovery.value >= 70 ? { t: 'Faible', c: colors.accentData } : recovery.value >= 50 ? { t: 'Modérée', c: colors.warning } : { t: 'Élevée', c: colors.error }) : null;
  const LOAD_ZONE: Record<string, { t: string; c: string }> = {
    'sous-charge': { t: 'Sous-charge', c: colors.info },
    optimal: { t: 'Optimale', c: colors.accentData },
    'élevé': { t: 'Élevée', c: colors.warning },
    risque: { t: 'Risque', c: colors.error },
  };
  const chargeState = acwr.zone ? LOAD_ZONE[acwr.zone] : null;

  const focusMessage = recovery
    ? recovery.value >= 80
      ? 'Votre récupération est excellente — c’est le moment idéal pour battre un record personnel.'
      : recovery.value >= 60
        ? 'Bonne récupération. Une séance de qualité est à votre portée aujourd’hui.'
        : 'Récupération partielle — privilégiez une séance légère ou de la mobilité.'
    : 'Importez vos données de santé pour débloquer votre focus du jour.';

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">Bonjour{firstName ? ` ${firstName}` : ''}</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            L&apos;excellence se construit aujourd&apos;hui.
          </Text>
          <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>
            {longDate(new Date())}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Pressable onPress={() => router.push('/notifications')}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16 }}>🔔</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/profile')}>
            <View style={{ width: 38, height: 38, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <Gradient fill />
              <Text variant="body" color="onPrimary" style={{ fontWeight: '700' }}>
                {initial}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Focus du jour — gradient-bordered card */}
      <Gradient style={{ borderRadius: radii.xl, padding: 1.5 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.xl - 1.5, padding: spacing[5], flexDirection: 'row', gap: spacing[4], alignItems: 'center' }}>
          <Text style={{ fontSize: 34 }}>🏋️</Text>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="primary" style={{ letterSpacing: 1.4, fontWeight: '700', textTransform: 'uppercase' }}>
              Focus du jour
            </Text>
            <Text variant="body" style={{ fontWeight: '600', marginTop: 4, lineHeight: 21 }}>
              {focusMessage}
            </Text>
          </View>
        </View>
      </Gradient>

      {/* État du jour */}
      <Card>
        <Text variant="heading">État du jour</Text>
        <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center', marginTop: spacing[3] }}>
          <ProgressRing value={recovery?.value ?? 0} size={104} thickness={10} gradient centerLabel={recovery ? `${recovery.value}` : '—'} caption="Recovery" />
          <View style={{ flex: 1, gap: spacing[3] }}>
            <Row label="Énergie" value={energie?.t ?? '—'} color={energie?.c} />
            <Row label="Charge" value={chargeState?.t ?? 'À calibrer'} color={chargeState?.c} />
            <Row label="Fatigue" value={fatigue?.t ?? '—'} color={fatigue?.c} />
          </View>
        </View>
        <View style={{ marginTop: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text variant="caption" color="textMuted" style={{ lineHeight: 20 }}>
            {recovery ? BAND_INFO[recovery.band]?.advice ?? focusMessage : 'Aucune donnée de récupération pour aujourd’hui.'}
          </Text>
        </View>
      </Card>

      {/* KPI grid */}
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <KpiTile icon="💤" value={lastNight ? fmtSleep(lastNight.hours) : '—'} delta={sleepDelta != null ? `${sleepDelta >= 0 ? '▲ +' : '▼ '}${Math.abs(sleepDelta)} min` : undefined} deltaTone={sleepDelta != null && sleepDelta >= 0 ? 'up' : 'down'} label="Sommeil" />
          <KpiTile icon="📈" value={hrv != null ? `${Math.round(hrv)} ms` : '—'} label="HRV" />
          <KpiTile icon="❤️" value={rhr != null ? `${Math.round(rhr)} bpm` : '—'} label="FC repos" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <KpiTile icon="⚖" value={weight != null ? weight.toFixed(1) : '—'} delta={weightDelta != null ? `${weightDelta <= 0 ? '▼ ' : '▲ +'}${Math.abs(weightDelta).toFixed(1)}` : undefined} deltaTone={weightDelta != null && weightDelta <= 0 ? 'up' : 'down'} label="Poids (kg)" />
          <KpiTile icon="✅" value={recovery ? BAND_INFO[recovery.band]?.label ?? '—' : '—'} label="Récupération" />
          <KpiTile icon="🏋️" value={acwr.ratio != null ? acwr.ratio.toFixed(2) : '—'} label="Charge (ACWR)" />
        </View>
      </View>

      {/* Corps & récupération */}
      <MuscleWidget />

      {/* Nutrition */}
      <NutritionWidget />

      {/* Accès rapides */}
      <Card>
        <Text variant="heading">Accès rapides</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing[2] }}>
          {QUICK_LINKS.map((l) => (
            <Pressable key={l.label} onPress={() => router.push(l.path)} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, paddingVertical: spacing[2], opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 52, height: 52, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{l.icon}</Text>
              </View>
              <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {l.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

/** Label ↔ value row used in the day-state block. */
function Row({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="body" color="textMuted">
        {label}
      </Text>
      <Text variant="body" style={{ fontWeight: '700', color }}>
        {value}
      </Text>
    </View>
  );
}
