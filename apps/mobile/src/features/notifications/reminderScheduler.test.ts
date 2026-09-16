import { describe, expect, it } from 'vitest';
import type { PlannedReminder } from '@supotsu/engines';
import { REMINDER_ID_PREFIX, syncReminders } from './reminderScheduler';
import type { NotificationHost, ScheduledNotification } from './notificationHost';

const reminder = (id: string, at: string): PlannedReminder => ({ id, kind: 'habits', at, params: {} });
const text = (): { title: string; body: string } => ({ title: 'Titre', body: 'Corps' });

function fakeHost(initial: ScheduledNotification[] = [], failOn: string[] = []) {
  const state = new Map(initial.map((n) => [n.id, n]));
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
  const host: NotificationHost = {
    permission: async () => 'granted',
    requestPermission: async () => 'granted',
    scheduled: async () => [...state.values()],
    schedule: async (n) => {
      if (failOn.includes(n.id)) throw new Error('refusé par iOS');
      calls.scheduled.push(n.id);
      state.set(n.id, { id: n.id, at: n.at });
    },
    cancel: async (id) => {
      calls.cancelled.push(id);
      state.delete(id);
    },
    onResponse: () => () => undefined,
  };
  return { host, calls, state };
}

const ID = (suffix: string): string => `${REMINDER_ID_PREFIX}:${suffix}`;

describe('syncReminders', () => {
  it('programme ce qui manque', async () => {
    const { host, calls } = fakeHost();
    const out = await syncReminders(host, [reminder('habits:2026-09-17', '2026-09-17T18:30:00.000Z')], text);
    expect(calls.scheduled).toEqual([ID('habits:2026-09-17')]);
    expect(out).toMatchObject({ scheduled: 1, cancelled: 0, kept: 0, failed: 0 });
  });

  it('annule ce qui n a plus lieu d être', async () => {
    const { host, calls } = fakeHost([{ id: ID('habits:2026-09-17'), at: '2026-09-17T18:30:00.000Z' }]);
    const out = await syncReminders(host, [], text);
    expect(calls.cancelled).toEqual([ID('habits:2026-09-17')]);
    expect(out.cancelled).toBe(1);
  });

  it('laisse intact ce qui est déjà correct', async () => {
    const { host, calls } = fakeHost([{ id: ID('habits:2026-09-17'), at: '2026-09-17T18:30:00.000Z' }]);
    const out = await syncReminders(host, [reminder('habits:2026-09-17', '2026-09-17T18:30:00.000Z')], text);
    expect(calls).toEqual({ scheduled: [], cancelled: [] });
    expect(out.kept).toBe(1);
  });

  it('reprogramme quand l heure a changé', async () => {
    const { host, calls } = fakeHost([{ id: ID('habits:2026-09-17'), at: '2026-09-17T18:30:00.000Z' }]);
    await syncReminders(host, [reminder('habits:2026-09-17', '2026-09-17T19:00:00.000Z')], text);
    expect(calls.cancelled).toEqual([ID('habits:2026-09-17')]);
    expect(calls.scheduled).toEqual([ID('habits:2026-09-17')]);
  });

  it('ne touche jamais à une notification qui n est pas la nôtre', async () => {
    const autre = { id: 'autre-app:42', at: '2026-09-17T18:30:00.000Z' };
    const { host, calls, state } = fakeHost([autre]);
    await syncReminders(host, [], text);
    expect(calls.cancelled).toEqual([]);
    expect(state.has('autre-app:42')).toBe(true);
  });

  it('un échec de programmation n empêche pas les suivantes', async () => {
    const { host, calls } = fakeHost([], [ID('habits:2026-09-17')]);
    const out = await syncReminders(
      host,
      [reminder('habits:2026-09-17', '2026-09-17T18:30:00.000Z'), reminder('habits:2026-09-18', '2026-09-18T18:30:00.000Z')],
      text,
    );
    expect(calls.scheduled).toEqual([ID('habits:2026-09-18')]);
    expect(out).toMatchObject({ scheduled: 1, failed: 1 });
  });
});
