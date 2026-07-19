import { describe, expect, it } from 'vitest';
import { activityInputSchema, athleteProfileInputSchema, goalInputSchema } from './schemas';

describe('schemas', () => {
  it('accepts a valid athlete profile and defaults source-less fields', () => {
    const parsed = athleteProfileInputSchema.parse({ level: 'intermediate' });
    expect(parsed.sex).toBe('unspecified');
    expect(parsed.sports).toEqual([]);
  });

  it('defaults manual source on activity input', () => {
    const parsed = activityInputSchema.parse({
      type: 'running',
      startedAt: '2026-07-19T08:00:00.000Z',
      durationSec: 1800,
    });
    expect(parsed.source).toBe('manual');
  });

  it('rejects an empty goal title', () => {
    expect(() => goalInputSchema.parse({ type: 'strength', title: '' })).toThrow();
  });
});
