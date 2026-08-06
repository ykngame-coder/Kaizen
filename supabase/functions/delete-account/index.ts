// SUPOTSU — Account deletion (Supabase Edge Function, Deno).
//
// Apple App Review Guideline 5.1.1(v): an app that supports account
// creation must let the user initiate deletion of their account from
// within the app. `auth.admin.deleteUser` requires the service_role key,
// which must never reach the client, so this has to be server-side.
//
// Deleting the auth.users row cascades through every user-owned table —
// all reference profiles(id) with `on delete cascade`, and profiles.id
// references auth.users(id) the same way (see supabase/migrations) — so a
// single admin call is enough, no per-table cleanup needed here.
//
// Required secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by the platform).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const env = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const admin = () =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function handleDelete(req: Request): Promise<Response> {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'missing token' }, 401);
  const db = admin();
  const { data: userData } = await db.auth.getUser(jwt);
  const userId = userData.user?.id;
  if (!userId) return json({ error: 'invalid user' }, 401);

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'POST') return await handleDelete(req);
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
