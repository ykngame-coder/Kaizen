import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
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
  Toggle,
  useTheme,
} from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { useAuth } from '@/features/auth/AuthProvider';
import { HealthKitCard } from '@/features/connectors/DevicesScreen';
import { useAddHabit } from '@/lib/data/queries';
import { usePreferences } from '@/lib/preferences';
import { useOnboarding } from './OnboardingProvider';
import { onboardingSchema, STEP_FIELDS, type OnboardingForm } from './onboardingSchema';

/** Primary-goal archetypes — mirrors GoalsSection's tiles. Picking one prefills
 * the objective type/title below (still editable) and feeds preferences.primaryGoal. */
const ARCHETYPES = [
  { key: 'fat_loss', emoji: '🔥', name: 'Perte de gras', goalType: 'body_composition', goalTitle: 'Perte de gras / recomposition' },
  { key: 'muscle', emoji: '💪', name: 'Muscle', goalType: 'strength', goalTitle: 'Gagner en force / masse musculaire' },
  { key: 'hyrox', emoji: '🏃', name: 'Hyrox', goalType: 'performance', goalTitle: 'Préparer un Hyrox' },
  { key: 'marathon', emoji: '🏅', name: 'Marathon', goalType: 'endurance', goalTitle: 'Préparer un marathon' },
  { key: 'sleep', emoji: '😴', name: 'Sommeil', goalType: 'health', goalTitle: 'Améliorer mon sommeil' },
  { key: 'stress', emoji: '🧘', name: 'Stress', goalType: 'health', goalTitle: 'Réduire mon stress' },
] as const;
/** Archetypes for which a target weight makes sense — the created goal becomes body_composition when one is given. */
const WEIGHT_ARCHETYPES = new Set(['fat_loss', 'muscle']);

const UNIT_OPTIONS = [
  { value: 'metric', label: 'Métrique (kg, km)' },
  { value: 'imperial', label: 'Impérial (lb, mi)' },
] as const;
const TIME_FORMAT_OPTIONS = [
  { value: '24h', label: '24 h' },
  { value: '12h', label: '12 h' },
] as const;
const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Automatique (téléphone)' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'de', label: 'Deutsch' },
] as const;

/** Mirrors AddHabitScreen's presets/pillars/cadence (French, hardcoded — onboarding isn't i18n'd yet, unlike the rest of the app). */
const HABIT_PRESETS = [
  { emoji: '💧', name: "Boire de l'eau", pillar: 'nutrition', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '🚶', name: 'Marche quotidienne', pillar: 'performance', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '😴', name: 'Se coucher tôt', pillar: 'sleep', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '🧘', name: 'Étirements', pillar: 'recovery', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '📖', name: 'Lecture', pillar: 'habits', cadence: 'daily', targetPerPeriod: 1 },
  { emoji: '💊', name: 'Médicament', pillar: 'habits', cadence: 'daily', targetPerPeriod: 2 },
  { emoji: '🏋️', name: 'Séance de sport', pillar: 'performance', cadence: 'weekly', targetPerPeriod: 3 },
] as const;

const HABIT_PILLARS = [
  { value: 'habits', label: 'Habitude' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'recovery', label: 'Récup' },
  { value: 'sleep', label: 'Sommeil' },
  { value: 'performance', label: 'Sport' },
] as const;

const HABIT_CADENCE = [
  { value: 'daily', label: 'Quotidienne' },
  { value: 'weekly', label: 'Hebdo' },
] as const;

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
  'Ta disponibilité',
  'Tes habitudes',
  'Réglages',
  'Tes appareils',
  'Première analyse',
];

