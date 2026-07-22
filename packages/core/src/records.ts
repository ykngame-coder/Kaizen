import type { DataSource, ISODateString, OwnedEntity } from './common';

/** Broad family a personal record belongs to (Master Prompt P3 records/PRs). */
export type RecordCategory = 'run' | 'strength' | 'cycling' | 'steps' | 'other';

/**
 * A personal record / benchmark (1RM, best 5 km, farthest run…). Provenance-aware
 * like everything else; `value` + `unit` keep it comparable and explainable.
 */
export interface PersonalRecord extends OwnedEntity {
  label: string;
  category: RecordCategory;
  value: number;
  unit: string;
  source: DataSource;
  achievedAt: ISODateString;
  externalId?: string;
}
