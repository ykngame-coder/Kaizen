import { describe, expect, it } from 'vitest';
import { blocksToSessionInput, blocksToWorkoutInput, defaultTimeCapForFormat, normalizeSearch, type BlockDraft } from './sessionBuilder';

function block(overrides: Partial<BlockDraft> = {}): BlockDraft {
  return {
    format: 'strength',
    timeCapSec: '',
    restSec: '',
    targetRounds: '',
    order: [],
    selected: {},
    supersetGroups: {},
    ...overrides,
  };
}

describe('blocksToSessionInput', () => {
  it('converts a single strength block into one SessionBlockInput', () => {
    const b = block({
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'squat', reps: '12', weight: '60', rest: '90' } },
    });
    const out = blocksToSessionInput([b]);
    expect(out).toEqual([
      {
        format: 'strength',
        timeCapSec: undefined,
        targetRounds: undefined,
        exercises: [{ exerciseId: 'squat', order: 0, reps: 12, weightKg: 60, restSec: 90 }],
      },
    ]);
  });

  it('preserves multiple blocks with their own format and exercises, in order', () => {
    const strength = block({
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'bench', reps: '8', weight: '40', rest: '60' } },
    });
    const amrap = block({
      format: 'amrap',
      timeCapSec: '10',
      order: ['slot2', 'slot3'],
      selected: {
        slot2: { exerciseId: 'burpees', reps: '10', weight: '', rest: '' },
        slot3: { exerciseId: 'situps', reps: '15', weight: '', rest: '' },
      },
    });
    const out = blocksToSessionInput([strength, amrap]);
    expect(out).toHaveLength(2);
    expect(out[0]?.format).toBe('strength');
    expect(out[1]).toEqual({
      format: 'amrap',
      timeCapSec: 600, // 10 min -> seconds
      targetRounds: undefined,
      exercises: [
        { exerciseId: 'burpees', order: 0, reps: 10, weightKg: undefined, restSec: undefined },
        { exerciseId: 'situps', order: 1, reps: 15, weightKg: undefined, restSec: undefined },
      ],
    });
  });

  it('drops a block with zero exercises', () => {
    const empty = block({ order: [] });
    const withOne = block({
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'row', reps: '10', weight: '', rest: '' } },
    });
    const out = blocksToSessionInput([empty, withOne]);
    expect(out).toHaveLength(1);
    expect(out[0]?.exercises[0]?.exerciseId).toBe('row');
  });

  it('ignores rest for non-strength blocks', () => {
    const emom = block({
      format: 'emom',
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'kb-swing', reps: '15', weight: '', rest: '30' } },
    });
    const out = blocksToSessionInput([emom]);
    expect(out[0]?.exercises[0]?.restSec).toBeUndefined();
  });

  it('converts a for_time target from minutes to seconds', () => {
    const forTime = block({
      format: 'for_time',
      timeCapSec: '12',
      targetRounds: '3',
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'thruster', reps: '21', weight: '40', rest: '' } },
    });
    expect(blocksToSessionInput([forTime])[0]?.timeCapSec).toBe(720);
  });

  it('leaves a for_time block without a target undefined', () => {
    const forTime = block({
      format: 'for_time',
      timeCapSec: '',
      targetRounds: '3',
      order: ['slot1'],
      selected: { slot1: { exerciseId: 'thruster', reps: '21', weight: '40', rest: '' } },
    });
    expect(blocksToSessionInput([forTime])[0]?.timeCapSec).toBeUndefined();
  });

  it('mappe la distance et la durée d un bloc hyrox', () => {
    const b = block({
      format: 'hyrox',
      order: ['slot1', 'slot2'],
      selected: {
        slot1: { exerciseId: 'rowing', reps: '', weight: '', rest: '', distance: '1000', hyroxMode: 'distance' },
        slot2: { exerciseId: 'skierg', reps: '', weight: '', rest: '', duration: '240', hyroxMode: 'time' },
      },
    });
    const [out] = blocksToSessionInput([b]);
    expect(out!.exercises[0]).toMatchObject({ exerciseId: 'rowing', distanceM: 1000, durationSec: undefined });
    expect(out!.exercises[1]).toMatchObject({ exerciseId: 'skierg', distanceM: undefined, durationSec: 240 });
  });
});

