import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, EmptyState, Icon, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { ProgramFocus, SportLevel } from '@supotsu/core';
import { useAddUserProgram, useUserPrograms } from '@/lib/data/queries';

const FOCUS_OPTIONS: { value: ProgramFocus; label: string }[] = [
  { value: 'strength', label: 'Force' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'hyrox', label: 'Hyrox' },
  { value: 'weight_loss', label: 'Perte de poids' },
  { value: 'mobility', label: 'Mobilité' },
  { value: 'general', label: 'Général' },
];
const LEVEL_OPTIONS: { value: SportLevel; label: string }[] = [
  { value: 'beginner', label: 'Débutant' },
  { value: 'intermediate', label: 'Intermédiaire' },
  { value: 'confirmed', label: 'Confirmé' },
  { value: 'advanced', label: 'Avancé' },
];
const VISIBILITY_OPTIONS = [
  { value: 'private' as const, label: 'Privé' },
  { value: 'public' as const, label: 'Public' },
];
const PROGRAMS_QUOTA = 2;

/** Create a program's metadata; sessions get assigned to weeks/days on the next screen. */
export function ProgramBuilderScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: programs = [] } = useUserPrograms();
  const addProgram = useAddUserProgram();

  const [title, setTitle] = useState('');
  const [focus, setFocus] = useState<ProgramFocus>('general');
  const [level, setLevel] = useState<SportLevel>('beginner');
  const [weeksText, setWeeksText] = useState('8');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [error, setError] = useState<string | null>(null);

  const atQuota = programs.length >= PROGRAMS_QUOTA;

  const submit = async (): Promise<void> => {
    setError(null);
    const weeks = Math.floor(Number(weeksText));
    if (!title.trim() || !Number.isFinite(weeks) || weeks < 1 || weeks > 26) {
      setError('Donne un titre et une durée entre 1 et 26 semaines.');
      return;
    }
    try {
      const program = await addProgram.mutateAsync({
        title: title.trim(),
        focus,
        level,
        weeks,
        description: description.trim() || undefined,
        visibility,
      });
      router.replace({ pathname: '/marketplace/program/[id]', params: { id: program.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  };

  if (atQuota) {
    return (
      <Screen>
        <EmptyState
          icon={<Icon name="packageBox" size={44} />}
          title="Limite de programmes atteinte"
          message={`Tu as déjà ${PROGRAMS_QUOTA} programmes. Supprime-en un pour en créer un nouveau.`}
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">Nouveau programme</Text>
      <Text variant="caption" color="textSubtle">
        {programs.length}/{PROGRAMS_QUOTA} programmes
      </Text>

      <Input label="Titre" placeholder="Ex : Prépa Hyrox perso" value={title} onChangeText={setTitle} />
      <Input
        label="Description (optionnel)"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Input label="Nombre de semaines" keyboardType="numeric" value={weeksText} onChangeText={setWeeksText} />

      <View style={{ marginTop: spacing[2] }}>
        <Text variant="body" style={{ fontWeight: '600', marginBottom: spacing[2] }}>Focus</Text>
        <SegmentedControl options={FOCUS_OPTIONS} value={focus} onChange={setFocus} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>Niveau</Text>
        <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
        <Text variant="body" style={{ fontWeight: '600', marginTop: spacing[4], marginBottom: spacing[2] }}>Visibilité</Text>
        <SegmentedControl options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
        <Text variant="caption" color="textSubtle" style={{ marginTop: spacing[1] }}>
          {visibility === 'private' ? 'Visible seulement par toi.' : 'D’autres utilisateurs pourront le copier depuis Communauté.'}
        </Text>
      </View>

      {error ? <Badge label={error} tone="error" /> : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] }}>
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Button
          label={addProgram.isPending ? '…' : 'Créer et planifier les séances'}
          onPress={submit}
          disabled={addProgram.isPending}
        />
      </View>
    </Screen>
  );
}
