/**
 * `e instanceof Error ? e.message : fallback` misses non-Error rejections —
 * Supabase's PostgrestError, HealthKit native module errors, etc. are plain
 * objects with a `.message`, not real Error instances — so that pattern was
 * silently swallowing the actual cause behind generic strings in a few
 * places (traced concretely once, for the native OAuth callback failure).
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string' && e.message) {
    return e.message;
  }
  return fallback;
}
