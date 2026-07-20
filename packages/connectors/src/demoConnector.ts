import type { ISODateString } from '@supotsu/core';
import type { Connector, ImportResult, ImportedHealthMetric } from './types';

const DAY_MS = 86_400_000;
const at = (asOf: ISODateString, daysAgo: number, hour = 8): string =>
  new Date(new Date(asOf).getTime() - daysAgo * DAY_MS).toISOString().slice(0, 11) +
  String(hour).padStart(2, '0') +
  ':00:00.000Z';

/**
 * Demo connector: simulates a wearable so the full import pipeline can be
 * exercised without OAuth or a device. Generates a week of plausible health
 * metrics + a couple of activities (Master Prompt P22 — architecture-ready).
 */
export const demoConnector: Connector = {
  provider: 'demo',
  name: 'Appareil de démonstration',
  available: true,
  capabilities: ['activities', 'health'],
  async sync(asOf) {
    const health: ImportedHealthMetric[] = [];
    for (let d = 0; d < 7; d++) {
      const wobble = ((d * 7) % 5) - 2; // deterministic small variation
      health.push(
        {
          type: 'sleep_duration',
          value: 7.5 + wobble * 0.15,
          unit: 'h',
          source: 'garmin',
          reliability: 'high',
          measuredAt: at(asOf, d, 7),
        },
        {
          type: 'hrv',
          value: 62 + wobble * 2,
          unit: 'ms',
          source: 'garmin',
          reliability: 'high',
          measuredAt: at(asOf, d, 7),
        },
        {
          type: 'resting_heart_rate',
          value: 51 - wobble,
          unit: 'bpm',
          source: 'garmin',
          reliability: 'high',
          measuredAt: at(asOf, d, 7),
        },
      );
    }

    const result: ImportResult = {
      healthMetrics: health,
      activities: [
        {
          externalId: 'demo-run-2',
          type: 'running',
          source: 'garmin',
          startedAt: at(asOf, 2, 18),
          durationSec: 35 * 60,
          distanceM: 6500,
          calories: 420,
          intensity: 'moderate',
          avgHeartRate: 152,
        },
        {
          externalId: 'demo-strength-4',
          type: 'strength',
          source: 'garmin',
          startedAt: at(asOf, 4, 12),
          durationSec: 50 * 60,
          calories: 300,
          intensity: 'high',
        },
      ],
    };
    return result;
  },
};
