import React, { useState } from 'react';
import { View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Card,
  ChipMultiSelect,
  Gradient,
  Input,
  KPICard,
  Screen,
  SegmentedControl,
  Text,
  useTheme,
} from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOnboarding } from './OnboardingProvider';
import { onboardingSchema, STEP_FIELDS, type OnboardingForm } from './onboardingSchema';

const LEVELS = [
  { value: 'beginner', label: 'Débutant' },
  { value: 'intermediate', label: 'Intermédiaire' },
  { value: 'confirmed', label: 'Confirmé' },
  { value: 'advanced', label: 'Avancé' },
] as const;

const SEXES = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
  { value: 'unspecified', label: 'Non précisé' },
] as const;

const SPORTS = [
  { value: 'running', label: 'Course' },
  { value: 'strength', label: 'Musculation' },
  { value: 'cycling', label: 'Vélo' },
  { value: 'hyrox', label: 'Hyrox' },
  { value: 'swimming', label: 'Natation' },
  { value: 'mobility', label: 'Mobilité' },
];

const GOALS = [
  { value: 'body_composition', label: 'Perdre du poids / recomposition' },
  { value: 'strength', label: 'Gagner en force' },
  { value: 'endurance', label: 'Améliorer mon endurance' },
  { value: 'performance', label: 'Préparer une compétition' },
  { value: 'health', label: 'Améliorer ma santé' },
  { value: 'habit', label: 'Créer des habitudes' },
] as const;

const AVAILABILITY = [
  { value: '2', label: '1-2 / sem' },
  { value: '4', label: '3-4 / sem' },
  { value: '5', label: '5+ / sem' },
];

const EQUIPMENT = [
  { value: 'none', label: 'Aucun' },
  { value: 'dumbbells', label: 'Haltères' },
  { value: 'gym', label: 'Salle' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'bike', label: 'Vélo' },
];

const STEP_TITLES = [
  'Bienvenue',
  'Ton profil sportif',
  'Ton objectif',
  'Tes habitudes',
  'Tes appareils',
  'Première analyse',
];

