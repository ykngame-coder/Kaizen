import { describe, expect, it } from 'vitest';
import { parseWorkoutText, resolveExerciseByName } from './workoutOcr';

describe('parseWorkoutText', () => {
  it('parses "Nom N×M poids kg" (multiplication sign) into N identical sets', () => {
    const out = parseWorkoutText('Développé couché 4×8 60 kg');
    expect(out.exercises).toHaveLength(1);
    expect(out.exercises[0]).toEqual({
      rawName: 'Développé couché',
      sets: [
        { reps: 8, weightKg: 60 },
        { reps: 8, weightKg: 60 },
        { reps: 8, weightKg: 60 },
        { reps: 8, weightKg: 60 },
      ],
      confidence: 'high',
    });
  });

  it('parses "Name NxM @Wkg" (lowercase x, @ for weight, no space before unit)', () => {
    const out = parseWorkoutText('Bench Press 4x8 @60kg');
    expect(out.exercises[0]!.rawName).toBe('Bench Press');
    expect(out.exercises[0]!.sets).toHaveLength(4);
    expect(out.exercises[0]!.sets[0]).toEqual({ reps: 8, weightKg: 60 });
    expect(out.exercises[0]!.confidence).toBe('high');
  });

  it('parses "Name weight kg xReps" (weight before reps, implicit single set)', () => {
    const out = parseWorkoutText('Squat 100 kg x5');
    expect(out.exercises[0]).toEqual({
      rawName: 'Squat',
      sets: [{ reps: 5, weightKg: 100 }],
      confidence: 'high',
    });
  });

  it('parses "Name NxM (Wkg)" (parenthesized weight)', () => {
    const out = parseWorkoutText('Curl 3x10 (12kg)');
    expect(out.exercises[0]!.sets).toHaveLength(3);
    expect(out.exercises[0]!.sets[0]).toEqual({ reps: 10, weightKg: 12 });
  });

  it('attaches a leading set-only line (no name) to the previous exercise', () => {
    const out = parseWorkoutText('Rowing barre\n3 × 12 @ 20 kg');
    expect(out.exercises).toHaveLength(1);
    expect(out.exercises[0]!.rawName).toBe('Rowing barre');
    expect(out.exercises[0]!.sets).toEqual([
      { reps: 12, weightKg: 20 },
      { reps: 12, weightKg: 20 },
      { reps: 12, weightKg: 20 },
    ]);
    expect(out.exercises[0]!.confidence).toBe('high');
  });

  it('treats a bodyweight exercise (no weight found) as high confidence, weightKg absent', () => {
    const out = parseWorkoutText('Pompes 3x15');
    expect(out.exercises[0]!.sets).toEqual([
      { reps: 15, weightKg: undefined },
      { reps: 15, weightKg: undefined },
      { reps: 15, weightKg: undefined },
    ]);
    expect(out.exercises[0]!.confidence).toBe('high');
  });

  it('converts pounds to kilograms', () => {
    const out = parseWorkoutText('Bench Press 4x8 @135lbs');
    expect(out.exercises[0]!.sets[0]!.weightKg).toBeCloseTo(61.2, 1);
  });

  it('strips a superset/numbering prefix before the exercise name', () => {
    const out = parseWorkoutText('A1. Squat 4x8 100kg');
    expect(out.exercises[0]!.rawName).toBe('Squat');
  });

  it('extracts a title-only first line (no digits) as the workout name', () => {
    const out = parseWorkoutText('Push Day\nDéveloppé couché 4x8 60kg');
    expect(out.name).toBe('Push Day');
    expect(out.exercises).toHaveLength(1);
    expect(out.exercises[0]!.rawName).toBe('Développé couché');
  });

  it('omits `name` entirely when the first line already looks like an exercise', () => {
    const out = parseWorkoutText('Squat 4x8 100kg');
    expect(out.name).toBeUndefined();
  });

  it('marks a name with no recognizable set data as to_confirm', () => {
    const out = parseWorkoutText('Exercice illisible ###');
    expect(out.exercises[0]).toEqual({ rawName: 'Exercice illisible ###', sets: [], confidence: 'to_confirm' });
  });

  it('marks an ambiguous single-number line as medium confidence', () => {
    // No × / x multiplier — could be reps or a set count, genuinely unclear.
    const out = parseWorkoutText('Gainage 45');
    expect(out.exercises[0]!.rawName).toBe('Gainage');
    expect(out.exercises[0]!.sets).toEqual([{ reps: 45, weightKg: undefined }]);
    expect(out.exercises[0]!.confidence).toBe('medium');
  });

  it('downgrades an otherwise-high exercise when a later continuation line is ambiguous', () => {
    const out = parseWorkoutText('Développé couché 4x8 60kg\n70kg');
    expect(out.exercises).toHaveLength(1);
    expect(out.exercises[0]!.sets).toHaveLength(5);
    expect(out.exercises[0]!.confidence).toBe('medium');
  });

  it('tolerates OCR noise: extra whitespace, comma decimals, mixed case multiplier', () => {
    const out = parseWorkoutText('  Soulevé de terre   3 X 5   102,5 kg  ');
    expect(out.exercises[0]!.rawName).toBe('Soulevé de terre');
    expect(out.exercises[0]!.sets[0]).toEqual({ reps: 5, weightKg: 102.5 });
  });

  it('parses multiple exercises across a realistic multi-line screenshot', () => {
    const out = parseWorkoutText(
      [
        'Séance Push',
        'Développé couché 4×8 60 kg',
        'Développé militaire 3x10 30kg',
        'Dips (triceps) 3x12',
      ].join('\n'),
    );
    expect(out.name).toBe('Séance Push');
    expect(out.exercises).toHaveLength(3);
    expect(out.exercises.map((e) => e.rawName)).toEqual(['Développé couché', 'Développé militaire', 'Dips (triceps)']);
  });

  it('returns no exercises for empty input', () => {
    expect(parseWorkoutText('')).toEqual({ exercises: [] });
    expect(parseWorkoutText('   \n  \n')).toEqual({ exercises: [] });
  });
});