describe('defaultTimeCapForFormat', () => {
  it('donne un plafond en minutes pour un AMRAP', () => {
    expect(defaultTimeCapForFormat('amrap')).toBe('12');
  });

  it('donne une minute d’intervalle pour un EMOM, pas 12 secondes', () => {
    expect(defaultTimeCapForFormat('emom')).toBe('60');
  });

  it('laisse l’objectif For Time vide — il est facultatif', () => {
    expect(defaultTimeCapForFormat('for_time')).toBe('');
  });
});

describe('normalizeSearch', () => {
  it('replie les accents et la casse', () => {
    expect(normalizeSearch('Élévation Latérale')).toBe('elevation laterale');
  });

  it('laisse un texte déjà simple inchangé', () => {
    expect(normalizeSearch('squat')).toBe('squat');
  });

  it('rogne les espaces de bord', () => {
    expect(normalizeSearch('  Développé  ')).toBe('developpe');
  });

  it('gère une entrée vide', () => {
    expect(normalizeSearch('')).toBe('');
  });
});

/**
 * Régression : ce mapping vivait en double, recopié dans NewWorkoutScreen et
 * EditWorkoutScreen. Les deux copies ont été oubliées à l'ajout de Tabata, si
 * bien qu'un bloc Tabata créé là perdait travail, repos et rounds en silence.
 */
describe('blocksToWorkoutInput', () => {
  const withSlot = (over: Partial<BlockDraft>): BlockDraft => {
    const slot = 'slot-1';
    return block({ order: [slot], selected: { [slot]: { exerciseId: 'squat', reps: '5', weight: '60', rest: '90' } }, ...over });
  };

  it('conserve travail, repos et rounds d un Tabata', () => {
    const [out] = blocksToWorkoutInput([withSlot({ format: 'tabata', timeCapSec: '20', restSec: '10', targetRounds: '8' })]);
    expect(out).toMatchObject({ format: 'tabata', timeCapSec: 20, restSec: 10, targetRounds: 8 });
  });

  it('garde un repos de 0 s au lieu de l effacer', () => {
    const [out] = blocksToWorkoutInput([withSlot({ format: 'tabata', timeCapSec: '60', restSec: '0', targetRounds: '10' })]);
    expect(out!.restSec).toBe(0);
  });

  it('convertit en secondes pour AMRAP, laisse EMOM en secondes', () => {
    expect(blocksToWorkoutInput([withSlot({ format: 'amrap', timeCapSec: '12' })])[0]!.timeCapSec).toBe(720);
    expect(blocksToWorkoutInput([withSlot({ format: 'emom', timeCapSec: '60' })])[0]!.timeCapSec).toBe(60);
  });

  it('ne pose un repos de série que sur un bloc musculation', () => {
    expect(blocksToWorkoutInput([withSlot({ format: 'strength' })])[0]!.sets[0]!.restSec).toBe(90);
    expect(blocksToWorkoutInput([withSlot({ format: 'amrap', timeCapSec: '12' })])[0]!.sets[0]!.restSec).toBeUndefined();
  });

  it('n attribue aucun round aux formats qui n en ont pas', () => {
    expect(blocksToWorkoutInput([withSlot({ format: 'amrap', timeCapSec: '12', targetRounds: '5' })])[0]!.targetRounds).toBeUndefined();
  });

  it('mappe la distance pour une station distance, la durée pour une station temps', () => {
    const [out] = blocksToWorkoutInput([
      withSlot({
        format: 'hyrox',
        order: ['slot-1', 'slot-2'],
        selected: {
          'slot-1': { exerciseId: 'rowing', reps: '', weight: '20', rest: '', distance: '1000', hyroxMode: 'distance' },
          'slot-2': { exerciseId: 'skierg', reps: '', weight: '', rest: '', duration: '240', hyroxMode: 'time' },
        },
      }),
    ]);
    expect(out!.sets[0]).toMatchObject({ exerciseId: 'rowing', distanceM: 1000, durationSec: undefined, weightKg: 20 });
    expect(out!.sets[1]).toMatchObject({ exerciseId: 'skierg', distanceM: undefined, durationSec: 240 });
  });

  it('ne pose ni distance ni durée sur un format qui n est pas hyrox', () => {
    const [out] = blocksToWorkoutInput([withSlot({ format: 'strength' })]);
    expect(out!.sets[0]!.distanceM).toBeUndefined();
    expect(out!.sets[0]!.durationSec).toBeUndefined();
  });
});