/** 6-step onboarding stepper backed by a single react-hook-form (P17.2). */
export function OnboardingFlow(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const { complete } = useOnboarding();
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastStep = STEP_TITLES.length - 1;

  const { control, trigger, getValues, formState } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      level: 'beginner',
      sex: 'unspecified',
      heightCm: undefined,
      weightKg: undefined,
      sports: [],
      goalType: 'health',
      goalTitle: '',
      weeklyAvailability: undefined,
      equipment: [],
    },
  });

  const next = async (): Promise<void> => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(s + 1, lastStep));
  };
  const back = (): void => setStep((s) => Math.max(s - 1, 0));

  const finish = async (): Promise<void> => {
    setSubmitError(null);
    const v = getValues();
    try {
      await complete({
        profile: {
          sex: v.sex,
          heightCm: v.heightCm,
          weightKg: v.weightKg,
          level: v.level,
          sports: v.sports,
          weeklyAvailability: v.weeklyAvailability,
          equipment: v.equipment,
        },
        goal: {
          type: v.goalType,
          title: v.goalTitle,
          priority: 'primary',
        },
      });
      // Routing reacts to onboarding status → app tabs.
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Enregistrement impossible');
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: spacing[2], marginTop: spacing[6] }}>
        <Text variant="label" color="textMuted">
          ÉTAPE {step + 1} / {lastStep + 1}
        </Text>
        <View
          style={{
            height: 6,
            borderRadius: radii.full,
            backgroundColor: colors.surfaceElevated,
            overflow: 'hidden',
          }}
        >
          <Gradient
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: `${((step + 1) / (lastStep + 1)) * 100}%`, height: '100%' }}
          />
        </View>
        <Text variant="title">{STEP_TITLES[step]}</Text>
      </View>

      {step === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">
            Quelques questions pour que Supotsu comprenne ton point de départ et personnalise ton
            accompagnement. Tu pourras tout modifier plus tard.
          </Text>
        </Card>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: spacing[4] }}>
          <Controller
            control={control}
            name="level"
            render={({ field }) => (
              <View style={{ gap: spacing[2] }}>
                <Text variant="label" color="textMuted">
                  NIVEAU
                </Text>
                <SegmentedControl options={LEVELS} value={field.value} onChange={field.onChange} />
              </View>
            )}
          />
          <Controller
            control={control}
            name="sex"
            render={({ field }) => (
              <View style={{ gap: spacing[2] }}>
                <Text variant="label" color="textMuted">
                  SEXE
                </Text>
                <SegmentedControl options={SEXES} value={field.value} onChange={field.onChange} />
              </View>
            )}
          />
          <View style={{ flexDirection: 'row', gap: spacing[4] }}>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="heightCm"
                render={({ field, fieldState }) => (
                  <Input
                    label="Taille (cm)"
                    keyboardType="numeric"
                    value={field.value ? String(field.value) : ''}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="weightKg"
                render={({ field, fieldState }) => (
                  <Input
                    label="Poids (kg)"
                    keyboardType="numeric"
                    value={field.value ? String(field.value) : ''}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </View>
          </View>
          <Controller
            control={control}
            name="sports"
            render={({ field }) => (
              <View style={{ gap: spacing[2] }}>
                <Text variant="label" color="textMuted">
                  SPORTS PRATIQUÉS
                </Text>
                <ChipMultiSelect options={SPORTS} values={field.value} onChange={field.onChange} />
              </View>
            )}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: spacing[4] }}>
          <Controller
            control={control}
            name="goalType"
            render={({ field }) => (
              <SegmentedControl
                options={GOALS}
                value={field.value}
                onChange={field.onChange}
                vertical
              />
            )}
          />
          <Controller
            control={control}
            name="goalTitle"
            render={({ field, fieldState }) => (
              <Input
                label="Décris ton objectif"
                placeholder="Ex : courir 10 km sans m'arrêter"
                value={field.value}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: spacing[4] }}>
          <Controller
            control={control}
            name="weeklyAvailability"
            render={({ field }) => (
              <View style={{ gap: spacing[2] }}>
                <Text variant="label" color="textMuted">
                  SÉANCES DISPONIBLES
                </Text>
                <SegmentedControl
                  options={AVAILABILITY}
                  value={field.value ? String(field.value) : undefined}
                  onChange={(v) => field.onChange(Number(v))}
                />
              </View>
            )}
          />
          <Controller
            control={control}
            name="equipment"
            render={({ field }) => (
              <View style={{ gap: spacing[2] }}>
                <Text variant="label" color="textMuted">
                  MATÉRIEL DISPONIBLE
                </Text>
                <ChipMultiSelect
                  options={EQUIPMENT}
                  values={field.value}
                  onChange={field.onChange}
                />
              </View>
            )}
          />
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: spacing[2] }}>
          <Card>
            <Text variant="body" color="textMuted">
              Connecte tes appareils pour enrichir automatiquement tes données. Disponible à l'Étape
              5 — tu peux passer pour l'instant.
            </Text>
          </Card>
          <Button label="Apple Health" variant="secondary" fullWidth disabled />
          <Button label="Garmin Connect" variant="secondary" fullWidth disabled />
          <Button label="Strava" variant="secondary" fullWidth disabled />
        </View>
      ) : null}

      {step === 5 ? (
        <View style={{ gap: spacing[4] }}>
          <OnboardingSummary getValues={getValues} />
          <KPICard
            label="Score Kaizen initial"
            value="—"
            unit="/100"
            caption="Se calibre avec tes premières séances et données."
          />
          {submitError ? <Badge label={submitError} tone="error" /> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] }}>
        {step > 0 ? <Button label="Précédent" variant="secondary" onPress={back} /> : null}
        <View style={{ flex: 1 }} />
        {step < lastStep ? (
          <Button label="Suivant" onPress={next} />
        ) : (
          <Button
            label={formState.isSubmitting ? '…' : 'Terminer'}
            onPress={finish}
            disabled={formState.isSubmitting}
          />
        )}
      </View>

      <View style={{ marginTop: spacing[2], alignItems: 'flex-start' }}>
        <Button label="Se déconnecter" variant="secondary" onPress={signOut} />
      </View>
      <Text variant="caption" color="textSubtle">
        Connecté en tant que {user?.email}
      </Text>
    </Screen>
  );
}

function OnboardingSummary({ getValues }: { getValues: () => OnboardingForm }): React.JSX.Element {
  const v = getValues();
  const levelLabel = LEVELS.find((l) => l.value === v.level)?.label ?? v.level;
  const goalLabel = GOALS.find((g) => g.value === v.goalType)?.label ?? v.goalType;
  return (
    <Card>
      <Text variant="heading">Ton profil Kaizen</Text>
      <Text variant="body" color="textMuted">
        Niveau : {levelLabel}
      </Text>
      <Text variant="body" color="textMuted">
        Objectif : {goalLabel}
      </Text>
      <Text variant="body" color="textMuted">
        Séances / semaine : {v.weeklyAvailability ?? '—'}
      </Text>
    </Card>
  );
}
