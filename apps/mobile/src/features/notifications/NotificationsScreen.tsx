import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, Card, EmptyState, Gradient, Icon, ListRow, Screen, Text, Toggle, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { HealthMetricType } from '@supotsu/core';
import { computeCircadianProfile, computeRecoveryScore, estimateTargets, recoveryBand, sumDay } from '@supotsu/engines';
import {
  useHabitLogs,
  useHabits,
  useHealthMetrics,
  useNutritionEntries,
  useRecords,
  useSleepSessions,
} from '@/lib/data/queries';
import { formatClock, usePreferences, type TimeFormat } from '@/lib/preferences';

type Category = 'important' | 'sante' | 'nutrition' | 'entrainement' | 'succes' | 'appareils';

interface Notif {
  id: string;
  category: Category;
  icon: string;
  title: string;
  when: string;
  action?: { label: string; path: Href; primary?: boolean };
  path?: Href;
}

const DAY_MS = 86_400_000;
const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function relative(iso: string, t: TFunction): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return t('notifications.screen.relative.today');
  if (days === 1) return t('notifications.screen.relative.yesterday');
  return t('notifications.screen.relative.daysAgo', { count: days });
}
function hhmmWindow(hhmm: string, timeFormat: TimeFormat): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined) return hhmm;
  const base = h * 60 + m;
  const fmt = (min: number): string => {
    const mm = ((min % 1440) + 1440) % 1440;
    return formatClock(Math.floor(mm / 60), mm % 60, timeFormat);
  };
  return `${fmt(base - 15)} – ${fmt(base + 15)}`;
}
function latest(m: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  return m.filter((x) => x.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1)?.value;
}
function meanExcludingLast(m: { type: HealthMetricType; value: number; measuredAt: string }[], type: HealthMetricType): number | undefined {
  const s = m.filter((x) => x.type === type).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const prior = s.slice(0, -1);
  if (prior.length === 0) return undefined;
  return prior.reduce((acc, x) => acc + x.value, 0) / prior.length;
}

// `header` holds a translation KEY (not literal text) — resolve it with t() at render time.
const GROUPS: { key: Category; header: string; color: (c: ReturnType<typeof useTheme>['colors']) => string; tint: string }[] = [
  { key: 'important', header: 'notifications.screen.groups.important', color: (c) => c.error, tint: 'rgba(255,77,103,0.14)' },
  { key: 'sante', header: 'notifications.screen.groups.sante', color: (c) => c.accentData, tint: 'rgba(43,227,139,0.14)' },
  { key: 'nutrition', header: 'notifications.screen.groups.nutrition', color: (c) => c.warning, tint: 'rgba(245,183,66,0.14)' },
  { key: 'entrainement', header: 'notifications.screen.groups.entrainement', color: (c) => c.accentStrength, tint: 'rgba(255,139,56,0.14)' },
  { key: 'succes', header: 'notifications.screen.groups.succes', color: (c) => c.accentMobility, tint: 'rgba(139,92,246,0.16)' },
  { key: 'appareils', header: 'notifications.screen.groups.appareils', color: (c) => c.textMuted, tint: 'rgba(116,128,146,0.16)' },
];

/**
 * Centre de notifications (mockup #19). Every item is derived from the user's own
 * data — recovery, HRV/RHR trends, nutrition targets, records, sleep, habits and
 * device sync — grouped by category with per-category filters.
 */
