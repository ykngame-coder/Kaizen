import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, EmptyState, Icon, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { ProgramFocus, SportLevel, UserProgram } from '@supotsu/core';
import { useAddUserProgram, useUpdateUserProgram, useUserPrograms } from '@/lib/data/queries';

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

/**
 * Create or edit a program's metadata; sessions get assigned to weeks/days on
 * the next screen, which stays the only place the schedule is edited. Shrinking
 * `weeks` therefore leaves slots beyond the new count in place rather than
 * deleting them — they reappear if the program is lengthened again.
 */
export function ProgramBuilderScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const programId = typeof params.id === 'string' && params.id ? params.id : undefined;
  const { data: programs = [], isLoading } = useUserPrograms();
  const existing = programId ? programs.find((p) => p.id === programId) : undefined;

  // Le formulaire ne se monte qu'une fois le programme connu : ses champs
  // s'initialisent au premier rendu, donc le monter sur une requête encore
  // vide le laisserait vierge définitivement.
  if (programId && isLoading) {
    return (
      <Screen>
        <Text variant="body" color="textMuted">Chargement…</Text>
      </Screen>
    );
  }

  if (programId && !existing) {
    return (
      <Screen>
        <EmptyState
          icon={<Icon name="calendarClock" size={44} />}
          title="Programme introuvable"
          message="Ce programme n'existe plus."
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return <ProgramForm key={programId ?? 'new'} existing={existing} programCount={programs.length} />;
}

function ProgramForm({ existing, programCount }: { existing?: UserProgram; programCount: number }): React.JSX.Element {
  const router = useRouter();
  const addProgram = useAddUserProgram();
  const updateProgram = useUpdateUserProgram();
  const programId = existing?.id;
  const isEdit = !!programId;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [focus, setFocus] = useState<ProgramFocus>(existing?.focus ?? 'general');
  const [level, setLevel] = useState<SportLevel>(existing?.level ?? 'beginner');
  const [weeksText, setWeeksText] = useState(existing ? String(existing.weeks) : '8');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [visibility, setVisibility] = useState<'private' | 'public'>(
    existing?.visibility === 'public' ? 'public' : 'private',
  );
  const [error, setError] = useState<string | null>(null);

  // Le quota ne borne que la création.
  const atQuota = !isEdit && programCount >= PROGRAMS_QUOTA;
  const saving = addProgram.isPending || updateProgram.isPending;

  const submit = async (): Promise<void> => {
    setError(null);
    const weeks = Math.floor(Number(weeksText));
    if (!title.trim() || !Number.isFinite(weeks) || weeks < 1 || weeks > 26) {
      setError('Donne un titre et une durée entre 1 et 26 semaines.');
      return;
    }
    const input = {
      title: title.trim(),
      focus,
      level,
      weeks,
      description: description.trim() || undefined,
      visibility,
    };
    try {
      if (programId) {
        await updateProgram.mutateAsync({ programId, input });
        router.back();
        return;
      }
      const program = await addProgram.mutateAsync(input);
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
      <Text variant="title">{isEdit ? 'Modifier le programme' : 'Nouveau programme'}</Text>
      {isEdit ? null : (
        <Text variant="caption" color="textSubtle">
          {programCount}/{PROGRAMS_QUOTA} programmes
        </Text>
      )}

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
          label={saving ? '…' : isEdit ? 'Enregistrer' : 'Créer et planifier les séances'}
          onPress={submit}
          disabled={saving}
        />
      </View>
    </Screen>
  );
}
