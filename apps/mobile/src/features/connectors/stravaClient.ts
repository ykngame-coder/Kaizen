import { Linking } from 'react-native';
import { getSupabase } from '@/lib/supabase';

/**
 * Client side of the Strava connector. OAuth 2.0 + a pull sync live in the Strava
 * Edge Function; the app starts the flow, triggers syncs, and reads status.
 * Requires a configured Supabase backend + deployed function.
 */

export type StravaStatus = 'connected' | 'pending' | 'disconnected';

const functionsBase = (): string | null => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return url ? `${url}/functions/v1/strava` : null;
};

export function stravaAvailable(): boolean {
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

/** Start the Strava OAuth flow (opens the authorize URL). */
export async function startStravaConnect(): Promise<void> {
  const base = functionsBase();
  if (!base) throw new Error('Backend Supabase non configuré.');
  const res = await fetch(`${base}/connect`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Connexion Strava impossible (${res.status}).`);
  const { authorizeUrl } = (await res.json()) as { authorizeUrl?: string };
  if (!authorizeUrl) throw new Error('URL d’autorisation Strava manquante.');
  await Linking.openURL(authorizeUrl);
}

/** Pull recent activities from Strava into the app. Returns how many imported. */
export async function syncStrava(): Promise<number> {
  const base = functionsBase();
  if (!base) throw new Error('Backend Supabase non configuré.');
  const res = await fetch(`${base}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Synchronisation impossible (${res.status}).`);
  const { imported } = (await res.json()) as { imported?: number };
  return imported ?? 0;
}

export async function disconnectStrava(): Promise<void> {
  const base = functionsBase();
  if (!base) throw new Error('Backend Supabase non configuré.');
  const res = await fetch(`${base}/disconnect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Déconnexion impossible (${res.status}).`);
}

export async function fetchStravaStatus(): Promise<StravaStatus> {
  const client = getSupabase();
  if (!client) return 'disconnected';
  const { data, error } = await client.rpc('my_connectors');
  if (error) return 'disconnected';
  const strava = (data ?? []).find((c) => c.provider === 'strava');
  if (!strava) return 'disconnected';
  return strava.status === 'active' ? 'connected' : strava.status === 'pending' ? 'pending' : 'disconnected';
}
