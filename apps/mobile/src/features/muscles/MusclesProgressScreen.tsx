import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, Button, Card, Icon, ProgressRing, Screen, SegmentedControl, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ActivityType, MuscleGroup, PersonalRecord, RecordCategory } from '@supotsu/core';
import { computeMuscleStates } from '@supotsu/engines';
import { useActivities, useMuscleSessions, useMuscleWork, useRecords } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { BackButton } from '@/features/navigation/BackButton';
import { MuscleBody } from './MuscleBody';

const DAY_MS = 86_400_000;
const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];

function muscleLabel(t: TFunction): Record<MuscleGroup, string> {
  return {
    chest: t('sport.muscles.progress.muscleLabel.chest'),
    back: t('sport.muscles.progress.muscleLabel.back'),
    shoulders: t('sport.muscles.progress.muscleLabel.shoulders'),
    biceps: t('sport.muscles.progress.muscleLabel.biceps'),
    triceps: t('sport.muscles.progress.muscleLabel.triceps'),
    quads: t('sport.muscles.progress.muscleLabel.quads'),
    hamstrings: t('sport.muscles.progress.muscleLabel.hamstrings'),
    glutes: t('sport.muscles.progress.muscleLabel.glutes'),
    calves: t('sport.muscles.progress.muscleLabel.calves'),
    core: t('sport.muscles.progress.muscleLabel.core'),
    full_body: t('sport.muscles.progress.muscleLabel.fullBody'),
  };
}

const PERIODS = [
  { key: '30', days: 30 },
  { key: '90', days: 90 },
  { key: '180', days: 180 },
  { key: '365', days: 365 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

function periodLabel(key: PeriodKey, t: TFunction): string {
  switch (key) {
    case '30':
      return t('sport.muscles.progress.periods.thirtyDays');
    case '90':
      return t('sport.muscles.progress.periods.ninetyDays');
    case '180':
      return t('sport.muscles.progress.periods.sixMonths');
    case '365':
      return t('sport.muscles.progress.periods.oneYear');
  }
}

const clamp = (x: number): number => Math.max(0, Math.min(100, x));
function progColor(idx: number): string {
  if (idx >= 85) return '#2BE38B';
  if (idx >= 70) return '#49D17A';
  if (idx >= 55) return '#F5B742';
  if (idx >= 40) return '#FF8B5E';
  return '#FF4D67';
}
function progLabel(idx: number, t: TFunction): string {
  if (idx >= 85) return t('sport.muscles.progress.progLabel.strong');
  if (idx >= 70) return t('sport.muscles.progress.progLabel.progressing');
  if (idx >= 55) return t('sport.muscles.progress.progLabel.stable');
  if (idx >= 40) return t('sport.muscles.progress.progLabel.weak');
  return t('sport.muscles.progress.progLabel.behind');
}

function recordCategoryLabel(t: TFunction): Record<RecordCategory, string> {
  return {
    run: t('sport.muscles.progress.recordCategory.run'),
    strength: t('sport.muscles.progress.recordCategory.strength'),
    cycling: t('sport.muscles.progress.recordCategory.cycling'),
    steps: t('sport.muscles.progress.recordCategory.steps'),
    other: t('sport.muscles.progress.recordCategory.other'),
  };
}

/** Human value: run times as mm:ss, distances as km, weights as kg, steps grouped. */
function formatRecordValue(r: PersonalRecord, t: TFunction): string {
  if (r.unit === 's') {
    const total = Math.round(r.value);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }
  if (r.unit === 'm') return r.value >= 1000 ? `${(r.value / 1000).toFixed(2)} km` : `${Math.round(r.value)} m`;
  if (r.unit === 'kg') return `${r.value} kg`;
  if (r.unit === 'steps') return `${Math.round(r.value).toLocaleString('fr-FR')} ${t('sport.muscles.progress.units.steps')}`;
  return `${r.value} ${r.unit}`;
}

const CARDIO: ActivityType[] = ['running', 'cycling', 'swimming', 'hyrox', 'cross_training', 'walking'];
const MOBILITY: ActivityType[] = ['mobility', 'yoga'];

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] }}>
      <Text variant="heading">{children}</Text>
      {right}
    </View>
  );
}

