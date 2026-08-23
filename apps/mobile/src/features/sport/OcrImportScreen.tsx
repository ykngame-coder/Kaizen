import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, type BadgeTone, Button, Card, Input, Screen, Text, useTheme } from '@supotsu/ui';
import { radii, spacing } from '@supotsu/design-system';
import { parseWorkoutText, resolveExerciseByName, type ParsedExercise } from '@supotsu/connectors';
import { EXERCISE_LIBRARY } from '@supotsu/shared';
import { EXERCISES } from '@/features/exercises/catalog';
import { ocrAvailable, ocrImageToText, pickScreenshot } from '@/features/connectors/ocrClient';
import { useAddWorkout, useCustomExercises } from '@/lib/data/queries';

const CONFIDENCE_TONE: Record<ParsedExercise['confidence'], BadgeTone> = {
  high: 'success',
  medium: 'warning',
  to_confirm: 'error',
};
const CONFIDENCE_LABEL: Record<ParsedExercise['confidence'], string> = {
  high: 'Lecture fiable',
  medium: 'À vérifier',
  to_confirm: 'Non reconnu',
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
  };
}

/** Extract a human-readable message from anything a failed pick/OCR call can throw. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return "Lecture de l'image impossible.";
}

/**
 * Import une séance à partir d'une capture d'écran : OCR 100% sur l'appareil
 * (ML Kit, rien n'est envoyé nulle part) → parseur pur → rattachement au
 * catalogue → cet écran de revue éditable. Rien n'est enregistré tant que
 * l'utilisateur n'a pas vu et pu corriger chaque ligne lue (aucune boîte noire).
 */
export function OcrImportScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const addWorkout = useAddWorkout();
  const { data: customExercises = [] } = useCustomExercises();

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
        setError('Aucun texte de séance reconnu dans cette image. Réessaie avec une capture plus nette.');
        return;
      }
      setName(parsed.name ?? '');
      setDrafts(parsed.exercises.map(toDraft));
    } catch (e) {
      setError(errorMessage(e));
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
      setSaveError('Aucun exercice à enregistrer.');
      return;
    }
    if (drafts.some((d) => !d.exerciseId)) {
      setSaveError('Certains exercices ne sont pas reconnus — choisis-les dans la liste avant d’enregistrer.');
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
        })),
    );
    if (sets.length === 0) {
      setSaveError('Ajoute au moins une série avant d’enregistrer.');
      return;
    }
    try {
      await addWorkout.mutateAsync({ name: name.trim() || 'Séance importée', sets });
      router.back();
    } catch {
      setSaveError('Enregistrement impossible.');
    }
  };

  if (!ocrAvailable()) {
    return (
      <Screen>
        <Text variant="title">Importer une capture</Text>
        <Card>
          <Text variant="body" color="textMuted">
            La lecture de capture d'écran fonctionne uniquement sur l'app mobile (iOS / Android) —
            elle utilise la reconnaissance de texte de l'appareil, indisponible sur le web.
          </Text>
        </Card>
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Retour" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">Importer une capture</Text>
      <Text variant="caption" color="textMuted">
        Prends ou choisis une photo de ta séance — la lecture se fait entièrement sur ton
        téléphone, rien n'est envoyé nulle part. Tu vérifies et corriges chaque ligne avant
        d'enregistrer.
      </Text>

      {!drafts ? (
        <Card>
          <Text variant="heading">Capture d'écran</Text>
          <Text variant="body" color="textMuted">
            Fonctionne mieux avec un texte net : nom des exercices + séries × répétitions (+
            poids). Ex : "Développé couché 4×8 60kg".
          </Text>
          <View style={{ alignItems: 'flex-start', marginTop: spacing[2] }}>
            <Button label={busy ? 'Lecture…' : 'Choisir une capture'} onPress={pickAndScan} disabled={busy} />
          </View>
          {error ? (
            <Text variant="caption" style={{ color: colors.error, marginTop: spacing[2] }}>
              {error}
            </Text>
          ) : null}
        </Card>
      ) : (
        <>
          <Input label="Nom de la séance" placeholder="Ex : Push A" value={name} onChangeText={setName} />

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
                      <Badge label={CONFIDENCE_LABEL[d.confidence]} tone={CONFIDENCE_TONE[d.confidence]} />
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
                          {d.matchName ?? 'Choisir un exercice du catalogue…'}
                        </Text>
                        <Text variant="body" color="textMuted">{d.pickerOpen ? '▴' : '▾'}</Text>
                      </View>
                    </Pressable>
                    {d.pickerOpen ? (
                      <View style={{ marginTop: spacing[2], gap: spacing[2] }}>
                        <Input
                          placeholder="Rechercher un exercice…"
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
                            Aucun résultat pour "{d.pickerQuery}".
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>

                  <View style={{ gap: spacing[2], marginTop: spacing[3] }}>
                    {d.sets.map((s, setIndex) => (
                      <View key={setIndex} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] }}>
                        <View style={{ flex: 1 }}>
                          <Input label="Répétitions" keyboardType="numeric" value={s.reps} onChangeText={(v) => updateSet(exIndex, setIndex, { reps: v })} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Input label="Charge (kg)" keyboardType="numeric" value={s.weight} onChangeText={(v) => updateSet(exIndex, setIndex, { weight: v })} />
                        </View>
                        {d.sets.length > 1 ? (
                          <Pressable onPress={() => removeSet(exIndex, setIndex)} hitSlop={8} style={{ paddingBottom: spacing[3] }}>
                            <Text variant="body" style={{ color: colors.error }}>×</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    <Pressable onPress={() => addSet(exIndex)}>
                      <Text variant="caption" color="primary">+ Ajouter une série</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>

          {saveError ? <Badge label={saveError} tone="error" /> : null}

          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
            <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
            <View style={{ flex: 1 }} />
            <Button label={addWorkout.isPending ? '…' : 'Enregistrer la séance'} onPress={submit} disabled={addWorkout.isPending} />
          </View>
        </>
      )}
    </Screen>
  );
}
