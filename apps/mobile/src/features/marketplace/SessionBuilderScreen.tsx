import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, EmptyState, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { PICKABLE_EXERCISES } from '@supotsu/shared';
import { useAddUserSession, useUserSessions } from '@/lib/data/queries';

const VISIBILITY_OPTIONS = [
  { value: 'private' as const, label: 'Privé' },
  { value: 'public' as const, label: 'Public' },
];
const SESSIONS_QUOTA = 50;

interface SetDraft {
  reps: string;
  weight: string;
}

/** Create a reusable session template (exercises without a date) — the "séance" library behind programmes. */
export function SessionBuilderScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: sessions = [] } = useUserSessions();
  const addSession = useAddUserSession();

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, SetDraft>>({});
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visibleExercises = q
    ? PICKABLE_EXERCISES.filter((ex) => ex.name.toLowerCase().includes(q) || ex.primaryMuscles.some((m) => m.toLowerCase().includes(q)))
    : PICKABLE_EXERCISES;

  const atQuota = sessions.length >= SESSIONS_QUOTA;

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { reps: '', weight: '' };
      return next;
    });
  };

  const update = (id: string, patch: Partial<SetDraft>): void => {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const ids = Object.keys(selected);
    if (!name.trim() || ids.length === 0) {
      setError('Donne un nom et sélectionne au moins un exercice.');
      return;
    }
    try {
      await addSession.mutateAsync({
        name: name.trim(),
        visibility,
        exercises: ids.map((exerciseId, index) => ({
          exerciseId,
          order: index,
          reps: selected[exerciseId].reps ? Number(selected[exerciseId].reps) : undefined,
          weightKg: selected[exerciseId].weight ? Number(selected[exerciseId].weight) : undefined,
        })),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  };

  if (atQuota) {
    return (
      <Screen>
        <EmptyState
          icon="📦"
          title="Limite de séances atteinte"
          message={`Tu as déjà ${SESSIONS_QUOTA} séances dans ta bibliothèque. Supprime-en une pour en créer une nouvelle.`}
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">Nouvelle séance</Text>
      <Text variant="caption" color="textSubtle">
        {sessions.length}/{SESSIONS_QUOTA} séances dans ta bibliothèque
      </Text>

      <Input label="Nom de la séance" placeholder="Ex : Push A" value={name} onChangeText={setName} />

      <View style={{ marginTop: spacing[2] }}>
        <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>Visibilité</Text>
        <SegmentedControl options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {visibility === 'private' ? 'Visible seulement par toi.' : 'D’autres utilisateurs pourront la copier depuis Communauté.'}
        </Text>
      </View>

      <Text variant="heading">Bibliothèque d'exercices</Text>
      <Input
        label="Rechercher un exercice"
        placeholder="Ex : développé, quads, curl…"
        value={query}
        onChangeText={setQuery}
      />
      {visibleExercises.length === 0 ? (
        <Text variant="caption" color="textSubtle">Aucun exercice ne correspond à "{query}".</Text>
      ) : null}
      <View style={{ gap: spacing[2] }}>
        {visibleExercises.map((ex) => {
          const isSelected = !!selected[ex.id];
          return (
            <Card key={ex.id} elevated={isSelected}>
              <Pressable
                onPress={() => toggle(ex.id)}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="subtitle">{ex.name}</Text>
                  <Text variant="caption" color="textMuted">
                    {ex.primaryMuscles.join(', ')}
                  </Text>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: radii.full,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                  }}
                />
              </Pressable>

              {isSelected ? (
                <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[2] }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Répétitions"
                      keyboardType="numeric"
                      value={selected[ex.id].reps}
                      onChangeText={(v) => update(ex.id, { reps: v })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Charge (kg)"
                      keyboardType="numeric"
                      value={selected[ex.id].weight}
                      onChangeText={(v) => update(ex.id, { weight: v })}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addSession.isPending ? '…' : 'Enregistrer la séance'}
          onPress={submit}
          disabled={addSession.isPending}
        />
      </View>
    </Screen>
  );
}
