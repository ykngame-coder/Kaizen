import { describe, expect, it } from 'vitest';
import { EngineRegistry } from './registry';
import type { EngineContext, EngineResult } from './result';
import type { HealthMetric } from '@supotsu/core';
import type { RecoveryEngine } from './contracts';

/** Minimal stub proving the contracts compose and resolve by key. */
const stubRecovery: RecoveryEngine = {
  key: 'recovery',
  async scoreRecovery(ctx: EngineContext): Promise<EngineResult<number>> {
    return {
      value: 82,
      confidence: 'high',
      sourcesUsed: ['garmin'],
      generatedAt: ctx.asOf,
    };
  },
  async trainingReadiness(ctx: EngineContext): Promise<EngineResult<number>> {
    return { value: 75, confidence: 'medium', sourcesUsed: ['garmin'], generatedAt: ctx.asOf };
  },
};

describe('EngineRegistry', () => {
  it('registers and resolves an engine by key', async () => {
    const registry = new EngineRegistry();
    registry.register(stubRecovery);

    expect(registry.has('recovery')).toBe(true);
    const engine = registry.get<RecoveryEngine>('recovery');

    const ctx: EngineContext = { userId: 'u1', asOf: '2026-07-19T08:00:00.000Z' };
    const result = await engine.scoreRecovery(ctx, [] as HealthMetric[]);
    expect(result.value).toBe(82);
    expect(result.confidence).toBe('high');
  });

  it('rejects duplicate keys and unknown lookups', () => {
    const registry = new EngineRegistry();
    registry.register(stubRecovery);
    expect(() => registry.register(stubRecovery)).toThrow();
    expect(() => registry.get('sleep')).toThrow();
  });
});
