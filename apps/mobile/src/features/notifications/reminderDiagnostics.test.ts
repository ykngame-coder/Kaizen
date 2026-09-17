import { describe, expect, it } from 'vitest';
import { describeDiagnostic, reminderDiagnostics } from './reminderDiagnostics';

const AT = '2026-09-17T19:28:00.000Z';

describe('reminderDiagnostics', () => {
  it('prévient les abonnés, et se tait une fois désabonné', () => {
    let calls = 0;
    const off = reminderDiagnostics.subscribe(() => {
      calls += 1;
    });
    reminderDiagnostics.set({ at: AT, outcome: 'loading' });
    expect(calls).toBe(1);
    expect(reminderDiagnostics.get()).toMatchObject({ outcome: 'loading' });
    off();
    reminderDiagnostics.set({ at: AT, outcome: 'not-ready' });
    expect(calls).toBe(1);
  });

  it('dit combien de rappels ont été calculés et programmés', () => {
    const line = describeDiagnostic({
      at: AT,
      outcome: 'scheduled',
      wanted: 5,
      result: { scheduled: 3, cancelled: 0, kept: 2, failed: 0 },
    });
    expect(line).toContain('5 calculés');
    expect(line).toContain('3 programmés');
    expect(line).toContain('0 échecs');
  });

  it('rapporte l erreur plutôt que de la perdre', () => {
    expect(describeDiagnostic({ at: AT, outcome: 'error', error: 'boom' })).toContain('erreur : boom');
  });
});