describe('parseWorkoutText — noise filtering (Garmin/Hevy screenshots)', () => {
  it('drops Garmin chrome and group-count headers', () => {
    const text = [
      '17:11',
      'Les exercices physiques',
      'Squat arrière avec poids',
      '8 répét. • 45,0 kg',
      'Repos',
      '1:00',
      '3 sessions',
      'Échauffement',
      'Course tapis',
      '2:00',
      'Étapes',
      'Appui sur touche Lap',
    ].join('\n');
    const result = parseWorkoutText(text);
    const names = result.exercises.map((e) => e.rawName);
    expect(names).toEqual(['Squat arrière avec poids', 'Course tapis']);
  });

  it('drops Hevy chrome (column headers, nav labels, badges)', () => {
    const text = [
      '17:12',
      'HEVY',
      "Détails de l'Entraînement",
      'Développé Militaire (Barre)',
      'SÉRIE',
      'POIDS ET RÉPÉTITIONS',
      '1',
      '50 kg x 8',
      '60 kg x 4',
      'Poids',
      '1RM',
      'Voir plus',
      'Accueil',
    ].join('\n');
    const result = parseWorkoutText(text);
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.rawName).toBe('Développé Militaire (Barre)');
    expect(result.exercises[0]!.sets).toEqual([
      { reps: 8, weightKg: 50 },
      { reps: 4, weightKg: 60 },
    ]);
  });

  it('drops a bare clock/duration line without treating it as a rep count', () => {
    // Regression: "2:30" used to false-match as name="2:", reps=30.
    const result = parseWorkoutText(['Rameur', '2:30'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.rawName).toBe('Rameur');
    expect(result.exercises[0]!.sets).toEqual([]);
    expect(result.exercises[0]!.confidence).toBe('to_confirm');
  });

  it('collapses a consecutive duplicate line (scroll-ghosting artifact)', () => {
    const result = parseWorkoutText(['Rowing Penché (Barre)', 'Rowing Penché (Barre)', '50 kg x 8'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([{ reps: 8, weightKg: 50 }]);
  });

  it('parses the Garmin reps-then-weight format', () => {
    const result = parseWorkoutText(['Squat arrière avec poids', '8 répét. • 45,0 kg', '6 répét. • 65,0 kg'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([
      { reps: 8, weightKg: 45 },
      { reps: 6, weightKg: 65 },
    ]);
    expect(result.exercises[0]!.confidence).toBe('high');
  });

  it('drops a Hevy set-index line that is immediately followed by a self-contained value', () => {
    const result = parseWorkoutText(['Développé Couché (Barre)', '1', '75 kg x 8', '2', '75 kg x 8', 'W', '40 kg x 8'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([
      { reps: 8, weightKg: 75 },
      { reps: 8, weightKg: 75 },
      { reps: 8, weightKg: 40 },
    ]);
  });

  it('still treats a bare number as a continuation rep count when nothing self-contained follows it', () => {
    // Not a Hevy index line: no self-contained value on the next line, so the
    // existing "bare number = reps" continuation behavior must be preserved.
    const result = parseWorkoutText(['Pompes', '12'].join('\n'));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]!.sets).toEqual([{ reps: 12, weightKg: undefined }]);
  });
});

describe('parseWorkoutText — superset grouping', () => {
  it('groups two exercises tagged by a "Superset" marker into the same group', () => {
    const text = ['Rowing Penché (Barre)', '50 kg x 8', 'Superset', 'Développé Militaire (Barre)', '25 kg x 6'].join('\n');
    const result = parseWorkoutText(text);
    expect(result.exercises).toHaveLength(2);
    const [a, b] = result.exercises;
    expect(a!.supersetGroup).toBeDefined();
    expect(a!.supersetGroup).toBe(b!.supersetGroup);
  });

  it('chains a third exercise into the same group instead of starting a new one', () => {
    const text = [
      'Rowing Penché (Barre)', '50 kg x 8',
      'Superset', 'Développé Militaire (Barre)', '25 kg x 6',
      'Superset', 'Traction', '0 kg x 6',
    ].join('\n');
    const result = parseWorkoutText(text);
    const groups = new Set(result.exercises.map((e) => e.supersetGroup));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toBeDefined();
  });

  it('leaves ungrouped exercises without a supersetGroup', () => {
    const result = parseWorkoutText(['Squat arrière avec poids', '8 répét. • 45,0 kg'].join('\n'));
    expect(result.exercises[0]!.supersetGroup).toBeUndefined();
  });

  it('assigns a fresh group number to a second, unrelated superset pair', () => {
    const text = [
      'Rowing', '10 kg x 5', 'Superset', 'Presse', '10 kg x 5',
      'Fentes', '10 kg x 5', 'Superset', 'Traction', '10 kg x 5',
    ].join('\n');
    const result = parseWorkoutText(text);
    const byName = new Map(result.exercises.map((e) => [e.rawName, e.supersetGroup]));
    expect(byName.get('Rowing')).toBe(byName.get('Presse'));
    expect(byName.get('Fentes')).toBe(byName.get('Traction'));
    expect(byName.get('Rowing')).not.toBe(byName.get('Fentes'));
  });
});

describe('resolveExerciseByName', () => {
  it('resolves an exact name to its exercise id with score 1', () => {
    const r = resolveExerciseByName('Développé couché');
    expect(r.exerciseId).toBe('ex-bench-press');
    expect(r.score).toBe(1);
  });

  it('resolves a case/accent-insensitive variant', () => {
    const r = resolveExerciseByName('developpe couche');
    expect(r.exerciseId).toBe('ex-bench-press');
    expect(r.score).toBeGreaterThan(0.8);
  });

  it('resolves a common abbreviation ("dev couché")', () => {
    const r = resolveExerciseByName('dev couché');
    expect(r.exerciseId).toBe('ex-bench-press');
    expect(r.score).toBeGreaterThanOrEqual(0.55);
  });

  it('resolves the English gym term "bench" via the alias table', () => {
    const r = resolveExerciseByName('bench');
    expect(r.exerciseId).toBe('ex-bench-press');
  });

  it('resolves "squat barre" to the barbell squat', () => {
    const r = resolveExerciseByName('squat barre');
    expect(r.exerciseId).toBe('ex-back-squat');
  });

  it('leaves gibberish unresolved (no exerciseId, low score)', () => {
    const r = resolveExerciseByName('xkqzwjfoo blah');
    expect(r.exerciseId).toBeUndefined();
    expect(r.matchName).toBeUndefined();
    expect(r.score).toBeLessThan(0.55);
  });

  it('returns score 0 for empty input', () => {
    expect(resolveExerciseByName('')).toEqual({ score: 0 });
  });
});
