import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Card, Input, Screen, Text, useTheme, FilterChip } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { ActivityType } from '@supotsu/core';
import { useActivities, useGoals, useNutritionEntries, useRecords, useWorkouts } from '@/lib/data/queries';
import { formatDate } from '@/lib/format';

type Category = 'Pages' | 'Séances' | 'Activités' | 'Nutrition' | 'Objectifs' | 'Records';

interface Item {
  category: Category;
  icon: string;
  title: string;
  subtitle: string;
  path: Href;
  /** Extra search terms beyond title/subtitle — mostly for Pages (synonyms a user might type). */
  keywords?: string[];
}

/**
 * Every navigable screen worth finding by name — so typing "progression"
 * surfaces Progression musculaire even though it's never a data record.
 * Kept separate from the data index below; static, no query needed.
 */
const PAGES: Omit<Item, 'category' | 'icon'>[] = [
  { title: 'Planification', subtitle: 'Sport', path: '/sport/planning', keywords: ['planning', 'programmer'] },
  { title: 'Calendrier', subtitle: 'Sport', path: '/sport/calendar' },
  { title: 'Récupération musculaire', subtitle: 'Sport', path: '/sport/muscles', keywords: ['silhouette', 'fatigue', 'fraîcheur'] },
  { title: 'Progression musculaire', subtitle: 'Sport', path: '/sport/muscle-progress', keywords: ['progression', 'évolution', 'records', '1rm', 'performance'] },
  { title: "Charge d'entraînement", subtitle: 'Sport', path: '/sport/load', keywords: ['acwr', 'charge'] },
  { title: 'Stomach Vacuum', subtitle: 'Sport', path: '/sport/stomach-vacuum', keywords: ['gainage', 'transverse'] },
  { title: 'Minuteurs', subtitle: 'Sport', path: '/sport/timer', keywords: ['tabata', 'hiit', 'emom', 'chrono'] },
  { title: 'Étirements', subtitle: 'Programmes', path: '/sport/stretching', keywords: ['mobilité', 'stretching'] },
  { title: 'Bibliothèque d’exercices', subtitle: 'Sport', path: '/sport/exercises', keywords: ['exercices', 'catalogue'] },
  { title: 'Activités', subtitle: 'Sport', path: '/sport/activities', keywords: ['course', 'marche', 'vélo', 'cardio'] },
  { title: 'Rythme circadien', subtitle: 'Sommeil', path: '/sommeil/circadian', keywords: ['chronotype', 'énergie', 'circadien'] },
  { title: 'Récupération neuro', subtitle: 'Sommeil', path: '/sommeil/neuro-recovery', keywords: ['neuro', 'récupération'] },
  { title: 'Méditation', subtitle: 'Sommeil', path: '/sommeil/meditation' },
  { title: 'Sons', subtitle: 'Sommeil', path: '/sommeil/sound', keywords: ['bruit blanc', 'ambiance'] },
  { title: 'Respiration', subtitle: 'Sommeil', path: '/sommeil/breathing', keywords: ['cohérence cardiaque'] },
  { title: 'Audio bilatéral', subtitle: 'Sommeil', path: '/sommeil/bilateral' },
  { title: 'Check-in bien-être', subtitle: 'Sommeil', path: '/sommeil/wellness', keywords: ['stress', 'mental', 'humeur'] },
  { title: 'Journal alimentaire', subtitle: 'Nutrition', path: '/nutrition/journal', keywords: ['journal', 'repas'] },
  { title: 'Poids & composition', subtitle: 'Nutrition', path: '/nutrition/weight', keywords: ['pesée', 'poids', 'masse grasse'] },
  { title: 'Rechercher un aliment', subtitle: 'Nutrition', path: '/nutrition/food/search' },
  { title: 'Scanner un code-barres', subtitle: 'Nutrition', path: '/nutrition/food/scan', keywords: ['scan', 'code-barres'] },
  { title: 'Objectifs', subtitle: 'Profil', path: '/profile/goals', keywords: ['objectif', 'but', 'cible'] },
  { title: 'Habitudes & discipline', subtitle: 'Profil', path: '/profile/habits', keywords: ['habitude', 'discipline', 'série', 'streak'] },
  { title: 'Programmes', subtitle: 'Programmes', path: '/marketplace', keywords: ['catalogue', 'communauté', 'créations', 'marketplace'] },
  { title: 'Réglages', subtitle: 'Profil', path: '/profile/settings', keywords: ['paramètres', 'préférences'] },
  { title: 'Importer / connecter', subtitle: 'Profil', path: '/profile/import', keywords: ['import', 'export', 'fichier'] },
  { title: 'Appareils & capteurs', subtitle: 'Profil', path: '/profile/connectors', keywords: ['healthkit', 'garmin', 'apple santé', 'synchro'] },
  { title: 'Intégrations', subtitle: 'Profil', path: '/profile/integrations' },
  { title: 'Statistiques', subtitle: 'Profil', path: '/profile/analytics', keywords: ['stats', 'analyse'] },
  { title: 'Progression & badges', subtitle: 'Profil', path: '/profile/progression', keywords: ['badges', 'progression', 'récompenses'] },
  { title: 'Notifications', subtitle: 'Profil', path: '/profile/notifications', keywords: ['rappels', 'alertes'] },
  { title: 'Qualité des données', subtitle: 'Profil', path: '/profile/data-quality' },
  { title: 'Communauté', subtitle: 'Profil', path: '/profile/community', keywords: ['défis', 'challenges'] },
  { title: 'Rapport hebdomadaire', subtitle: 'Profil', path: '/profile/report', keywords: ['rapport', 'bilan', 'semaine'] },
  { title: 'Aide & support', subtitle: 'Profil', path: '/profile/support', keywords: ['aide', 'contact', 'support'] },
  { title: 'Coach IA', subtitle: 'Assistant', path: '/coach', keywords: ['coach', 'assistant', 'ia'] },
  { title: 'Comprendre', subtitle: 'Connaissances', path: '/comprendre', keywords: ['connaissances', 'science', 'articles'] },
  { title: 'Personnaliser le dashboard', subtitle: 'Accueil', path: '/dashboard-customize', keywords: ['dashboard', 'accueil', 'cartes'] },
];

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  walking: 'Marche', running: 'Course', cycling: 'Vélo', swimming: 'Natation', strength: 'Musculation',
  cross_training: 'Cross-training', hyrox: 'Hyrox', mobility: 'Mobilité', yoga: 'Yoga', other: 'Autre',
};

