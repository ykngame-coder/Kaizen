import { describe, expect, it } from 'vitest';
import { FitBaseType, FitEncoder, type FitEncoderField } from 'fit-file-parser';
import { parseGarminFitWorkout } from './garminFit';

// Field numbers/sizes/baseTypes for the 'set' message (global mesg 225) —
// verified against Garmin's published FIT profile and round-tripped through
// the real encoder/parser (see packages/connectors/src/garminFit.ts header
// comment for the source).
const SET_MESG = 225;
const START_TIME = FitEncoder.toFitTimestamp(new Date('2026-06-01T10:00:00Z'));

function categoryBytes(id: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, id, true);
  return bytes;
}

function encodeActiveSet(opts: { reps: number; weightKg?: number; categoryId?: number; durationSec?: number }): void {
  const fields: FitEncoderField[] = [
    { number: 0, size: 4, baseType: FitBaseType.Uint32, value: (opts.durationSec ?? 30) * 1000 },
    { number: 3, size: 2, baseType: FitBaseType.Uint16, value: opts.reps },
    { number: 5, size: 1, baseType: FitBaseType.Uint8, value: 1 }, // active
    { number: 6, size: 4, baseType: FitBaseType.Uint32, value: START_TIME },
    { number: 254, size: 4, baseType: FitBaseType.Uint32, value: START_TIME },
  ];
  if (opts.weightKg !== undefined) fields.push({ number: 4, size: 2, baseType: FitBaseType.Uint16, value: opts.weightKg * 16 });
  if (opts.categoryId !== undefined) fields.push({ number: 7, size: 2, baseType: FitBaseType.Uint16, value: categoryBytes(opts.categoryId) });
  encoder.writeMessage(SET_MESG, fields, 0);
}

function encodeRestSet(): void {
  encoder.writeMessage(SET_MESG, [
    { number: 0, size: 4, baseType: FitBaseType.Uint32, value: 60 * 1000 },
    { number: 5, size: 1, baseType: FitBaseType.Uint8, value: 0 }, // rest
    { number: 6, size: 4, baseType: FitBaseType.Uint32, value: START_TIME },
    { number: 254, size: 4, baseType: FitBaseType.Uint32, value: START_TIME },
  ], 0);
}

let encoder: FitEncoder;

function resetEncoder(): void {
  encoder = new FitEncoder();
}

describe('parseGarminFitWorkout', () => {
  it('extracts an active set with a mapped category (bench_press, id 0)', async () => {
    resetEncoder();
    encodeActiveSet({ reps: 8, weightKg: 60, categoryId: 0 });
    const bytes = encoder.close();

    const workout = await parseGarminFitWorkout(bytes, 'garmin-fit-1');
    expect(workout).not.toBeNull();
    expect(workout!.externalId).toBe('garmin-fit-1');
    expect(workout!.sets).toEqual([
      { startedAt: '2026-06-01T10:00:00.000Z', exerciseId: 'ex-bench-press', reps: 8, weightKg: 60 },
    ]);
  });

  it('drops rest sets', async () => {
    resetEncoder();
    encodeActiveSet({ reps: 8, weightKg: 60, categoryId: 0 });
    encodeRestSet();
    const bytes = encoder.close();

    const workout = await parseGarminFitWorkout(bytes, 'garmin-fit-2');
    expect(workout!.sets).toHaveLength(1);
  });

  it('drops sets whose category has no confident muscle mapping (e.g. run, id 32)', async () => {
    resetEncoder();
    encodeActiveSet({ reps: 5, categoryId: 32 });
    const bytes = encoder.close();

    const workout = await parseGarminFitWorkout(bytes, 'garmin-fit-3');
    expect(workout).toBeNull();
  });

  it('drops sets with no category at all', async () => {
    resetEncoder();
    encodeActiveSet({ reps: 5 });
    const bytes = encoder.close();

    const workout = await parseGarminFitWorkout(bytes, 'garmin-fit-4');
    expect(workout).toBeNull();
  });

  it('keeps multiple mapped sets and uses the first one for startedAt', async () => {
    resetEncoder();
    encodeActiveSet({ reps: 10, weightKg: 40, categoryId: 28 }); // squat
    encodeActiveSet({ reps: 8, weightKg: 60, categoryId: 0 }); // bench_press
    const bytes = encoder.close();

    const workout = await parseGarminFitWorkout(bytes, 'garmin-fit-5');
    expect(workout!.sets.map((s) => s.exerciseId)).toEqual(['ex-back-squat', 'ex-bench-press']);
    expect(workout!.startedAt).toBe(workout!.sets[0]!.startedAt);
  });

  it('returns null when there are no sets in the file', async () => {
    resetEncoder();
    const bytes = encoder.close();
    const workout = await parseGarminFitWorkout(bytes, 'garmin-fit-6');
    expect(workout).toBeNull();
  });
});
