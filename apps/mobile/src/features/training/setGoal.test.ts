import { describe, expect, it } from 'vitest';
import { describeBlock, describeSet } from './setGoal';

describe('describeSet', () => {
  it('donne une durée en minutes et secondes', () => {
    expect(describeSet({ exerciseId: 'x', order: 0, durationSec: 120 })).toBe('2:00');
    expect(describeSet({ exerciseId: 'x', order: 0, durationSec: 30 })).toBe('0:30');
    expect(describeSet({ exerciseId: 'x', order: 0, durationSec: 90 })).toBe('1:30');
  });

  it('dit les mètres plutôt que de les faire passer pour des répétitions', () => {
    expect(describeSet({ exerciseId: 'x', order: 0, distanceM: 250 })).toBe('250 m');
  });

  it('ajoute la charge à ce qui est prescrit', () => {
    expect(describeSet({ exerciseId: 'x', order: 0, reps: 20, weightKg: 24 })).toBe('20 rép. · 24 kg');
    expect(describeSet({ exerciseId: 'x', order: 0, durationSec: 120, weightKg: 30 })).toBe('2:00 · 30 kg');
  });

  it('ne laisse pas une étape libre sans indication', () => {
    expect(describeSet({ exerciseId: 'x', order: 0 })).toBe('libre');
  });
});

describe('describeBlock', () => {
  it('nomme un plafond de temps', () => {
    expect(describeBlock({ format: 'amrap', timeCapSec: 120, sets: [] })).toBe('AMRAP 2 min');
    expect(describeBlock({ format: 'amrap', timeCapSec: 1200, sets: [] })).toBe('AMRAP 20 min');
  });

  it('arrondit un plafond à la seconde près sans mentir', () => {
    expect(describeBlock({ format: 'amrap', timeCapSec: 481, sets: [] })).toBe('AMRAP 8 min 1 s');
  });

  it('compte les tours d un bloc classique, et se tait quand il n y en a qu un', () => {
    expect(describeBlock({ format: 'strength', targetRounds: 2, sets: [] })).toBe('2 tours');
    expect(describeBlock({ format: 'strength', targetRounds: 1, sets: [] })).toBe('');
    expect(describeBlock({ format: 'strength', sets: [] })).toBe('');
  });

  it('nomme les autres formats', () => {
    expect(describeBlock({ format: 'emom', timeCapSec: 60, sets: [] })).toBe('EMOM 1 min');
    expect(describeBlock({ format: 'for_time', sets: [] })).toBe('Pour le temps');
    expect(describeBlock({ format: 'hyrox', sets: [] })).toBe('Hyrox');
  });
});
