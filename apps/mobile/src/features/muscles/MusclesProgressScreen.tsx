import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { Badge, Button, Card, Icon, ProgressRing, Screen, SegmentedControl, Sparkline, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ActivityType, MuscleGroup } from '@supotsu/core';
import { computeMuscleStates } from '@supotsu/engines';
import { useActivities, useMuscleSessions, useMuscleWork, useRecords } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { BackButton } from '@/features/navigation/BackButton';
import { MuscleBody } from './MuscleBody';

const DAY_MS = 86_400_000;
const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];
const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Pectoraux', back: 'Dos', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', quads: 'Quadriceps', hamstrings: 'Ischios', glutes: 'Fessiers', calves: 'Mollets', core: 'Abdos / gainage', full_body: 'Corps entier',
};
const PERIODS = [
  { key: '30', label: '30 j', days: 30 },
  { key: '90', label: '90 j', days: 90 },
  { key: '180', label: '6 mois', days: 180 },
  { key: '365', label: '1 an', days: 365 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

const clamp = (x: number): number => Math.max(0, Math.min(100, x));
function progColor(idx: number): string {
  if (idx >= 85) return '#2BE38B';
  if (idx >= 70) return '#49D17A';
  if (idx >= 55) return '#F5B742';
  if (idx >= 40) return '#FF8B5E';
  return '#FF4D67';
}
function progLabel(idx: number): string {
  if (idx >= 85) return 'Forte progression';
  if (idx >= 70) return 'Progression';
  if (idx >= 55) return 'Stable';
  if (idx >= 40) return 'Faible';
  return 'En retard';
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
  const { colors } = useTheme();
  const { data: sessions = [] } = useMuscleSessions();
  const { data: activities = [] } = useActivities();
  const { data: records = [] } = useRecords();
  const now = useMemo(() => new Date(), []);
  const asOf = now.toISOString();
  const [period, setPeriod] = useState<PeriodKey>('90');
  const days = PERIODS.find((p) => p.key === period)!.days;
  const [selected, setSelected] = useState<MuscleGroup | null>(null);

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
      const t = new Date(w.trainedAt).getTime();
      if (t < since) continue;
      dates.add(w.trainedAt.slice(0, 10));
      const e = per.get(w.muscle);
      if (!e) continue;
      e.total += w.volume;
      if (t >= mid) e.recent += w.volume; else e.older += w.volume;
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
      const t = new Date(w.trainedAt).getTime();
      if (t < since) continue;
      const b = buckets - 1 - Math.floor(((now.getTime() - t) / DAY_MS) / span);
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
    { label: 'Poussée', value: meanIdx(['chest', 'shoulders', 'triceps']) },
    { label: 'Tirage', value: meanIdx(['back', 'biceps']) },
    { label: 'Jambes', value: meanIdx(['quads', 'hamstrings', 'glutes', 'calves']) },
    { label: 'Core', value: index.get('core') ?? 30 },
    { label: 'Cardio', value: actIdx(CARDIO) },
    { label: 'Mobilité', value: actIdx(MOBILITY) },
  ];

  // Priority muscles (lowest index).
  const priority = [...MUSCLES].sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0)).slice(0, 3);
  const weekRecords = [...records].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)).slice(0, 5);

  // Smart tips.
  const tips: string[] = [];
  const best = [...MUSCLES].sort((a, b) => (index.get(b) ?? 0) - (index.get(a) ?? 0))[0]!;
  if ((index.get(best) ?? 0) >= 70) tips.push(`${MUSCLE_LABEL[best]} progresse bien — tu peux augmenter légèrement le volume.`);
  const worst = priority[0]!;
  if ((index.get(worst) ?? 0) < 55) tips.push(`${MUSCLE_LABEL[worst]} est en retard — ajoute une séance ciblée.`);
  if ((index.get('core') ?? 0) < 55) tips.push('Le core est sous-entraîné — intègre davantage de gainage.');

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
      <Text variant="title">Progression musculaire</Text>
      <Text variant="caption" color="textSubtle">Où tu progresses, stagnes, et quoi travailler.</Text>

      <SegmentedControl options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} value={period} onChange={setPeriod} />

      {/* Global index */}
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing[5], alignItems: 'center' }}>
          <ProgressRing value={globalIndex} size={112} thickness={11} gradient centerLabel={`${globalIndex}`} caption="Indice" />
          <View style={{ flex: 1 }}>
            <Text variant="heading">Indice de progression</Text>
            <Text variant="body" style={{ color: progColor(globalIndex), fontWeight: '700', marginTop: 2 }}>{progLabel(globalIndex)}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: spacing[2], lineHeight: 18 }}>
              {sessionCount > 0 ? `${sessionCount} séance(s) musculaires sur la période — progression basée sur le volume (reps × charge).` : 'Enregistre des séances (avec reps × charge) pour suivre ta progression réelle par muscle.'}
            </Text>
          </View>
        </View>
      </Card>

      {/* Silhouette */}
      <Card>
        <SectionTitle>Carte musculaire</SectionTitle>
        <View style={{ alignItems: 'center' }}>
          <MuscleBody colorFor={colorFor} width={320} onSelect={(m) => setSelected(m)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], justifyContent: 'center', marginTop: spacing[2] }}>
          {[['#2BE38B', 'Forte'], ['#49D17A', 'Bonne'], ['#F5B742', 'Stable'], ['#FF8B5E', 'Faible'], ['#FF4D67', 'En retard']].map(([c, l]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c }} /><Text variant="caption" color="textSubtle">{l}</Text></View>
          ))}
        </View>
        <Text variant="caption" color="textSubtle" style={{ textAlign: 'center', marginTop: spacing[2] }}>Touche un muscle pour le détail.</Text>
        {hasUntrackedHealthKitStrength ? (
          <Text variant="caption" color="textSubtle" style={{ textAlign: 'center', marginTop: spacing[3], lineHeight: 17 }}>
            💡 Apple Santé ne transmet pas le détail des exercices — tes séances de musculation importées
            n'apparaissent pas ici. Enregistre-les via Sport → Bibliothèque d'exercices pour un suivi précis
            par muscle.
          </Text>
        ) : null}
      </Card>

      {/* Muscle detail */}
      {detail ? (
        <Card>
          <SectionTitle right={<Text variant="caption" color="textSubtle" onPress={() => setSelected(null)}>Fermer</Text>}>{MUSCLE_LABEL[detail.m]}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            <Metric label="Indice" value={`${Math.round(detail.idx)}`} color={progColor(detail.idx)} />
            <Metric label="Progression" value={detail.s?.progPct != null ? `${detail.s.progPct > 0 ? '+' : ''}${Math.round(detail.s.progPct)} %` : '—'} color={detail.s?.progPct != null ? progColor(detail.idx) : undefined} />
            <Metric label="Volume" value={detail.s && detail.s.total > 0 ? `${Math.round(detail.s.total).toLocaleString('fr-FR')}` : '—'} />
            <Metric label="Charge max" value={detail.s && detail.s.maxW > 0 ? `${detail.s.maxW} kg` : '—'} />
            <Metric label="Récupération" value={detail.st ? `${detail.st.freshness} %` : '—'} />
            <Metric label="Dernière séance" value={detail.st?.lastTrainedDaysAgo != null ? (detail.st.lastTrainedDaysAgo === 0 ? "Aujourd'hui" : `il y a ${detail.st.lastTrainedDaysAgo} j`) : '—'} />
          </View>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing[3], lineHeight: 20 }}>
            {detail.idx >= 70 ? 'Bonne stimulation — poursuis la surcharge progressive.' : detail.idx >= 55 ? 'Stimulation correcte — un peu plus de fréquence aiderait.' : 'Sous-stimulé — ajoute 1 à 2 séances ciblées par semaine.'}
          </Text>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
            <Button label="Voir des exercices" variant="secondary" onPress={() => router.push('/sport/exercises')} />
          </View>
        </Card>
      ) : null}

      {/* Evolution chart */}
      {evolution.some((v) => v > 0) ? (
        <Card>
          <SectionTitle right={<Text variant="caption" color="textSubtle">volume / semaine</Text>}>Évolution</SectionTitle>
          <Sparkline values={evolution} width={300} height={80} color={colors.primary} />
        </Card>
      ) : null}

      {/* Balance radar */}
      <Card>
        <SectionTitle>Répartition des progrès</SectionTitle>
        <Radar data={radar} />
      </Card>

      {/* Priority muscles */}
      <Card>
        <SectionTitle>À développer</SectionTitle>
        <View style={{ gap: spacing[3] }}>
          {priority.map((m) => (
            <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{MUSCLE_LABEL[m]}</Text>
                <Text variant="caption" color="textSubtle">Indice {Math.round(index.get(m) ?? 0)} · {(stats.get(m)?.total ?? 0) === 0 ? 'commence à travailler ce muscle' : 'augmente le volume'}</Text>
              </View>
              <Button label="Exercices" variant="secondary" onPress={() => router.push('/sport/exercises')} />
            </View>
          ))}
        </View>
      </Card>

      {/* Records */}
      {weekRecords.length > 0 ? (
        <View>
          <SectionTitle>Nouveaux records</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[3] }}>
            {weekRecords.map((r) => (
              <View key={r.id} style={{ width: 150, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing[3] }}>
                <Icon name="trophy" size={20} color={colors.warning} />
                <Text variant="subtitle" style={{ marginTop: spacing[2] }}>{r.value} {r.unit}</Text>
                <Text variant="caption" color="textMuted">{r.label}</Text>
                <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{formatDate(r.achievedAt)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Smart tips */}
      {tips.length > 0 ? (
        <View style={{ borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(43,227,139,0.25)', backgroundColor: 'rgba(43,227,139,0.08)', padding: spacing[5] }}>
          <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}><Icon name="lightbulb" size={20} color={colors.warning} /><Text variant="heading">Conseils</Text></View>
          <View style={{ marginTop: spacing[2], gap: spacing[1] }}>
            {tips.map((t, i) => (<Text key={i} variant="body" color="textMuted" style={{ lineHeight: 20 }}>• {t}</Text>))}
          </View>
        </View>
      ) : null}

      {/* Projection */}
      <Card>
        <SectionTitle>Projection</SectionTitle>
        <Text variant="body" color="textMuted" style={{ lineHeight: 21 }}>
          {sessionCount >= 3 ? `En conservant ce rythme (${(sessionCount / weeks).toFixed(1)} séance(s)/sem.), ton indice devrait dépasser ${Math.min(100, globalIndex + 5)} d'ici quelques semaines.` : 'Ajoute quelques séances pour obtenir une projection fiable.'}
        </Text>
      </Card>

      <Button label="Planifier la prochaine séance" onPress={() => router.push('/sport/workout/new')} />
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
