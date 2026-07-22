import { Linking } from 'react-native';
import { getSupabase } from '@/lib/supabase';

/**
 * Client side of the real Garmin connector. All the sensitive work (OAuth 1.0a,
 * the consumer secret, token storage, ingestion) lives in the Garmin Edge
 * Function; the app only starts the flow and reads connection status. Real
 * Garmin requires a configured Supabase backend + deployed function.
 */

export type GarminStatus = 'connected' | 'pending' | 'revoked' | 'disconnected';

const functionsBase = (): string | null => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return url ? `${url}/functions/v1/garmin` : null;
};

/** True when the real Garmin integration can run (Supabase configured). */
export function garminAvailable(): boolean {
  return getSupabase() !== null && functionsBase() !== null;
}

async function accessToken(): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error('Backend Supabase non configuré.');
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session absente — reconnecte-toi.');
  return token;
}

/** Start the Garmin OAuth flow: fetch the authorize URL and open it. */
export async function startGarminConnect(): Promise<void> {
  const base = functionsBase();
  if (!base) throw new Error('Backend Supabase non configuré.');
  const res = await fetch(`${base}/connect`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Connexion Garmin impossible (${res.status}).`);
  const { authorizeUrl } = (await res.json()) as { authorizeUrl?: string };
  if (!authorizeUrl) throw new Error('URL d’autorisation Garmin manquante.');
  await Linking.openURL(authorizeUrl);
}

/** Disconnect Garmin: deregister with Garmin and drop stored tokens. */
export async function disconnectGarmin(): Promise<void> {
  const base = functionsBase();
  if (!base) throw new Error('Backend Supabase non configuré.');
  const res = await fetch(`${base}/disconnect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Déconnexion impossible (${res.status}).`);
}

/** Current Garmin connection status via the my_connectors() function. */
export async function fetchGarminStatus(): Promise<GarminStatus> {
  const client = getSupabase();
  if (!client) return 'disconnected';
  const { data, error } = await client.rpc('my_connectors');
  if (error) return 'disconnected';
  const garmin = (data ?? []).find((c) => c.provider === 'garmin');
  if (!garmin) return 'disconnected';
  if (garmin.status === 'active') return 'connected';
  if (garmin.status === 'pending') return 'pending';
  return 'revoked';
}
