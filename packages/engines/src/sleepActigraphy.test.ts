import { describe, expect, it } from 'vitest';
import type { SleepSession } from '@supotsu/core';
import { analyzeSleep, isLightSleep, nightDateKey, resolveSleepSessionInsert, type MovementEpoch } from './sleepActigraphy';

const START = new Date('2026-07-19T22:30:00.000Z').getTime();
const MIN = 60_000;

/** `n` epochs, 60s apart from START, each with the given motion (or from a per-index function). */
function epochs(n: number, motion: number | ((i: number) => number)): MovementEpoch[] {
  return Array.from({ length: n }, (_, i) => ({
    t: new Date(START + i * MIN).toISOString(),
    motion: typeof motion === 'function' ? motion(i) : motion,
  }));
}
const at = (minutesAfterStart: number): string => new Date(START + minutesAfterStart * MIN).toISOString();

describe('analyzeSleep', () => {
  it('reads a calm 8h night as mostly deep/light, high confidence, no REM', () => {
    // 480 epochs (8h @ 60s), almost all very low motion — a still night.
    const night = epochs(480, () => 0.05);
    const { session, confidence } = analyzeSleep(night, at(0), at(480));

    expect(session.source).toBe('phone');
    expect(session.reliability).toBe('low');
    expect(session.remMin).toBe(0);
    expect(session.deepMin).toBeGreaterThan(400);
    expect(session.awakeMin).toBe(0);
    expect(session.asleepMin).toBe(session.deepMin + session.lightMin);
    expect(session.inBedMin).toBe(480);
    expect(confidence).toBe('high');
  });

  it('reads a restless night with frequent movement as mostly light + some awake', () => {
    // Motion oscillates between light and clearly-awake spikes — never a long still stretch.
    const night = epochs(300, (i) => (i % 4 === 0 ? 0.8 : 0.35));
    const { session, confidence } = analyzeSleep(night, at(0), at(300));

    expect(session.deepMin).toBe(0);
    expect(session.lightMin).toBeGreaterThan(0);
    expect(session.awakeMin).toBeGreaterThan(0);
    expect(confidence).toBe('high'); // plenty of epochs + a long enough night, even though restless
  });

  it('smooths an isolated low-motion blip into light rather than deep (not "prolonged" stillness)', () => {
    // A single very-low epoch surrounded by moderate motion shouldn't read as a deep-sleep segment.
    const night = epochs(60, (i) => (i === 30 ? 0.05 : 0.3));
    const { session } = analyzeSleep(night, at(0), at(60));
    expect(session.deepMin).toBe(0);
  });

  it('keeps a sustained low-motion stretch as deep', () => {
    const night = epochs(60, (i) => (i >= 20 && i < 40 ? 0.05 : 0.3));
    const { session } = analyzeSleep(night, at(0), at(60));
    expect(session.deepMin).toBeGreaterThanOrEqual(19);
  });

  it('marks a wake-up spike in the middle of the night as an awake segment', () => {
    const night = epochs(120, (i) => (i >= 60 && i < 63 ? 0.9 : 0.05));
    const { session } = analyzeSleep(night, at(0), at(120));
    expect(session.awakeMin).toBeGreaterThanOrEqual(2);
    expect(session.deepMin).toBeGreaterThan(100);
  });

  it('builds contiguous segments covering the classified epochs', () => {
    const night = epochs(10, (i) => (i < 5 ? 0.05 : 0.9));
    const { session } = analyzeSleep(night, at(0), at(10));
    expect(session.segments).toBeDefined();
    expect(session.segments!.length).toBeGreaterThanOrEqual(2);
    for (const seg of session.segments!) {
      expect(new Date(seg.endedAt).getTime()).toBeGreaterThan(new Date(seg.startedAt).getTime());
    }
  });

  it('flags a very short/sparse night as to_confirm', () => {
    const night = epochs(5, 0.05); // only 5 minutes of data
    const { confidence } = analyzeSleep(night, at(0), at(5));
    expect(confidence).toBe('to_confirm');
  });

  it('flags a short-but-plausible nap-length night as medium confidence', () => {
    const night = epochs(150, () => 0.05); // 2.5h, calm — decent epoch count but short duration
    const { confidence } = analyzeSleep(night, at(0), at(150));
    expect(confidence).toBe('medium');
  });

  it('returns to_confirm and zeroed minutes for an empty timeline', () => {
    const { session, confidence } = analyzeSleep([], at(0), at(480));
    expect(confidence).toBe('to_confirm');
    expect(session.deepMin).toBe(0);
    expect(session.lightMin).toBe(0);
    expect(session.awakeMin).toBe(0);
    expect(session.asleepMin).toBe(0);
    expect(session.inBedMin).toBe(480);
    expect(session.segments).toBeUndefined();
  });

  it('ignores epochs outside the in-bed window', () => {
    const before = { t: at(-30), motion: 0.9 };
    const night = [before, ...epochs(60, 0.05)];
    const { session } = analyzeSleep(night, at(0), at(60));
    expect(session.awakeMin).toBe(0);
  });
});

describe('isLightSleep', () => {
  it('is false for a sustained deep-sleep window', () => {
    expect(isLightSleep(epochs(10, 0.05))).toBe(false);
  });

  it('is true for a window ending in noticeable movement', () => {
    expect(isLightSleep(epochs(10, (i) => (i < 7 ? 0.05 : 0.6)))).toBe(true);
  });

  it('is true for a moderate, non-still window (light sleep)', () => {
    expect(isLightSleep(epochs(10, 0.35))).toBe(true);
  });

  it('is false for an empty window (no signal to trigger on)', () => {
    expect(isLightSleep([])).toBe(false);
  });

  it('is true when the window ends on an isolated low blip that smooths away from deep', () => {
    expect(isLightSleep(epochs(6, (i) => (i === 5 ? 0.05 : 0.3)))).toBe(true);
  });
});

describe('nightDateKey', () => {
  it('extracts a local calendar-day key from an ISO timestamp', () => {
    expect(nightDateKey('2026-07-19T22:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives the same key for two timestamps on the same local day', () => {
    expect(nightDateKey('2026-07-19T08:00:00.000Z')).toBe(nightDateKey('2026-07-19T10:00:00.000Z'));
  });
});

describe('resolveSleepSessionInsert', () => {
  it('inserts when no session exists yet for the night', () => {
    expect(resolveSleepSessionInsert(undefined, 'low')).toBe('insert');
    expect(resolveSleepSessionInsert([], 'low')).toBe('insert');
  });

  it('skips a low-reliability candidate when a higher-reliability session already covers the night', () => {
    const existing: Pick<SleepSession, 'reliability'>[] = [{ reliability: 'high' }];
    expect(resolveSleepSessionInsert(existing, 'low')).toBe('skip');
  });

  it('skips when the existing session has no reliability set (treated as trustworthy, never silently overridden)', () => {
    const existing: Pick<SleepSession, 'reliability'>[] = [{ reliability: undefined }];
    expect(resolveSleepSessionInsert(existing, 'low')).toBe('skip');
  });

  it('inserts a higher-reliability candidate over an existing low-reliability session', () => {
    const existing: Pick<SleepSession, 'reliability'>[] = [{ reliability: 'low' }];
    expect(resolveSleepSessionInsert(existing, 'high')).toBe('insert');
  });

  it('skips when the candidate only matches the existing (equal) reliability — one session per night unless strictly better', () => {
    const existing: Pick<SleepSession, 'reliability'>[] = [{ reliability: 'low' }];
    expect(resolveSleepSessionInsert(existing, 'low')).toBe('skip');
  });
});
