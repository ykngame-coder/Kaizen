import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Badge, type BadgeTone, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { parseWorkoutText, resolveExerciseByName, type ParsedExercise } from '@supotsu/connectors';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { ocrAvailable, ocrImageToText, pickScreenshot } from '@/features/connectors/ocrClient';
import { useAddCircuitWorkout, useAddWorkout, useCustomExercises } from '@/lib/data/queries';

const CONFIDENCE_TONE: Record<ParsedExercise['confidence'], BadgeTone> = {
  high: 'success',
  medium: 'warning',
  to_confirm: 'error',
};

interface SetDraft {
  reps: string;
  weight: string;
}

interface ExerciseDraft {
  rawName: string;
  confidence: ParsedExercise['confidence'];
  sets: SetDraft[];
  exerciseId?: string;
  matchName?: string;
  pickerOpen: boolean;
  pickerQuery: string;
  supersetGroup?: number;
}

function toSetDraft(sets: ParsedExercise['sets']): SetDraft[] {
  if (sets.length === 0) return [{ reps: '', weight: '' }];
  return sets.map((s) => ({ reps: s.reps != null ? String(s.reps) : '', weight: s.weightKg != null ? String(s.weightKg) : '' }));
}

function toDraft(ex: ParsedExercise): ExerciseDraft {
  const match = resolveExerciseByName(ex.rawName);
  return {
    rawName: ex.rawName,
    confidence: ex.confidence,
    sets: toSetDraft(ex.sets),
    exerciseId: match.exerciseId,
    matchName: match.matchName,
    pickerOpen: false,
    pickerQuery: '',
    supersetGroup: ex.supersetGroup,
  };
}

/** Extract a human-readable message from anything a failed pick/OCR call can throw. */
function errorMessage(e: unknown, t: TFunction): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return t('sport.ocrImport.errorFallback');
}

/**
 * Import une séance à partir d'une capture d'écran : OCR 100% sur l'appareil
 * (ML Kit, rien n'est envoyé nulle part) → parseur pur → rattachement au
 * catalogue → cet écran de revue éditable. Rien n'est enregistré tant que
 * l'utilisateur n'a pas vu et pu corriger chaque ligne lue (aucune boîte noire).
 */
