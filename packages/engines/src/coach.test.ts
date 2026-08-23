import { describe, expect, it } from 'vitest';
import type { Activity } from '@supotsu/core';
import { askCoach, detectIntent } from './coach';

const ASOF = '2026-07-20T12:00:00.000Z';

function activity(daysAgo: number, intensity: Activity['intensity'] = 'moderate'): Activity {
  const started = new Date(new Date(ASOF).getTime() - daysAgo * 86_400_000).toISOString();
  return {
    id: `a-${daysAgo}`,
    userId: 'u1',
    type: 'running',
    source: 'manual',
    startedAt: started,
    durationSec: 3600,
    intensity,
    createdAt: started,
    updatedAt: started,
  };
}

describe('detectIntent', () => {
  it('classifies canonical questions (accent/case-insensitive)', () => {
    expect(detectIntent("Que dois-je faire aujourd'hui ?")).toBe('today');
    expect(detectIntent('Analyse ma semaine')).toBe('week');
    expect(detectIntent('Je suis fatigué')).toBe('fatigue');
    expect(detectIntent('Pourquoi je stagne ?')).toBe('plateau');
    expect(detectIntent('Prépare-moi une séance')).toBe('plan');
    expect(detectIntent('coucou')).toBe('help');
  });
});

describe('askCoach', () => {
  it('gives an explainable "today" answer from data', () => {
    const reply = askCoach("Que faire aujourd'hui ?", { activities: [], asOf: ASOF });
    expect(reply.intent).toBe('today');
    expect(reply.explanation?.observation.key).toBeTruthy();
    expect(reply.followUps.length).toBeGreaterThan(0);
  });

  it('summarizes the week with counts', () => {
    const reply = askCoach('analyse ma semaine', {
      activities: [activity(1), activity(2)],
      asOf: ASOF,
    });
    expect(reply.intent).toBe('week');
    expect(reply.text.key).toMatch(/^engines\.coach\.week\.summary\./);
    expect(reply.text.params).toMatchObject({ count: 2 });
  });

  it('advises recovery when fatigued', () => {
    const reply = askCoach('je suis fatigué', { activities: [activity(1, 'max')], asOf: ASOF });
    expect(reply.intent).toBe('fatigue');
    expect(reply.explanation?.action.key).toBe('engines.coach.fatigue.action');
  });
});