/** Small radar for muscle-group balance. */
function Radar({ data, size = 220 }: { data: { label: string; value: number }[]; size?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 30;
  const n = data.length;
  const pt = (i: number, frac: number): [number, number] => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r * frac, cy + Math.sin(a) * r * frac];
  };
  const poly = data.map((d, i) => pt(i, clamp(d.value) / 100).join(',')).join(' ');
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {[0.25, 0.5, 0.75, 1].map((g, gi) => (
          <Polygon key={gi} points={data.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke={colors.border} strokeWidth={1} />
        ))}
        {data.map((_, i) => { const [x, y] = pt(i, 1); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={colors.border} strokeWidth={1} />; })}
        <Polygon points={poly} fill="rgba(45,127,249,0.25)" stroke="#2d7ff9" strokeWidth={2} />
        {data.map((_, i) => { const [x, y] = pt(i, clamp(data[i]!.value) / 100); return <Circle key={i} cx={x} cy={y} r={3} fill="#8b5cf6" />; })}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'center' }}>
        {data.map((d) => (<Text key={d.label} variant="caption" color="textSubtle">{d.label} {Math.round(d.value)}</Text>))}
      </View>
    </View>
  );
}

/** Progression musculaire (mockup #6) — per-muscle evolution from training frequency + recovery. */
export function MusclesProgressScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: sessions = [] } = useMuscleSessions();
  const { data: activities = [] } = useActivities();
  const { data: records = [] } = useRecords();
  const now = useMemo(() => new Date(), []);
  const asOf = now.toISOString();
  const [period, setPeriod] = useState<PeriodKey>('90');
  const days = PERIODS.find((p) => p.key === period)!.days;
  const [selected, setSelected] = useState<MuscleGroup | null>(null);

  const MUSCLE_LABEL = useMemo(() => muscleLabel(t), [t]);
  const RECORD_CATEGORY_LABEL = useMemo(() => recordCategoryLabel(t), [t]);

  const { data: work = [] } = useMuscleWork();
  const states = useMemo(() => computeMuscleStates(sessions, asOf), [sessions, asOf]);
  const stateOf = (m: MuscleGroup) => states.find((s) => s.muscle === m);

  // Real per-muscle progression: training volume (reps × load) trend, recent vs
  // older half of the window. Volume → index → colour.
  const { index, stats, sessionCount, weeks } = useMemo(() => {
    const since = now.getTime() - days * DAY_MS;
    const mid = now.getTime() - (days / 2) * DAY_MS;
    const wk = Math.max(1, days / 7);
    const per = new Map<MuscleGroup, { recent: number; older: number; total: number; maxW: number }>();
    for (const m of MUSCLES) per.set(m, { recent: 0, older: 0, total: 0, maxW: 0 });
    const dates = new Set<string>();
    for (const w of work) {
      const ts = new Date(w.trainedAt).getTime();
      if (ts < since) continue;
      dates.add(w.trainedAt.slice(0, 10));
      const e = per.get(w.muscle);
      if (!e) continue;
      e.total += w.volume;
      if (ts >= mid) e.recent += w.volume; else e.older += w.volume;
      if (w.weightKg != null) e.maxW = Math.max(e.maxW, w.weightKg);
    }
    const idx = new Map<MuscleGroup, number>();
    const st = new Map<MuscleGroup, { progPct: number | null; total: number; maxW: number }>();
    for (const m of MUSCLES) {
      const e = per.get(m)!;
      const progPct = e.older > 0 ? ((e.recent - e.older) / e.older) * 100 : e.recent > 0 ? 40 : null;
      const index = e.total === 0 ? 32 : clamp(58 + (progPct ?? 0) * 1.6);
      idx.set(m, index);
      st.set(m, { progPct, total: e.total, maxW: e.maxW });
    }
    return { index: idx, stats: st, sessionCount: dates.size, weeks: wk };
  }, [work, now, days]);

  const globalIndex = Math.round(MUSCLES.reduce((s, m) => s + (index.get(m) ?? 0), 0) / MUSCLES.length);

  const colorFor = (m: MuscleGroup): string => progColor(index.get(m) ?? 30);

  // Weekly training volume (evolution chart).
  const evolution = useMemo(() => {
    const buckets = Math.min(12, Math.max(4, Math.round(days / 7)));
    const arr = new Array(buckets).fill(0) as number[];
    const span = days / buckets;
    const since = now.getTime() - days * DAY_MS;
    for (const w of work) {
      const ts = new Date(w.trainedAt).getTime();
      if (ts < since) continue;
      const b = buckets - 1 - Math.floor(((now.getTime() - ts) / DAY_MS) / span);
      if (b >= 0 && b < buckets) arr[b] += w.volume;
    }
    return arr;
  }, [work, now, days]);

  // Radar balance.
  const meanIdx = (ms: MuscleGroup[]): number => ms.reduce((s, m) => s + (index.get(m) ?? 0), 0) / ms.length;
  const actIdx = (types: ActivityType[]): number => {
    const since = now.getTime() - days * DAY_MS;
    const c = activities.filter((a) => types.includes(a.type) && new Date(a.startedAt).getTime() >= since).length;
    return clamp(30 + (c / weeks) * 22);
  };
  const radar = [
    { label: t('sport.muscles.progress.radar.push'), value: meanIdx(['chest', 'shoulders', 'triceps']) },
    { label: t('sport.muscles.progress.radar.pull'), value: meanIdx(['back', 'biceps']) },
    { label: t('sport.muscles.progress.radar.legs'), value: meanIdx(['quads', 'hamstrings', 'glutes', 'calves']) },
    { label: t('sport.muscles.progress.radar.core'), value: index.get('core') ?? 30 },
    { label: t('sport.muscles.progress.radar.cardio'), value: actIdx(CARDIO) },
    { label: t('sport.muscles.progress.radar.mobility'), value: actIdx(MOBILITY) },
  ];

  // Priority muscles (lowest index).
  const priority = [...MUSCLES].sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0)).slice(0, 3);

  // Records grouped by category, best-first (mirrors the old standalone Records screen — merged here since they're both "how am I progressing").
  const recordGroups = useMemo(() => {
    const map = new Map<RecordCategory, PersonalRecord[]>();
    for (const r of records) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    for (const [cat, list] of map) {
      list.sort((a, b) => (cat === 'run' && a.unit === 's' ? a.value - b.value : b.value - a.value));
    }
    return [...map.entries()];
  }, [records]);

  // Smart tips.
  const tips: string[] = [];
  const best = [...MUSCLES].sort((a, b) => (index.get(b) ?? 0) - (index.get(a) ?? 0))[0]!;
  if ((index.get(best) ?? 0) >= 70) tips.push(t('sport.muscles.progress.tips.progressingWell', { muscle: MUSCLE_LABEL[best] }));
  const worst = priority[0]!;
  if ((index.get(worst) ?? 0) < 55) tips.push(t('sport.muscles.progress.tips.behind', { muscle: MUSCLE_LABEL[worst] }));
  if ((index.get('core') ?? 0) < 55) tips.push(t('sport.muscles.progress.tips.coreUnderTrained'));

  const detail = selected ? { m: selected, idx: index.get(selected) ?? 30, st: stateOf(selected), s: stats.get(selected) } : null;

  // Apple Santé only gives a generic "Musculation" session (type + durée),
  // jamais le détail exercice par exercice — donc rien à en tirer par muscle.
  // On le signale seulement si ça concerne vraiment l'utilisateur.
  const hasUntrackedHealthKitStrength = activities.some(
    (a) => a.type === 'strength' && a.source === 'apple_health',
  );

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="title">{t('sport.muscles.progress.title')}</Text>
      <Text variant="caption" color="textSubtle">{t('sport.muscles.progress.subtitle')}</Text>

      <SegmentedControl options={PERIODS.map((p) => ({ value: p.key, label: periodLabel(p.key, t) }))} value={period} onChange={setPeriod} />

      {/* Global index */}
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
          <ProgressRing value={globalIndex} size={112} thickness={11} gradient centerLabel={`${globalIndex}`} caption={t('sport.muscles.progress.indexCaption')} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{t('sport.muscles.progress.indexTitle')}</Text>
            <Text variant="body" style={{ color: progColor(globalIndex), fontWeight: '700', marginTop: 2 }}>{progLabel(globalIndex, t)}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 18 }}>
              {sessionCount > 0 ? t('sport.muscles.progress.indexSummary.withData', { count: sessionCount }) : t('sport.muscles.progress.indexSummary.noData')}
            </Text>
          </View>
        </View>
      </Card>

      {/* Silhouette */}
      <Card>
        <SectionTitle>{t('sport.muscles.progress.map.title')}</SectionTitle>
        <View style={{ alignItems: 'center' }}>
          <MuscleBody colorFor={colorFor} width={320} onSelect={(m) => setSelected(m)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], justifyContent: 'center', marginTop: spacing[2] }}>
          {[
            ['#2BE38B', t('sport.muscles.progress.map.legend.strong')],
            ['#49D17A', t('sport.muscles.progress.map.legend.good')],
            ['#F5B742', t('sport.muscles.progress.map.legend.stable')],
            ['#FF8B5E', t('sport.muscles.progress.map.legend.weak')],
            ['#FF4D67', t('sport.muscles.progress.map.legend.behind')],
          ].map(([c, l]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c }} /><Text variant="caption" color="textSubtle">{l}</Text></View>
          ))}
        </View>
        <Text variant="caption" color="textSubtle" style={{ textAlign: 'center', marginTop: spacing[2] }}>{t('sport.muscles.progress.map.hint')}</Text>
        {hasUntrackedHealthKitStrength ? (
          <Text variant="caption" color="textSubtle" style={{ textAlign: 'center', marginTop: spacing[3], lineHeight: 17 }}>
            {t('sport.muscles.progress.map.healthKitNote')}
          </Text>
        ) : null}
      </Card>

      {/* Muscle detail */}
      {detail ? (
        <Card>
          <SectionTitle right={<Text variant="caption" color="textSubtle" onPress={() => setSelected(null)}>{t('common.close')}</Text>}>{MUSCLE_LABEL[detail.m]}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            <Metric label={t('sport.muscles.progress.metrics.index')} value={`${Math.round(detail.idx)}`} color={progColor(detail.idx)} />
            <Metric label={t('sport.muscles.progress.metrics.progression')} value={detail.s?.progPct != null ? `${detail.s.progPct > 0 ? '+' : ''}${Math.round(detail.s.progPct)} %` : '—'} color={detail.s?.progPct != null ? progColor(detail.idx) : undefined} />
            <Metric label={t('sport.muscles.progress.metrics.volume')} value={detail.s && detail.s.total > 0 ? `${Math.round(detail.s.total).toLocaleString('fr-FR')}` : '—'} />
            <Metric label={t('sport.muscles.progress.metrics.maxWeight')} value={detail.s && detail.s.maxW > 0 ? `${detail.s.maxW} kg` : '—'} />
            <Metric label={t('sport.muscles.progress.metrics.recovery')} value={detail.st ? `${detail.st.freshness} %` : '—'} />
            <Metric label={t('sport.muscles.progress.metrics.lastSession')} value={detail.st?.lastTrainedDaysAgo != null ? (detail.st.lastTrainedDaysAgo === 0 ? t('sport.muscles.progress.metrics.today') : t('sport.muscles.progress.metrics.daysAgo', { count: detail.st.lastTrainedDaysAgo })) : '—'} />
          </View>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[3], lineHeight: 20 }}>
            {detail.idx >= 70 ? t('sport.muscles.progress.detail.good') : detail.idx >= 55 ? t('sport.muscles.progress.detail.ok') : t('sport.muscles.progress.detail.low')}
          </Text>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
            <Button label={t('sport.muscles.progress.detail.viewExercisesButton')} variant="secondary" onPress={() => router.push('/sport/exercises')} />
          </View>
        </Card>
      ) : null}

      {/* Evolution chart */}
      {evolution.some((v) => v > 0) ? (
        <Card>
          <SectionTitle right={<Text variant="caption" color="textSubtle">{t('sport.muscles.progress.evolution.unit')}</Text>}>{t('sport.muscles.progress.evolution.title')}</SectionTitle>
          <Sparkline values={evolution} width={300} height={80} color={colors.primary} />
        </Card>
      ) : null}

      {/* Balance radar */}
      <Card>
        <SectionTitle>{t('sport.muscles.progress.radar.title')}</SectionTitle>
        <Radar data={radar} />
      </Card>

      {/* Priority muscles */}
      <Card>
        <SectionTitle>{t('sport.muscles.progress.priority.title')}</SectionTitle>
        <View style={{ gap: spacing[3] }}>
          {priority.map((m) => (
            <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{MUSCLE_LABEL[m]}</Text>
                <Text variant="caption" color="textSubtle">
                  {t('sport.muscles.progress.priority.indexLabel', { n: Math.round(index.get(m) ?? 0) })} ·{' '}
                  {(stats.get(m)?.total ?? 0) === 0 ? t('sport.muscles.progress.priority.startWorking') : t('sport.muscles.progress.priority.increaseVolume')}
                </Text>
              </View>
              <Button label={t('sport.muscles.progress.priority.exercisesButton')} variant="secondary" onPress={() => router.push('/sport/exercises')} />
            </View>
          ))}
        </View>
      </Card>

      {/* Records — merged from the old standalone Records screen: 1RM, meilleurs temps, distances, tout ce qui mesure "où j'en suis" par rapport à moi-même, comme la progression musculaire au-dessus. */}
      {recordGroups.length > 0 ? (
        <>
          <SectionTitle>{t('sport.muscles.progress.records.title')}</SectionTitle>
          {recordGroups.map(([category, list]) => (
            <Card key={category}>
              <Text variant="heading">{RECORD_CATEGORY_LABEL[category]}</Text>
              <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                {list.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: spacing[2] }}>
                      <Text variant="body">{r.label}</Text>
                      <Text variant="caption" color="textMuted">{formatDate(r.achievedAt)}</Text>
                    </View>
                    <Badge label={formatRecordValue(r, t)} tone="info" />
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {/* Smart tips */}
      {tips.length > 0 ? (
        <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(43,227,139,0.25)', backgroundColor: 'rgba(43,227,139,0.08)', padding: spacing[5] }}>
          <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Icon name="lightbulb" size={20} color={colors.warning} /><Text variant="heading">{t('sport.muscles.progress.tips.title')}</Text></View>
          <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
            {tips.map((tip, i) => (<Text key={i} variant="body" color="textMuted" style={{ lineHeight: 20 }}>• {tip}</Text>))}
          </View>
        </View>
      ) : null}

      {/* Projection */}
      <Card>
        <SectionTitle>{t('sport.muscles.progress.projection.title')}</SectionTitle>
        <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>
          {sessionCount >= 3
            ? t('sport.muscles.progress.projection.withData', { rate: (sessionCount / weeks).toFixed(1), target: Math.min(100, globalIndex + 5) })
            : t('sport.muscles.progress.projection.noData')}
        </Text>
      </Card>

      <Button label={t('sport.muscles.progress.planNextButton')} onPress={() => router.push('/sport/workout/new')} />
    </Screen>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '40%' }}>
      <Text variant="caption" color="textSubtle">{label}</Text>
      <Text variant="subtitle" style={{ color: color ?? colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
