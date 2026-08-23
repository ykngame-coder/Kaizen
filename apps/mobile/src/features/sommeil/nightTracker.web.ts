import type { MovementEpoch } from '@supotsu/engines';

/**
 * Web stub — accelerometer-based night tracking has no web equivalent, so
 * the phone-tracking sleep mode is hidden there (see `nightTrackingAvailable`
 * gating in SleepTrackingScreen).
 */
export function nightTrackingAvailable(): boolean {
  return false;
}

export function startNightTracking(_onEpoch: (epoch: MovementEpoch) => void, _epochSec = 60): () => void {
  return () => undefined;
}