export function NotificationsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { data: health = [] } = useHealthMetrics();
  const { data: records = [] } = useRecords();
  const { data: sessions = [] } = useSleepSessions();
  const { data: habits = [] } = useHabits();
  const { data: habitLogs = [] } = useHabitLogs();
  const { data: nutrition = [] } = useNutritionEntries();
  const [cleared, setCleared] = useState(false);
  const [enabled, setEnabled] = useState<Record<Category, boolean>>({ important: true, sante: true, nutrition: true, entrainement: true, succes: true, appareils: true });

  const asOf = new Date().toISOString();
  const recovery = useMemo(() => {
    const r = computeRecoveryScore(health, asOf);
    return r.confidence === 'to_confirm' ? null : { value: r.value, band: recoveryBand(r.value) };
  }, [health, asOf]);

  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = [];

    // Habits pending → important
    const todayKey = dayKey(new Date());
    const doneToday = new Set(habitLogs.filter((l) => dayKey(new Date(l.completedAt)) === todayKey).map((l) => l.habitId));
    const pending = habits.filter((h) => !h.archivedAt && !doneToday.has(h.id));
    if (pending.length > 0) {
      const title = pending.length === 1
        ? t('notifications.screen.notifs.habitSingular', { name: pending[0]!.name })
        : t('notifications.screen.notifs.habitPlural', { count: pending.length });
      out.push({ id: 'habits', category: 'important', icon: '✓', title, when: t('notifications.screen.relative.today'), action: { label: t('notifications.screen.notifs.actions.validate'), path: '/profile/habits', primary: true } });
    }

    // Nutrition — remaining protein / hydration from real targets
    const weight = latest(health, 'weight');
    const targets = estimateTargets({ weightKg: weight }, asOf).value;
    const totals = sumDay(nutrition, asOf);
    if (totals.kcal > 0 || nutrition.length > 0) {
      const proteinLeft = Math.round(targets.proteinG - totals.proteinG);
      if (proteinLeft > 5) out.push({ id: 'protein', category: 'important', icon: '🍗', title: t('notifications.screen.notifs.proteinLeft', { amount: proteinLeft }), when: t('notifications.screen.relative.today'), action: { label: t('notifications.screen.notifs.actions.addMeal'), path: '/nutrition' } });
      const waterLeft = Math.round(targets.hydrationMl - totals.hydrationMl);
      if (waterLeft > 200) out.push({ id: 'water', category: 'nutrition', icon: '💧', title: t('notifications.screen.notifs.waterLeft', { amount: (waterLeft / 1000).toFixed(1) }), when: t('notifications.screen.relative.today'), action: { label: t('notifications.screen.notifs.actions.hydration'), path: '/nutrition', primary: true } });
      const deficit = Math.round(targets.kcal - totals.kcal);
      if (deficit > 0) out.push({ id: 'deficit', category: 'nutrition', icon: '📉', title: t('notifications.screen.notifs.kcalLeft', { amount: deficit }), when: t('notifications.screen.relative.today'), path: '/nutrition' });
    }

    // Santé — recovery, HRV vs baseline, RHR vs baseline, bedtime, sleep
    if (recovery) {
      const band = recovery.band === 'excellent' ? t('notifications.screen.notifs.bandExcellent') : recovery.band === 'correct' ? t('notifications.screen.notifs.bandGood') : recovery.band;
      out.push({ id: 'recovery', category: 'sante', icon: '✅', title: t('notifications.screen.notifs.recoveryScore', { value: recovery.value, band }), when: t('notifications.screen.relative.today'), path: '/profile/analytics' });
    }
    const hrv = latest(health, 'hrv');
    const hrvBase = meanExcludingLast(health, 'hrv');
    if (hrv != null && hrvBase != null && hrvBase > 0) {
      const pct = Math.round(((hrv - hrvBase) / hrvBase) * 100);
      const direction = pct >= 0 ? t('notifications.screen.notifs.trendUp') : t('notifications.screen.notifs.trendDown');
      if (Math.abs(pct) >= 3) out.push({ id: 'hrv', category: 'sante', icon: '📈', title: t('notifications.screen.notifs.hrvTrend', { direction, pct: Math.abs(pct) }), when: t('notifications.screen.relative.today'), path: '/profile/analytics' });
    }
    const rhr = latest(health, 'resting_heart_rate');
    const rhrBase = meanExcludingLast(health, 'resting_heart_rate');
    if (rhr != null && rhrBase != null) {
      const diff = Math.round(rhr - rhrBase);
      if (diff >= 3) out.push({ id: 'rhr', category: 'sante', icon: '❤️', title: t('notifications.screen.notifs.rhrAboveAvg', { diff }), when: t('notifications.screen.relative.today'), path: '/profile/analytics' });
    }
    const circadian = computeCircadianProfile(health, asOf, { tzOffsetMinutes: -new Date().getTimezoneOffset() });
    if (circadian.value) out.push({ id: 'bedtime', category: 'sante', icon: '🌙', title: t('notifications.screen.notifs.bedtimeOptimal', { window: hhmmWindow(circadian.value.idealBedtime, preferences.timeFormat) }), when: t('notifications.screen.relative.today'), path: '/sommeil/circadian' });
    const lastNight = [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
    if (lastNight) {
      const h = Math.floor(lastNight.asleepMin / 60);
      const m = String(Math.round(lastNight.asleepMin % 60)).padStart(2, '0');
      out.push({ id: 'sleep', category: 'sante', icon: '😴', title: t('notifications.screen.notifs.sleepRecorded', { duration: `${h}h${m}` }), when: relative(lastNight.endedAt, t), path: '/sommeil' });
    }

    // Succès — last record + habits all done
    const lastRecord = [...records].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))[0];
    if (lastRecord) out.push({ id: 'record', category: 'succes', icon: '🏆', title: t('notifications.screen.notifs.record', { label: lastRecord.label, value: lastRecord.value, unit: lastRecord.unit }), when: relative(lastRecord.achievedAt, t), path: '/sport/muscle-progress' });
    if (habits.length > 0 && pending.length === 0) out.push({ id: 'habits-done', category: 'succes', icon: '🔥', title: t('notifications.screen.notifs.habitsAllDone'), when: t('notifications.screen.relative.today'), path: '/profile/habits' });

    // Appareils — Renpho pesée, latest sync
    const renpho = health.filter((m) => m.source === 'renpho' && m.type === 'weight').sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).at(-1);
    if (renpho) out.push({ id: 'renpho', category: 'appareils', icon: '⚖', title: t('notifications.screen.notifs.renphoWeight', { value: renpho.value.toFixed(1) }), when: relative(renpho.measuredAt, t), path: '/profile/integrations' });

    return out;
  }, [health, records, sessions, habits, habitLogs, nutrition, recovery, asOf, preferences.timeFormat, t]);

  const visible = notifs.filter((n) => enabled[n.category]);
  const hasAny = visible.length > 0;

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text variant="title">{t('notifications.screen.title')}</Text>
          <Text variant="caption" color="textSubtle">
            {t('notifications.screen.subtitle')}
          </Text>
        </View>
        {!cleared && notifs.length > 0 ? (
          <Pressable onPress={() => setCleared(true)} hitSlop={8}>
            <Text variant="caption" color="primary">
              {t('notifications.screen.markAllRead')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Priorité du jour */}
      {recovery ? (
        <Gradient style={{ borderRadius: radii.xl, padding: 1.5 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radii.xl - 1.5, padding: spacing[5] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(43,227,139,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{recovery.value >= 70 ? '🟢' : recovery.value >= 50 ? '🟡' : '🔴'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="primary" style={{ letterSpacing: 1.2, fontWeight: '700', textTransform: 'uppercase' }}>
                  {t('notifications.screen.priority.label')}
                </Text>
                <Text variant="body" style={{ fontWeight: '700', marginTop: 2 }}>
                  {recovery.band === 'excellent' ? t('notifications.screen.priority.recoveryExcellentTitle') : recovery.band === 'correct' ? t('notifications.screen.priority.recoveryGoodTitle') : t('notifications.screen.priority.recoveryWatchTitle')}
                </Text>
              </View>
            </View>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing[3], lineHeight: 21 }}>
              {t('notifications.screen.priority.scoreLine', { value: recovery.value })}{' '}
              {recovery.value >= 70 ? t('notifications.screen.priority.adviceHigh') : t('notifications.screen.priority.adviceLow')}
            </Text>
            <View style={{ alignItems: 'flex-start', marginTop: spacing[3] }}>
              <Button label={t('notifications.screen.priority.seeRecommendations')} onPress={() => router.push('/profile/analytics')} />
            </View>
          </View>
        </Gradient>
      ) : null}

      {cleared || notifs.length === 0 ? (
        <EmptyState icon={<Icon name="notifications" size={44} color={colors.textSubtle} />} title={cleared ? t('notifications.screen.emptyState.cleared.title') : t('notifications.screen.emptyState.empty.title')} message={t('notifications.screen.emptyState.message')} />
      ) : (
        <>
          {GROUPS.map((g) => {
            const items = visible.filter((n) => n.category === g.key);
            if (items.length === 0) return null;
            return (
              <View key={g.key} style={{ gap: spacing[2] }}>
                <Text variant="label" color="textSubtle" style={{ marginTop: spacing[1] }}>
                  {t(g.header)}
                </Text>
                {items.map((n) => (
                  <Card key={n.id}>
                    <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
                      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: g.tint, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 17 }}>{n.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" style={{ lineHeight: 20 }}>
                          {n.title}
                        </Text>
                        <Text variant="caption" color="textSubtle" style={{ marginTop: 4 }}>
                          {n.when}
                        </Text>
                        {n.action ? (
                          <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
                            <Button label={n.action.label} variant={n.action.primary ? 'primary' : 'secondary'} onPress={() => router.push(n.action!.path)} />
                          </View>
                        ) : null}
                      </View>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: g.color(colors) }} />
                    </View>
                  </Card>
                ))}
              </View>
            );
          })}
        </>
      )}

      {/* Filtres */}
      <Card>
        <Text variant="heading">Filtres</Text>
        <View style={{ marginTop: spacing[1] }}>
          {GROUPS.filter((g) => g.key !== 'important').map((g, i, arr) => (
            <View key={g.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: g.color(colors) }} />
                <Text variant="body">{g.header.replace(/^[^ ]+ /, '')}</Text>
              </View>
              <Toggle value={enabled[g.key]} onValueChange={(v) => setEnabled((e) => ({ ...e, [g.key]: v }))} />
            </View>
          ))}
        </View>
      </Card>

      {/* Paramètres */}
      <Card style={{ paddingVertical: spacing[1] }}>
        <ListRow icon={<Icon name="moon" color={colors.info} />} iconColor="rgba(45,127,249,0.18)" title="Heures de silence" value="22:30 – 07:00" onPress={() => router.push('/profile/settings')} divider />
        <ListRow icon={<Icon name="clipboardText" color={colors.accentData} />} iconColor="rgba(43,227,139,0.18)" title="Résumé quotidien" value="08:00" onPress={() => router.push('/profile/settings')} divider />
        <ListRow icon={<Icon name="chartBar" color={colors.accentMobility} />} iconColor="rgba(139,92,246,0.18)" title="Résumé hebdomadaire" value="Dimanche" onPress={() => router.push('/profile/report')} />
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Button label="Tout marquer lu" variant="secondary" onPress={() => setCleared(true)} disabled={cleared || !hasAny} />
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