const FILTERS: ('Tous' | Category)[] = ['Tous', 'Pages', 'Séances', 'Activités', 'Nutrition', 'Objectifs', 'Records'];
const CAT_ICON: Record<Category, string> = { Pages: '🧭', Séances: '🎽', Activités: '🏃', Nutrition: '🍽', Objectifs: '🎯', Records: '🏆' };
const PAGE_ITEMS: Item[] = PAGES.map((p) => ({ ...p, category: 'Pages', icon: CAT_ICON.Pages }));

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
    const items: Item[] = [...PAGE_ITEMS];
    for (const w of workouts) items.push({ category: 'Séances', icon: CAT_ICON.Séances, title: w.name, subtitle: formatDate(w.completedAt ?? w.createdAt), path: { pathname: '/sport/workout/[id]', params: { id: w.id } } });
    for (const a of activities) items.push({ category: 'Activités', icon: CAT_ICON.Activités, title: ACTIVITY_LABEL[a.type], subtitle: `${formatDate(a.startedAt)} · ${Math.round(a.durationSec / 60)} min`, path: '/profile/analytics' });
    for (const n of nutrition) items.push({ category: 'Nutrition', icon: CAT_ICON.Nutrition, title: n.description, subtitle: `${Math.round(n.kcal)} kcal · ${formatDate(n.loggedAt)}`, path: '/nutrition' });
    for (const g of goals) items.push({ category: 'Objectifs', icon: CAT_ICON.Objectifs, title: g.title, subtitle: g.description ?? 'Objectif', path: '/profile/goals' });
    for (const r of records) items.push({ category: 'Records', icon: CAT_ICON.Records, title: r.label, subtitle: `${r.value} ${r.unit} · ${formatDate(r.achievedAt)}`, path: '/sport/muscle-progress' });
    return items;
  }, [workouts, activities, nutrition, goals, records]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index
      .filter(
        (it) =>
          (filter === 'Tous' || it.category === filter) &&
          (q === '' ||
            it.title.toLowerCase().includes(q) ||
            it.subtitle.toLowerCase().includes(q) ||
            (it.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false)),
      )
      .slice(0, 40);
  }, [index, query, filter]);

  return (
    <Screen scroll>
      <Text variant="title">Recherche</Text>
      <Input placeholder="Rechercher un écran, une séance, un aliment, un objectif…" value={query} onChangeText={setQuery} autoFocus />

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