/** 8-step onboarding stepper backed by a single react-hook-form (P17.2). */
export function OnboardingFlow(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const { complete } = useOnboarding();
  const { colors } = useTheme();
  const { preferences, setPreference } = usePreferences();
  const addHabit = useAddHabit();
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastStep = STEP_TITLES.length - 1;

  const { control, trigger, getValues, setValue, formState } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      level: 'beginner',
      sex: 'unspecified',
      heightCm: undefined,
      weightKg: undefined,
      sports: [],
      primaryGoal: 'fat_loss',
      goalType: 'body_composition',
      goalTitle: '',
      goalTargetValue: undefined,
      weeklyAvailability: undefined,
      equipment: [],
      habits: [],
    },
  });
  const { fields: habitFields, append: appendHabit, remove: removeHabit } = useFieldArray({ control, name: 'habits' });
  const primaryGoal = useWatch({ control, name: 'primaryGoal' });

  const selectArchetype = (a: (typeof ARCHETYPES)[number]): void => {
    setValue('primaryGoal', a.key);
    setValue('goalType', a.goalType);
    setValue('goalTitle', a.goalTitle);
  };

  const next = async (): Promise<void> => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(s + 1, lastStep));
  };
  const back = (): void => setStep((s) => Math.max(s - 1, 0));

  const finish = async (): Promise<void> => {
    setSubmitError(null);
    const v = getValues();
    // A target weight on a weight-relevant archetype makes this a tracked
    // body-composition goal (weight-trend projection on Objectifs &
    // Habitudes) rather than a plain titled goal.
    const isBodyGoal = WEIGHT_ARCHETYPES.has(v.primaryGoal) && v.goalTargetValue !== undefined;
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
          type: isBodyGoal ? 'body_composition' : v.goalType,
          title: v.goalTitle,
          priority: 'primary',
          targetValue: isBodyGoal ? v.goalTargetValue : undefined,
          targetUnit: isBodyGoal ? 'kg' : undefined,
          currentValue: isBodyGoal ? v.weightKg : undefined,
        },
      });
      setPreference('primaryGoal', v.primaryGoal);
      for (const h of v.habits) {
        if (!h.name.trim()) continue;
        await addHabit.mutateAsync(h);
      }
      // Routing reacts to onboarding status → app tabs.
    } catch (err) {
      // Supabase's PostgrestError isn't an Error instance — fall back to its
      // .message (still more useful than the generic string) when present.
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
            ? err.message
            : 'Enregistrement impossible';
      setSubmitError(message);
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
            Quelques questions pour que Kaizen Supotsu comprenne ton point de départ et personnalise ton
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
          <View style={{ gap: spacing[2] }}>
            <Text variant="label" color="textMuted">OBJECTIF PRINCIPAL</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
              {ARCHETYPES.map((a) => {
                const active = primaryGoal === a.key;
                return (
                  <Pressable key={a.key} onPress={() => selectArchetype(a)} style={{ width: '47%' }}>
                    {active ? (
                      <Gradient style={{ borderRadius: radii.lg, padding: 1.5 }}>
                        <View style={{ backgroundColor: colors.surface, borderRadius: radii.lg - 1.5, padding: spacing[4], minHeight: 92 }}>
                          <Text style={{ fontSize: 22 }}>{a.emoji}</Text>
                          <Text variant="body" style={{ fontWeight: '700', marginTop: spacing[2] }}>{a.name}</Text>
                        </View>
                      </Gradient>
                    ) : (
                      <View style={{ borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing[4], minHeight: 92 }}>
                        <Text style={{ fontSize: 22 }}>{a.emoji}</Text>
                        <Text variant="body" style={{ fontWeight: '700', marginTop: spacing[2] }}>{a.name}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

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
          {WEIGHT_ARCHETYPES.has(primaryGoal) ? (
            <Controller
              control={control}
              name="goalTargetValue"
              render={({ field }) => (
                <Input
                  label="Poids cible (kg, optionnel)"
                  keyboardType="numeric"
                  value={field.value ? String(field.value) : ''}
                  onChangeText={field.onChange}
                />
              )}
            />
          ) : null}
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
        <View style={{ gap: spacing[4] }}>
          <Text variant="body" color="textMuted">
            Choisis les habitudes que tu veux suivre — rien n'est obligatoire, tu pourras en ajouter ou
            en retirer plus tard depuis Objectifs & Habitudes.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {HABIT_PRESETS.map((p) => {
              const idx = habitFields.findIndex((f) => f.name === p.name);
              const active = idx !== -1;
              return (
                <Pressable
                  key={p.name}
                  onPress={() =>
                    active
                      ? removeHabit(idx)
                      : appendHabit({ name: p.name, pillar: p.pillar, cadence: p.cadence, targetPerPeriod: p.targetPerPeriod })
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[3],
                    borderRadius: radii.full,
                    backgroundColor: active ? colors.primary : colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{p.emoji}</Text>
                  <Text variant="caption" style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {habitFields.length > 0 && (
            <View style={{ gap: spacing[3] }}>
              {habitFields.map((field, index) => (
                <Card key={field.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] }}>
                    <View style={{ flex: 1 }}>
                      <Controller
                        control={control}
                        name={`habits.${index}.name`}
                        render={({ field: f }) => <Input label="Nom" value={f.value} onChangeText={f.onChange} />}
                      />
                    </View>
                    <Pressable onPress={() => removeHabit(index)} hitSlop={8} style={{ padding: spacing[2] }}>
                      <Text variant="heading" style={{ color: colors.error }}>×</Text>
                    </Pressable>
                  </View>

                  <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
                    <Text variant="label" color="textMuted">PILIER</Text>
                    <Controller
                      control={control}
                      name={`habits.${index}.pillar`}
                      render={({ field: f }) => <SegmentedControl options={HABIT_PILLARS} value={f.value} onChange={f.onChange} />}
                    />
                  </View>

                  <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
                    <Text variant="label" color="textMuted">FRÉQUENCE</Text>
                    <Controller
                      control={control}
                      name={`habits.${index}.cadence`}
                      render={({ field: f }) => <SegmentedControl options={HABIT_CADENCE} value={f.value} onChange={f.onChange} />}
                    />
                  </View>

                  <Controller
                    control={control}
                    name={`habits.${index}.targetPerPeriod`}
                    render={({ field: f }) => (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[3] }}>
                        <Text variant="label" color="textMuted">CIBLE</Text>
                        <Pressable
                          onPress={() => f.onChange(Math.max(1, f.value - 1))}
                          style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text variant="body" style={{ fontWeight: '700' }}>−</Text>
                        </Pressable>
                        <Text variant="subtitle" style={{ minWidth: 24, textAlign: 'center' }}>{f.value}</Text>
                        <Pressable
                          onPress={() => f.onChange(Math.min(50, f.value + 1))}
                          style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text variant="body" style={{ fontWeight: '700' }}>+</Text>
                        </Pressable>
                        <Text variant="caption" color="textSubtle">fois</Text>
                      </View>
                    )}
                  />
                </Card>
              ))}
            </View>
          )}

          <Button
            label="+ Habitude personnalisée"
            variant="secondary"
            onPress={() => appendHabit({ name: '', pillar: 'habits', cadence: 'daily', targetPerPeriod: 1 })}
          />
        </View>
      ) : null}

      {step === 5 ? (
        <View style={{ gap: spacing[4] }}>
          <View style={{ gap: spacing[2] }}>
            <Text variant="label" color="textMuted">UNITÉS</Text>
            <SegmentedControl options={UNIT_OPTIONS} value={preferences.units} onChange={(v) => setPreference('units', v)} />
          </View>
          <View style={{ gap: spacing[2] }}>
            <Text variant="label" color="textMuted">FORMAT HORAIRE</Text>
            <SegmentedControl options={TIME_FORMAT_OPTIONS} value={preferences.timeFormat} onChange={(v) => setPreference('timeFormat', v)} />
          </View>
          <View style={{ gap: spacing[2] }}>
            <Text variant="label" color="textMuted">LANGUE</Text>
            <SegmentedControl vertical options={LANGUAGE_OPTIONS} value={preferences.language} onChange={(v) => setPreference('language', v)} />
          </View>
          <Input
            label="Objectif de pas quotidien"
            keyboardType="numeric"
            value={String(preferences.dailyStepsGoal)}
            onChangeText={(text) => {
              const n = Number(text);
              if (Number.isFinite(n)) setPreference('dailyStepsGoal', n);
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="body">Bilan du jour</Text>
            <Toggle value={preferences.dailyBriefing} onValueChange={(v) => setPreference('dailyBriefing', v)} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="body">Rappels (habitudes, check-in)</Text>
            <Toggle value={preferences.reminders} onValueChange={(v) => setPreference('reminders', v)} />
          </View>
        </View>
      ) : null}

      {step === 6 ? (
        <View style={{ gap: spacing[2] }}>
          <Card>
            <Text variant="body" color="textMuted">
              Connecte tes appareils pour enrichir automatiquement tes données — tu peux passer pour
              l'instant.
            </Text>
          </Card>
          <HealthKitCard />
          <Text variant="caption" color="textSubtle">
            D'autres connexions (Garmin, Strava, balances connectées) sont disponibles depuis Profil ›
            Appareils.
          </Text>
        </View>
      ) : null}

      {step === 7 ? (
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
  const archetypeLabel = ARCHETYPES.find((a) => a.key === v.primaryGoal)?.name ?? v.primaryGoal;
  return (
    <Card>
      <Text variant="heading">Ton profil Kaizen</Text>
      <Text variant="body" color="textMuted">
        Niveau : {levelLabel}
      </Text>
      <Text variant="body" color="textMuted">
        Objectif principal : {archetypeLabel}
      </Text>
      <Text variant="body" color="textMuted">
        Objectif : {goalLabel} — {v.goalTitle}{v.goalTargetValue ? ` (${v.goalTargetValue} kg)` : ''}
      </Text>
      <Text variant="body" color="textMuted">
        Séances / semaine : {v.weeklyAvailability ?? '—'}
      </Text>
      <Text variant="body" color="textMuted">
        Habitudes : {v.habits.filter((h) => h.name.trim()).length} sélectionnée(s)
      </Text>
    </Card>
  );
}
