import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Screen, SegmentedControl, Text } from '@supotsu/ui';
import { spacing } from '@supotsu/design-system';
import type { AthleteProfileInput } from '@supotsu/shared';
import { useAthleteProfile, useLeaderboardPrefs, useSaveAthleteProfile, useUpdateLeaderboardPrefs } from '@/lib/data/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { defaultDisplayName } from '@/features/community/leaderboardHelpers';

type Sex = AthleteProfileInput['sex'];
type Level = AthleteProfileInput['level'];

const numOrUndef = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && s.trim() !== '' ? n : undefined;
};

/** Edit the athlete profile (Master Prompt P17 profil). */
export function ProfileEditScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: profile, isLoading } = useAthleteProfile();
  const save = useSaveAthleteProfile();

  const SEX_OPTIONS: { value: Sex; label: string }[] = [
    { value: 'female', label: t('settings.profileEdit.sex.options.female') },
    { value: 'male', label: t('settings.profileEdit.sex.options.male') },
    { value: 'unspecified', label: t('settings.profileEdit.sex.options.unspecified') },
  ];
  const LEVEL_OPTIONS: { value: Level; label: string }[] = [
    { value: 'beginner', label: t('settings.profileEdit.level.options.beginner') },
    { value: 'intermediate', label: t('settings.profileEdit.level.options.intermediate') },
    { value: 'confirmed', label: t('settings.profileEdit.level.options.confirmed') },
    { value: 'advanced', label: t('settings.profileEdit.level.options.advanced') },
  ];

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

  const { user } = useAuth();
  const { data: leaderboardPrefs } = useLeaderboardPrefs();
  const updateLeaderboardPrefs = useUpdateLeaderboardPrefs();
  const [pseudo, setPseudo] = useState('');
  const [optedIn, setOptedIn] = useState(false);

  useEffect(() => {
    if (!leaderboardPrefs) return;
    setPseudo(leaderboardPrefs.displayName ?? '');
    setOptedIn(leaderboardPrefs.leaderboardOptIn);
  }, [leaderboardPrefs]);

  const onToggleOptIn = (value: 'yes' | 'no'): void => {
    const nextOptedIn = value === 'yes';
    setOptedIn(nextOptedIn);
    const nextPseudo = nextOptedIn && !pseudo.trim() && user ? defaultDisplayName(user.id) : pseudo;
    if (nextOptedIn && !pseudo.trim()) setPseudo(nextPseudo);
    updateLeaderboardPrefs.mutate({ leaderboardOptIn: nextOptedIn, displayName: nextPseudo || undefined });
  };

  const onSavePseudo = (): void => {
    updateLeaderboardPrefs.mutate({ displayName: pseudo.trim() || undefined });
  };

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
      <Text variant="title">{t('settings.profileEdit.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('settings.profileEdit.subtitle')}
      </Text>

      {isLoading ? (
        <Text variant="body" color="textMuted">
          {t('common.loading')}
        </Text>
      ) : (
        <Card>
          <View style={{ gap: spacing[3] }}>
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                {t('settings.profileEdit.sex.label')}
              </Text>
              <SegmentedControl options={SEX_OPTIONS} value={sex} onChange={setSex} />
            </View>
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                {t('settings.profileEdit.level.label')}
              </Text>
              <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Input label={t('settings.profileEdit.height.label')} placeholder="178" value={height} onChangeText={setHeight} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label={t('settings.profileEdit.weight.label')} placeholder="75" value={weight} onChangeText={setWeight} keyboardType="numeric" />
              </View>
            </View>
            <Input
              label={t('settings.profileEdit.availability.label')}
              placeholder="4"
              value={availability}
              onChangeText={setAvailability}
              keyboardType="numeric"
            />
            <Input
              label={t('settings.profileEdit.pseudo.label')}
              placeholder={t('settings.profileEdit.pseudo.placeholder')}
              value={pseudo}
              onChangeText={setPseudo}
              onBlur={onSavePseudo}
            />
            <View style={{ gap: spacing[1] }}>
              <Text variant="label" color="textMuted">
                {t('settings.profileEdit.leaderboardOptIn.label')}
              </Text>
              <SegmentedControl
                options={[
                  { value: 'no' as const, label: t('settings.profileEdit.leaderboardOptIn.no') },
                  { value: 'yes' as const, label: t('settings.profileEdit.leaderboardOptIn.yes') },
                ]}
                value={optedIn ? 'yes' : 'no'}
                onChange={onToggleOptIn}
              />
            </View>
            <View style={{ alignItems: 'flex-start' }}>
              <Button label={save.isPending ? t('settings.profileEdit.saving') : t('common.save')} onPress={onSave} />
            </View>
          </View>
        </Card>
      )}

      <View style={{ alignItems: 'flex-start' }}>
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
