import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Input, Screen, SegmentedControl, Text, useTheme } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import { habitInputSchema, type HabitInput } from '@supotsu/shared';
import { useAddHabit } from '@/lib/data/queries';
import { linkedKindFor, LINKED_LABEL } from './linkedHabits';

const PILLARS = [
  { value: 'habits', label: 'Habitude' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'recovery', label: 'Récup' },
  { value: 'sleep', label: 'Sommeil' },
  { value: 'performance', label: 'Sport' },
] as const;

const CADENCE = [
  { value: 'daily', label: 'Quotidienne' },
  { value: 'weekly', label: 'Hebdo' },
] as const;

/**
 * Ready-made habits — tapping one fills the form below instead of starting
 * from a blank name. "Boire de l'eau" / "Marche" are worded to match
 * linkedKindFor exactly, so they come with automatic tracking already on
 * (see the live hint under the name field) instead of the user having to
 * guess the right wording for that to kick in.
 */
type PillarOption = (typeof PILLARS)[number]['value'];

const PRESETS: { emoji: string; name: string; pillar: PillarOption; cadence: 'daily' | 'weekly'; targetPerPeriod: number }[] = [
  { emoji: '💧', name: "Boire de l'eau", pillar: 'nutrition', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '🚶', name: 'Marche quotidienne', pillar: 'performance', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '😴', name: 'Se coucher tôt', pillar: 'sleep', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '🧘', name: 'Étirements', pillar: 'recovery', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '📖', name: 'Lecture', pillar: 'habits', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '💊', name: 'Médicament', pillar: 'habits', cadence: 'daily', targetPerPeriod: 2 },
  { emoji: '🏋️', name: 'Séance de sport', pillar: 'performance', cadence: 'weekly', targetPerPeriod: 3 },
];

/** Create a habit (Master Prompt P12 habitudes). */
export function AddHabitScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const addHabit = useAddHabit();

  const [name, setName] = useState('');
  const [pillar, setPillar] = useState<(typeof PILLARS)[number]['value']>('habits');
  const [cadence, setCadence] = useState<(typeof CADENCE)[number]['value']>('daily');
  const [target, setTarget] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const linked = linkedKindFor(name);

  const applyPreset = (p: (typeof PRESETS)[number]): void => {
    setName(p.name);
    setPillar(p.pillar);
    setCadence(p.cadence);
    setTarget(p.targetPerPeriod);
    setError(null);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    const parsed = habitInputSchema.safeParse({ name, pillar, cadence, targetPerPeriod: target });
    if (!parsed.success) {
      setError('Donne un nom à ton habitude.');
      return;
    }
    try {
      await addHabit.mutateAsync(parsed.data as HabitInput);
      router.back();
    } catch {
      setError('Enregistrement impossible.');
    }
  };

  return (
    <Screen scroll>
      <Text variant="title">Nouvelle habitude</Text>
      <Text variant="caption" color="textMuted">
        Petite, concrète, répétable : c'est la régularité qui compte.
      </Text>

      <Card>
        <Text variant="heading">Modèles</Text>
        <Text variant="caption" color="textSubtle" style={{ marginBottom: spacing[2] }}>
          Pré-remplit le formulaire — tout reste modifiable ensuite.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {PRESETS.map((p) => {
            const active = name === p.name;
            return (
              <Pressable
                key={p.name}
                onPress={() => applyPreset(p)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: spacing[2],
                  paddingHorizontal: spacing[3],
                  borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 15 }}>{p.emoji}</Text>
                <Text variant="caption" style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Input label="Nom (ex. Boire 2L d'eau)" value={name} onChangeText={setName} />
      {linked ? (
        <Text variant="caption" color="primary">
          🔗 Suivi automatique — se validera seule à partir de {LINKED_LABEL[linked]}, pas besoin de la cocher à la main.
        </Text>
      ) : null}

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          PILIER
        </Text>
        <SegmentedControl options={PILLARS} value={pillar} onChange={setPillar} />
      </View>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" color="textMuted">
          FRÉQUENCE
        </Text>
        <SegmentedControl options={CADENCE} value={cadence} onChange={setCadence} />
      </View>

      {!linked && (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" color="textMuted">
            CIBLE {cadence === 'daily' ? 'PAR JOUR' : 'PAR SEMAINE'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <Pressable
              onPress={() => setTarget((t) => Math.max(1, t - 1))}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
            >
              <Text variant="body" style={{ fontWeight: '700' }}>−</Text>
            </Pressable>
            <Text variant="subtitle" style={{ minWidth: 28, textAlign: 'center' }}>{target}</Text>
            <Pressable
              onPress={() => setTarget((t) => Math.min(50, t + 1))}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
            >
              <Text variant="body" style={{ fontWeight: '700' }}>+</Text>
            </Pressable>
            <Text variant="caption" color="textSubtle">fois</Text>
          </View>
        </View>
      )}

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addHabit.isPending ? '…' : 'Créer'}
          onPress={submit}
          disabled={addHabit.isPending}
        />
      </View>
    </Screen>
  );
}