export function OcrImportScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const addWorkout = useAddWorkout();
  const addCircuitWorkout = useAddCircuitWorkout();
  const { data: customExercises = [] } = useCustomExercises();

  const CONFIDENCE_LABEL: Record<ParsedExercise['confidence'], string> = {
    high: t('sport.ocrImport.confidence.high'),
    medium: t('sport.ocrImport.confidence.medium'),
    to_confirm: t('sport.ocrImport.confidence.toConfirm'),
  };

  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<ExerciseDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pickerCatalog = useMemo(() => {
    const list = [
      ...customExercises.map((e) => ({ id: e.id, name: e.name })),
      ...EXERCISE_LIBRARY.map((e) => ({ id: e.id, name: e.name })),
      ...EXERCISES.map((e) => ({ id: e.id, name: e.name })),
    ];
    const seen = new Set<string>();
    return list.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  }, [customExercises]);

  const pickAndScan = async (): Promise<void> => {
    setError(null);
    try {
      const uri = await pickScreenshot();
      if (!uri) return;
      setBusy(true);
      const text = await ocrImageToText(uri);
      const parsed = parseWorkoutText(text);
      if (parsed.exercises.length === 0) {
        setError(t('sport.ocrImport.capture.noTextFound'));
        return;
      }
      setName(parsed.name ?? '');
      setDrafts(parsed.exercises.map(toDraft));
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = (index: number, patch: Partial<ExerciseDraft>): void => {
    setDrafts((prev) => (prev ? prev.map((d, i) => (i === index ? { ...d, ...patch } : d)) : prev));
  };
  const updateSet = (exIndex: number, setIndex: number, patch: Partial<SetDraft>): void => {
    setDrafts((prev) =>
      prev
        ? prev.map((d, i) => (i === exIndex ? { ...d, sets: d.sets.map((s, si) => (si === setIndex ? { ...s, ...patch } : s)) } : d))
        : prev,
    );
  };
  const addSet = (exIndex: number): void => {
    setDrafts((prev) => (prev ? prev.map((d, i) => (i === exIndex ? { ...d, sets: [...d.sets, { reps: '', weight: '' }] } : d)) : prev));
  };
  const removeSet = (exIndex: number, setIndex: number): void => {
    setDrafts((prev) =>
      prev ? prev.map((d, i) => (i === exIndex ? { ...d, sets: d.sets.filter((_, si) => si !== setIndex) } : d)) : prev,
    );
  };
  const removeExercise = (index: number): void => {
    setDrafts((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };
  const pickMatch = (exIndex: number, id: string, matchName: string): void => {
    updateDraft(exIndex, { exerciseId: id, matchName, pickerOpen: false, pickerQuery: '' });
  };

  const submit = async (): Promise<void> => {
    setSaveError(null);
    if (!drafts || drafts.length === 0) {
      setSaveError(t('sport.ocrImport.errors.noExercises'));
      return;
    }
    if (drafts.some((d) => !d.exerciseId)) {
      setSaveError(t('sport.ocrImport.errors.unmatchedExercises'));
      return;
    }
    let order = 0;
    const sets = drafts.flatMap((d) =>
      d.sets
        .filter((s) => s.reps.trim() || s.weight.trim())
        .map((s) => ({
          exerciseId: d.exerciseId!,
          order: order++,
          reps: s.reps.trim() ? Number(s.reps) : undefined,
          weightKg: s.weight.trim() ? Number(s.weight) : undefined,
          supersetGroup: d.supersetGroup,
        })),
    );
    if (sets.length === 0) {
      setSaveError(t('sport.ocrImport.errors.noSets'));
      return;
    }
    const sessionName = name.trim() || t('sport.ocrImport.defaultSessionName');
    try {
      if (drafts.some((d) => d.supersetGroup != null)) {
        await addCircuitWorkout.mutateAsync({ name: sessionName, blocks: [{ format: 'strength', sets }] });
      } else {
        await addWorkout.mutateAsync({ name: sessionName, sets });
      }
      router.back();
    } catch {
      setSaveError(t('sport.ocrImport.errors.saveFailed'));
    }
  };

  if (!ocrAvailable()) {
    return (
      <Screen>
        <Text variant="title">{t('sport.ocrImport.title')}</Text>
        <Card>
          <Text variant="body" color="textMuted">
            {t('sport.ocrImport.unavailable')}
          </Text>
        </Card>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('sport.ocrImport.title')}</Text>
      <Text variant="caption" color="textMuted">
        {t('sport.ocrImport.subtitle')}
      </Text>

      {!drafts ? (
        <Card>
          <Text variant="heading">{t('sport.ocrImport.capture.heading')}</Text>
          <Text variant="body" color="textMuted">
            {t('sport.ocrImport.capture.hint')}
          </Text>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
            <Button label={busy ? t('sport.ocrImport.capture.buttonBusy') : t('sport.ocrImport.capture.button')} onPress={pickAndScan} disabled={busy} />
          </View>
          {error ? (
            <Text variant="caption" style={{ color: colors.error, marginTop: spacing[2] }}>
              {error}
            </Text>
          ) : null}
        </Card>
      ) : (
        <>
          <Input label={t('sport.ocrImport.nameLabel')} placeholder={t('sport.ocrImport.namePlaceholder')} value={name} onChangeText={setName} />

          <View style={{ gap: spacing[3] }}>
            {drafts.map((d, exIndex) => {
              const filtered = d.pickerQuery.trim()
                ? pickerCatalog.filter((e) => e.name.toLowerCase().includes(d.pickerQuery.trim().toLowerCase())).slice(0, 30)
                : [];
              return (
                <Card key={exIndex} elevated>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, gap: spacing[1] }}>
                      <Input value={d.rawName} onChangeText={(v) => updateDraft(exIndex, { rawName: v })} />
                      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                        <Badge label={CONFIDENCE_LABEL[d.confidence]} tone={CONFIDENCE_TONE[d.confidence]} />
                        {d.supersetGroup != null ? <Badge label={t('sport.ocrImport.superset.badge')} tone="info" /> : null}
                      </View>
                    </View>
                    <Pressable onPress={() => removeExercise(exIndex)} hitSlop={8} style={{ marginLeft: spacing[2] }}>
                      <Text variant="heading" style={{ color: colors.error }}>×</Text>
                    </Pressable>
                  </View>

                  <View style={{ marginTop: spacing[2] }}>
                    <Pressable onPress={() => updateDraft(exIndex, { pickerOpen: !d.pickerOpen })}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: spacing[3],
                          borderRadius: radii.md,
                          borderWidth: 1,
                          borderColor: d.exerciseId ? colors.border : colors.error,
                          backgroundColor: colors.surfaceElevated,
                        }}
                      >
                        <Text variant="body" color={d.exerciseId ? 'text' : undefined} style={!d.exerciseId ? { color: colors.error } : undefined}>
                          {d.matchName ?? t('sport.ocrImport.picker.placeholder')}
                        </Text>
                        <Text variant="body" color="textMuted">{d.pickerOpen ? '▴' : '▾'}</Text>
                      </View>
                    </Pressable>
                    {d.pickerOpen ? (
                      <View style={{ marginTop: spacing[2], gap: spacing[2] }}>
                        <Input
                          placeholder={t('sport.ocrImport.picker.search')}
                          value={d.pickerQuery}
                          onChangeText={(v) => updateDraft(exIndex, { pickerQuery: v })}
                          autoFocus
                        />
                        {filtered.map((e) => (
                          <Pressable key={e.id} onPress={() => pickMatch(exIndex, e.id, e.name)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                            <Text variant="body">{e.name}</Text>
                          </Pressable>
                        ))}
                        {d.pickerQuery.trim() && filtered.length === 0 ? (
                          <Text variant="caption" color="textSubtle">
                            {t('sport.ocrImport.picker.noResults', { query: d.pickerQuery })}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>

                  <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
                    {d.sets.map((s, setIndex) => (
                      <View key={setIndex} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] }}>
                        <View style={{ flex: 1 }}>
                          <Input label={t('sport.ocrImport.repsLabel')} keyboardType="numeric" value={s.reps} onChangeText={(v) => updateSet(exIndex, setIndex, { reps: v })} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Input label={t('sport.ocrImport.weightLabel')} keyboardType="numeric" value={s.weight} onChangeText={(v) => updateSet(exIndex, setIndex, { weight: v })} />
                        </View>
                        {d.sets.length > 1 ? (
                          <Pressable onPress={() => removeSet(exIndex, setIndex)} hitSlop={8} style={{ paddingBottom: spacing[3] }}>
                            <Text variant="body" style={{ color: colors.error }}>×</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    <Pressable onPress={() => addSet(exIndex)}>
                      <Text variant="caption" color="primary">{t('sport.ocrImport.addSet')}</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>

          {saveError ? <Badge label={saveError} tone="error" /> : null}

          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
            <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
            <View style={{ flex: 1 }} />
            <Button label={addWorkout.isPending || addCircuitWorkout.isPending ? t('sport.ocrImport.saving') : t('sport.ocrImport.save')} onPress={submit} disabled={addWorkout.isPending || addCircuitWorkout.isPending} />
          </View>
        </>
      )}
    </Screen>
  );
}
