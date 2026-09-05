import { describe, expect, it } from 'vitest';
import { blocksToSessionInput, type BlockDraft } from './sessionBuilder';

function block(overrides: Partial<BlockDraft> = {}): BlockDraft {
  return {
    format: 'strength',
    timeCapSec: '',
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
});
