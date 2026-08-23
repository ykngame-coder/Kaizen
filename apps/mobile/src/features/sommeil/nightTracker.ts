import { Accelerometer } from 'expo-sensors';
import type { MovementEpoch } from '@supotsu/engines';

/**
 * On-device accelerometer sampling for the phone-tracking sleep mode
 * (native iOS/Android implementation — see `nightTracker.web.ts` for the
 * hidden web stub). Nothing here leaves the phone: raw samples never
 * persist past the epoch they're aggregated into.
 */
export function nightTrackingAvailable(): boolean {
  return true;
}

const RAW_SAMPLE_INTERVAL_MS = 1000;

/**
 * Samples the accelerometer (~1/s) and emits one aggregated `MovementEpoch`
 * every `epochSec` seconds — `motion` is the epoch's max deviation from 1g
 * (still phone ⇒ ~0, movement ⇒ higher), the same 0-1-ish scale
 * `analyzeSleep`'s thresholds assume. Only the current epoch's raw samples
 * are ever buffered, bounding memory over a full night; the caller keeps
 * the emitted epochs. Returns a stop function that flushes any partial
 * epoch before unsubscribing, so the last few seconds aren't lost.
 */
export function startNightTracking(onEpoch: (epoch: MovementEpoch) => void, epochSec = 60): () => void {
  let deviations: number[] = [];
  let windowStart = new Date();

  Accelerometer.setUpdateInterval(RAW_SAMPLE_INTERVAL_MS);
  const subscription = Accelerometer.addListener(({ x, y, z }) => {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    deviations.push(Math.abs(magnitude - 1));
  });

  const flush = (): void => {
    if (deviations.length > 0) {
      onEpoch({ t: windowStart.toISOString(), motion: Math.max(...deviations) });
    }
    deviations = [];
    windowStart = new Date();
  };
  const timer = setInterval(flush, epochSec * 1000);

  return () => {
    clearInterval(timer);
    subscription.remove();
    flush();
  };
}
