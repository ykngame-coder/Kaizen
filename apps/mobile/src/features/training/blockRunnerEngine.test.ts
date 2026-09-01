import { describe, expect, it } from 'vitest';
import { computeAmrapState, computeEmomState, computeForTimeState, formatClock, supersetPartners } from './blockRunnerEngine';

describe('computeAmrapState', () => {
  it('counts down from the time cap', () => {
    expect(computeAmrapState(45, 720, 0)).toEqual({ displaySec: 675, currentRound: 1, isFinished: false });
  });

  it('reflects rounds already completed in the round number', () => {
    expect(computeAmrapState(200, 720, 3)).toEqual({ displaySec: 520, currentRound: 4, isFinished: false });
  });

  it('finishes at (and clamps past) the time cap', () => {
    expect(computeAmrapState(720, 720, 5)).toEqual({ displaySec: 0, currentRound: 6, isFinished: true });
    expect(computeAmrapState(999, 720, 5)).toEqual({ displaySec: 0, currentRound: 6, isFinished: true });
  });
});

describe('computeEmomState', () => {
  it('starts on round 1 with the full interval remaining', () => {
    expect(computeEmomState(0, 60, 10)).toEqual({ displaySec: 60, currentRound: 1, isFinished: false });
  });

  it('advances the round automatically as elapsed time crosses an interval boundary', () => {
    expect(computeEmomState(65, 60, 10)).toEqual({ displaySec: 55, currentRound: 2, isFinished: false });
  });

  it('finishes once elapsed time reaches targetRounds * interval', () => {
    expect(computeEmomState(600, 60, 10)).toEqual({ displaySec: 0, currentRound: 10, isFinished: true });
  });

  it('clamps the round number at targetRounds past the end', () => {
    expect(computeEmomState(700, 60, 10)).toEqual({ displaySec: 0, currentRound: 10, isFinished: true });
  });
});

describe('computeForTimeState', () => {
  it('counts elapsed time up, round number one ahead of completed', () => {
    expect(computeForTimeState(142, 3, 8)).toEqual({ displaySec: 142, currentRound: 4, isFinished: false });
  });

  it('finishes once every round is completed', () => {
    expect(computeForTimeState(522, 8, 8)).toEqual({ displaySec: 522, currentRound: 8, isFinished: true });
  });
});

describe('formatClock', () => {
  it('formats minutes:seconds with a zero-padded seconds field', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(38)).toBe('0:38');
    expect(formatClock(452)).toBe('7:32');
  });
});

describe('supersetPartners', () => {
  it('returns the other exercise ids sharing the same group', () => {
    const sets = [
      { exerciseId: 'a', supersetGroup: 1 },
      { exerciseId: 'b', supersetGroup: 1 },
      { exerciseId: 'c', supersetGroup: undefined },
    ];
    expect(supersetPartners(sets, 0)).toEqual(['b']);
    expect(supersetPartners(sets, 1)).toEqual(['a']);
    expect(supersetPartners(sets, 2)).toEqual([]);
  });

  it('deduplicates and excludes the set at index itself even if the id repeats', () => {
    const sets = [
      { exerciseId: 'a', supersetGroup: 1 },
      { exerciseId: 'a', supersetGroup: 1 },
      { exerciseId: 'b', supersetGroup: 1 },
    ];
    expect(supersetPartners(sets, 0)).toEqual(['b']);
  });
});
