import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, FilterChip, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import type { MuscleGroup } from '@supotsu/core';
import { CATEGORY_ICON, EXERCISES, MUSCLE_ICON, MUSCLE_LABEL, type ExerciseCategory } from './catalog';

const MUSCLE_FILTERS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'];
const CATEGORY_FILTERS: ExerciseCategory[] = ['force', 'cardio', 'mobilité'];
const LIMIT = 60;

/** Bibliothèque d'exercices — browse and search the 873-exercise catalogue with filters. */
export function ExerciseLibraryScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');

  const all = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => {
      if (muscle !== 'all' && e.primary !== muscle && !e.secondary.includes(muscle)) return false;
      if (category !== 'all' && e.category !== category) return false;
      if (q && !e.name.toLowerCase().includes(q) && !MUSCLE_LABEL[e.primary].toLowerCase().includes(q) && !e.equipment.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, muscle, category]);
  const results = all.slice(0, LIMIT);

  return (
    <Screen scroll>
      <Text variant="title">Exercices</Text>
      <Text variant="caption" color="textSubtle">{EXERCISES.length} exercices · force, cardio & mobilité</Text>

      <Input placeholder="Rechercher un exercice, un muscle, un matériel…" value={query} onChangeText={setQuery} autoFocus={false} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <FilterChip label="Tous" active={category === 'all'} onPress={() => setCategory('all')} />
        {CATEGORY_FILTERS.map((c) => (<FilterChip key={c} label={`${CATEGORY_ICON[c]} ${c.charAt(0).toUpperCase()}${c.slice(1)}`} active={category === c} onPress={() => setCategory(c)} />))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <FilterChip label="Tous muscles" active={muscle === 'all'} onPress={() => setMuscle('all')} />
        {MUSCLE_FILTERS.map((m) => (<FilterChip key={m} label={MUSCLE_LABEL[m]} active={muscle === m} onPress={() => setMuscle(m)} />))}
      </View>

      <Text variant="caption" color="textSubtle">
        {all.length} résultat{all.length > 1 ? 's' : ''}{all.length > LIMIT ? ` · affine pour voir au-delà des ${LIMIT} premiers` : ''}
      </Text>

      {results.length === 0 ? (
        <Card><Text variant="body" color="textMuted">Aucun exercice ne correspond. Essaie un autre filtre ou un autre terme.</Text></Card>
      ) : (
        <Card>
          {results.map((e, i) => (
            <Pressable key={e.id} onPress={() => router.push({ pathname: '/sport/exercise/[id]', params: { id: e.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <View style={{ width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{MUSCLE_ICON[e.primary]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: '600' }}>{e.name}</Text>
                  <Text variant="caption" color="textSubtle" style={{ marginTop: 2 }}>{MUSCLE_LABEL[e.primary]} · {e.equipment}</Text>
                </View>
                <Text variant="body" color="textSubtle">›</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
