import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { AthleteProfileInput } from '@supotsu/shared';
import { useAthleteProfile, useSaveAthleteProfile } from '@/lib/data/queries';

type Sex = AthleteProfileInput['sex'];
type Level = AthleteProfileInput['level'];

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Femme' },
  { value: 'male', label: 'Homme' },
  { value: 'unspecified', label: 'Non précisé' },
];
const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'beginner', label: 'Débutant' },
  { value: 'intermediate', label: 'Intermédiaire' },
  { value: 'confirmed', label: 'Confirmé' },
  { value: 'advanced', label: 'Avancé' },
];

const numOrUndef = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && s.trim() !== '' ? n : undefined;
};

/** Edit the athlete profile (Master Prompt P17 profil). */
export function ProfileEditScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: profile, isLoading } = useAthleteProfile();
  const save = useSaveAthleteProfile();

  const [sex, setSex] = useState<Sex>('unspecified');
  const [level, setLevel] = useState<Level>('beginner');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [availability, setAvailability] = useState('');

  useEffect(() => {
    if (!profile) return;
    setSex(profile.sex);
    setLevel(profile.level);
    setHeight(profile.heightCm !== undefined ? String(profile.heightCm) : '');
    setWeight(profile.weightKg !== undefined ? String(profile.weightKg) : '');
    setAvailability(profile.weeklyAvailability !== undefined ? String(profile.weeklyAvailability) : '');
  }, [profile]);

  const onSave = (): void => {
    const input: AthleteProfileInput = {
      sex,
      level,
      heightCm: numOrUndef(height),
      weightKg: numOrUndef(weight),
      weeklyAvailability: numOrUndef(availability),
      sports: profile?.sports ?? [],
      equipment: profile?.equipment ?? [],
      birthDate: profile?.birthDate,
    };
    save.mutate(input, { onSuccess: () => router.back() });
  };

  return (
    <Screen scroll>
      <Text variant="title">Mon profil</Text>
      <Text variant="caption" color="textMuted">
        Ces informations affinent tes scores et recommandations.
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          Chargement…
        </Text>
      ) : (
        <Card>
          <View style={{ gap: spacing[3] }}>
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                SEXE
              </Text>
              <SegmentedControl options={SEX_OPTIONS} value={sex} onChange={setSex} />
            </View>
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                NIVEAU
              </Text>
              <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Input label="Taille (cm)" placeholder="178" value={height} onChangeText={setHeight} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Poids (kg)" placeholder="75" value={weight} onChangeText={setWeight} keyboardType="numeric" />
              </View>
            </View>
            <Input
              label="Disponibilité (séances / semaine)"
              placeholder="4"
              value={availability}
              onChangeText={setAvailability}
              keyboardType="numeric"
            />
            <View style={{ alignItems: 'flex-start' }}>
              <Button label={save.isPending ? 'Enregistrement…' : 'Enregistrer'} onPress={onSave} />
            </View>
          </View>
        </Card>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
