import { getSupabase } from '@/lib/supabase';

/**
 * Client side of the "Apple Santé via Raccourcis" connector. No native module,
 * no dev build: the app generates a per-user ingest token; an iOS Shortcut posts
 * Health samples to the ingest endpoint with that token. The app then just reads
 * the health metrics as usual.
 */

export function appleHealthAvailable(): boolean {
  return getSupabase() !== null && !!process.env.EXPO_PUBLIC_SUPABASE_URL;
}

/** The endpoint the Shortcut posts to. */
export function ingestUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return url ? `${url}/functions/v1/apple-health/ingest` : null;
}

/** Generate (or rotate) the ingest token for this user, via the DB function. */
export async function createIngestToken(): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error('Backend Supabase non configuré.');
  const { data, error } = await client.rpc('create_apple_health_token');
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Jeton non généré.');
  return data as string;
}
