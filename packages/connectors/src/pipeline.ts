import type { ISODateString } from '@supotsu/core';
import type { Connector, ImportedActivity, ImportedHealthMetric } from './types';
import { validateActivity, validateHealthMetric, type QualityIssue } from './quality';
import { dedupActivities, type ExistingActivityKey } from './dedup';

export interface ImportOutcome {
  activities: ImportedActivity[];
  healthMetrics: ImportedHealthMetric[];
  rejected: { kind: 'activity' | 'health'; issues: QualityIssue[] }[];
}

/**
 * The imposed connector flow (Master Prompt P2):
 *   Connector → Validation → Normalisation → Data Quality → (Database).
 * This function performs sync + validation + dedup and returns clean data the
 * caller persists. Anything failing quality checks is rejected, never stored.
 */
export async function importFromConnector(
  connector: Connector,
  existing: ExistingActivityKey[],
  asOf: ISODateString,
): Promise<ImportOutcome> {
  const raw = await connector.sync(asOf);
  const rejected: ImportOutcome['rejected'] = [];

  const validActivities: ImportedActivity[] = [];
  for (const a of raw.activities) {
    const issues = validateActivity(a);
    if (issues.length > 0) rejected.push({ kind: 'activity', issues });
    else validActivities.push(a);
  }

  const validHealth: ImportedHealthMetric[] = [];
  for (const m of raw.healthMetrics) {
    const issues = validateHealthMetric(m);
    if (issues.length > 0) rejected.push({ kind: 'health', issues });
    else validHealth.push(m);
  }

  return {
    activities: dedupActivities(existing, validActivities),
    healthMetrics: validHealth,
    rejected,
  };
}
