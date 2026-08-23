/**
 * Cross-cutting domain primitives.
 *
 * Encodes two non-negotiable Master Prompt rules:
 *  - every value knows its provenance: source + origin + timestamp + reliability
 *    (P1 principle 4, P8.1, P38.10);
 *  - recommendations always carry a confidence level (P18.10, P21.15, P35.11).
 */

export type ISODateString = string; // e.g. "2026-07-19T08:30:00.000Z"
export type UUID = string;

/** The seven product pillars (Master Prompt P1). */
export type Pillar =
  'sleep' | 'recovery' | 'performance' | 'nutrition' | 'habits' | 'understanding' | 'decision';

/** Where a datum physically came from. */
export type DataSource =
  | 'manual'
  | 'apple_health'
  | 'garmin'
  | 'strava'
  | 'renpho'
  | 'polar'
  | 'coros'
  | 'fitbit'
  | 'oura'
  | 'withings'
  | 'phone' // on-device accelerometer actigraphy (no wearable)
  | 'supotsu'; // produced by our own engines

/** How a datum was obtained — the P1 measured/calculated/estimated/proprietary distinction. */
export type DataOrigin = 'measured' | 'calculated' | 'estimated' | 'proprietary';

/** Confidence attached to any engine output or recommendation. */
export type Confidence = 'high' | 'medium' | 'to_confirm';

/** Reliability of a raw measurement (P38.10: chest strap = high, no sensor = reduced). */
export type Reliability = 'high' | 'medium' | 'low';

/** A single provenance-aware measurement. */
export interface Measurement<T = number> {
  value: T;
  unit?: string;
  source: DataSource;
  origin: DataOrigin;
  reliability?: Reliability;
  recordedAt: ISODateString;
}

/** Entities that belong to exactly one user (basis for row-level security). */
export interface OwnedEntity {
  id: UUID;
  userId: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export const isMeasured = (origin: DataOrigin): boolean => origin === 'measured';
