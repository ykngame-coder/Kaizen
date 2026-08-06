import { getSupabase } from '@/lib/supabase';

/**
 * Account deletion via the delete-account Edge Function — the client can't
 * delete its own auth user directly (that needs the service_role key), so
 * this is server-side. Cascades through every user-owned table (see the
 * Edge Function's own comment for the FK chain).
 */

const functionsBase = (): string | null => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return url ? `${url}/functions/v1/delete-account` : null;
};

async function accessToken(): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error('Backend Supabase non configuré.');
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session absente — reconnecte-toi.');
  return token;
}

/** Permanently delete the current account and all its data. Irreversible. */
export async function deleteAccount(): Promise<void> {
  const base = functionsBase();
  if (!base) throw new Error('Backend Supabase non configuré.');
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok) throw new Error(`Suppression impossible (${res.status}).`);
}
