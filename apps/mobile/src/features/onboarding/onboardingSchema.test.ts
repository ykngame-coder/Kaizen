import { describe, expect, it } from 'vitest';
import { onboardingSchema, STEP_FIELDS } from './onboardingSchema';
import { credentialsSchema } from '../auth/authSchema';

describe('onboardingSchema', () => {
  it('coerces empty numeric strings to undefined', () => {
    const parsed = onboardingSchema.parse({
      level: 'intermediate',
      sex: 'unspecified',
      heightCm: '',
      weightKg: '78',
      sports: [],
      goalType: 'strength',
      goalTitle: 'Squat 140kg',
      equipment: [],
    });
    expect(parsed.heightCm).toBeUndefined();
    expect(parsed.weightKg).toBe(78);
  });

  it('requires a goal title', () => {
    expect(() =>
      onboardingSchema.parse({
        level: 'beginner',
        sex: 'male',
        sports: [],
        goalType: 'health',
        goalTitle: '',
        equipment: [],
      }),
    ).toThrow();
  });

  it('exposes validation fields for each of the 7 steps', () => {
    expect(STEP_FIELDS).toHaveLength(7);
    expect(STEP_FIELDS[1]).toContain('level');
    expect(STEP_FIELDS[2]).toContain('goalTitle');
  });

  it('defaults habits to an empty array and accepts custom entries', () => {
    const parsed = onboardingSchema.parse({
      level: 'beginner',
      sex: 'unspecified',
      sports: [],
      goalType: 'health',
      goalTitle: 'Dormir plus',
      equipment: [],
      habits: [{ name: "Boire de l'eau", pillar: 'nutrition', cadence: 'daily', targetPerPeriod: 1 }],
    });
    expect(parsed.habits).toHaveLength(1);
    expect(onboardingSchema.parse({
      level: 'beginner',
      sex: 'unspecified',
      sports: [],
      goalType: 'health',
      goalTitle: 'Dormir plus',
      equipment: [],
    }).habits).toEqual([]);
  });
});

describe('credentialsSchema', () => {
  it('rejects short passwords and bad emails', () => {
    expect(() => credentialsSchema.parse({ email: 'x', password: 'y' })).toThrow();
    expect(credentialsSchema.parse({ email: 'a@b.co', password: '12345678' }).email).toBe('a@b.co');
  });
});
