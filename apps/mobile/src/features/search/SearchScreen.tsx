import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Card, Input, Screen, Text, useTheme, FilterChip } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ActivityType } from '@supotsu/core';
import { useActivities, useGoals, useNutritionEntries, useRecords, useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';
import { EXERCISES, MUSCLE_LABEL } from '@/features/exercises/catalog';

type Category = 'Exercices' | 'Séances' | 'Activités' | 'Nutrition' | 'Objectifs' | 'Records';

interface Item {
  category: Category;
  icon: string;
  title: string;
  subtitle: string;
  path: Href;
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  walking: 'Marche', running: 'Course', cycling: 'Vélo', swimming: 'Natation', strength: 'Musculation',
  cross_training: 'Cross-training', hyrox: 'Hyrox', mobility: 'Mobilité', yoga: 'Yoga', other: 'Autre',
};

const FILTERS: ('Tous' | Category)[] = ['Tous', 'Exercices', 'Séances', 'Activités', 'Nutrition', 'Objectifs', 'Records'];
const CAT_ICON: Record<Category, string> = { Exercices: '🏋️', Séances: '🎽', Activités: '🏃', Nutrition: '🍽', Objectifs: '🎯', Records: '🏆' };

/** Recherche universelle (mockup #21) — searches the user's real local data. */
export function SearchScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'Tous' | Category>('Tous');

  const { data: workouts = [] } = useWorkouts();
  const { data: activities = [] } = useActivities();
  const { data: nutrition = [] } = useNutritionEntries();
  const { data: goals = [] } = useGoals();
  const { data: records = [] } = useRecords();

  const index = useMemo<Item[]>(() => {
    const items: Item[] = [];
    for (const e of EXERCISES) items.push({ category: 'Exercices', icon: CAT_ICON.Exercices, title: e.name, subtitle: `${MUSCLE_LABEL[e.primary]} · ${e.equipment}`, path: { pathname: '/sport/exercise/[id]', params: { id: e.id } } });
    for (const w of workouts) items.push({ category: 'Séances', icon: CAT_ICON.Séances, title: w.name, subtitle: formatDate(w.completedAt ?? w.createdAt), path: { pathname: '/sport/workout/[id]', params: { id: w.id } } });
    for (const a of activities) items.push({ category: 'Activités', icon: CAT_ICON.Activités, title: ACTIVITY_LABEL[a.type], subtitle: `${formatDate(a.startedAt)} · ${Math.round(a.durationSec / 60)} min`, path: '/profile/analytics' });
    for (const n of nutrition) items.push({ category: 'Nutrition', icon: CAT_ICON.Nutrition, title: n.description, subtitle: `${Math.round(n.kcal)} kcal · ${formatDate(n.loggedAt)}`, path: '/nutrition' });
    for (const g of goals) items.push({ category: 'Objectifs', icon: CAT_ICON.Objectifs, title: g.title, subtitle: g.description ?? 'Objectif', path: '/profile/goals' });
    for (const r of records) items.push({ category: 'Records', icon: CAT_ICON.Records, title: r.label, subtitle: `${r.value} ${r.unit} · ${formatDate(r.achievedAt)}`, path: '/sport/records' });
    return items;
  }, [workouts, activities, nutrition, goals, records]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.filter((it) => (filter === 'Tous' || it.category === filter) && (q === '' || it.title.toLowerCase().includes(q) || it.subtitle.toLowerCase().includes(q))).slice(0, 40);
  }, [index, query, filter]);

  return (
    <Screen scroll>
      <Text variant="title">Recherche</Text>
      <Input placeholder="Rechercher une séance, un aliment, un objectif…" value={query} onChangeText={setQuery} autoFocus />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {FILTERS.map((f) => (
          <FilterChip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {results.length === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">
            {query.trim() === '' ? 'Commence à taper pour chercher dans tes données.' : 'Aucun résultat pour cette recherche.'}
          </Text>
        </Card>
      ) : (
        <Card>
          {results.map((it, i) => (
            <Pressable key={i} onPress={() => router.push(it.path)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ width: 38, height: 38, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 17 }}>{it.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{it.title}</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 1 }}>
                    {it.category} · {it.subtitle}
                  </Text>
                </View>
                <Text variant="body" color="textSubtle">
                  ›
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
