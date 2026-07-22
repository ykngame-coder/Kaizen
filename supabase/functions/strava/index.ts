// SUPOTSU — Strava integration (Supabase Edge Function, Deno).
//
// Strava is the pragmatic bridge for Garmin *activities* (Garmin auto-syncs to
// Strava). OAuth 2.0 (simpler than Garmin's OAuth 1.0a) + a pull sync. The
// client secret and tokens stay server-side (Master Prompt P22/P38).
//
// Routes (under /functions/v1/strava):
//   GET  /connect     → returns the Strava authorize URL (needs the Supabase JWT)
//   GET  /callback    → exchanges the code for tokens, stores athlete + tokens
//   POST /sync        → refresh token if needed, pull recent activities, insert
//   POST /disconnect  → drop tokens
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform), STRAVA_CLIENT_ID,
// STRAVA_CLIENT_SECRET, STRAVA_CALLBACK_URL.
//
// Activity normalization mirrors packages/connectors/src/strava.ts (tested spec).

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

async function userFromJwt(jwt: string | undefined): Promise<string | null> {
  if (!jwt) return null;
  const { data } = await admin().auth.getUser(jwt);
  return data.user?.id ?? null;
}

// --- normalization (mirror of packages/connectors/src/strava.ts) ------------
const SPORT_MAP: Record<string, string> = {
  Run: 'running', TrailRun: 'running', VirtualRun: 'running',
  Ride: 'cycling', VirtualRide: 'cycling', MountainBikeRide: 'cycling', GravelRide: 'cycling', EBikeRide: 'cycling',
  Swim: 'swimming', Walk: 'walking', Hike: 'walking',
  WeightTraining: 'strength', Workout: 'cross_training', Crossfit: 'cross_training',
  Elliptical: 'cross_training', StairStepper: 'cross_training', HighIntensityIntervalTraining: 'cross_training',
  Yoga: 'yoga', Pilates: 'yoga',
};
// deno-lint-ignore no-explicit-any
function normalizeActivity(a: any, userId: string): Record<string, unknown> | null {
  const duration = a.moving_time ?? a.elapsed_time;
  if (!a.start_date || !duration || a.id === undefined) return null;
  return {
    user_id: userId,
    external_id: `strava-${a.id}`,
    type: SPORT_MAP[a.sport_type ?? a.type] ?? 'other',
    source: 'strava',
    started_at: new Date(a.start_date).toISOString(),
    duration_sec: Math.round(duration),
    distance_m: a.distance !== undefined ? Math.round(a.distance) : null,
    calories: a.calories ?? null,
    avg_heart_rate: a.average_heartrate !== undefined ? Math.round(a.average_heartrate) : null,
  };
}

// --- token handling ---------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function validAccessToken(db: any, userId: string): Promise<string> {
  const { data: acc } = await db
    .from('connector_accounts')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .maybeSingle();
  if (!acc?.access_token) throw new Error('Strava non connecté.');

  const expiresAt = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 120_000) return acc.access_token; // still valid (>2 min)

  // Refresh.
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env('STRAVA_CLIENT_ID'),
      client_secret: env('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: acc.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`Rafraîchissement Strava échoué (${res.status}).`);
  const t = await res.json();
  await db
    .from('connector_accounts')
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      token_expires_at: new Date(t.expires_at * 1000).toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'strava');
  return t.access_token;
}

// --- handlers ---------------------------------------------------------------
async function handleConnect(req: Request): Promise<Response> {
  const userId = await userFromJwt(req.headers.get('Authorization')?.replace('Bearer ', ''));
  if (!userId) return json({ error: 'invalid user' }, 401);
  const state = crypto.randomUUID();
  // Stash a pending row keyed by the state nonce (CSRF-safe user mapping).
  await admin()
    .from('connector_accounts')
    .upsert(
      { user_id: userId, provider: 'strava', status: 'pending', access_token: state },
      { onConflict: 'user_id,provider' },
    );
  const url =
    'https://www.strava.com/oauth/authorize' +
    `?client_id=${env('STRAVA_CLIENT_ID')}` +
    `&redirect_uri=${encodeURIComponent(env('STRAVA_CALLBACK_URL'))}` +
    '&response_type=code&approval_prompt=auto&scope=activity:read_all' +
    `&state=${state}`;
  return json({ authorizeUrl: url });
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return json({ error: 'missing code/state' }, 400);

  const db = admin();
  const { data: pending } = await db
    .from('connector_accounts')
    .select('user_id')
    .eq('provider', 'strava')
    .eq('access_token', state)
    .eq('status', 'pending')
    .maybeSingle();
  if (!pending) return json({ error: 'unknown state' }, 400);

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env('STRAVA_CLIENT_ID'),
      client_secret: env('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return json({ error: `token exchange ${res.status}` }, 502);
  const t = await res.json();

  await db
    .from('connector_accounts')
    .update({
      status: 'active',
      external_user_id: String(t.athlete?.id ?? ''),
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      token_expires_at: new Date(t.expires_at * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    })
    .eq('user_id', pending.user_id)
    .eq('provider', 'strava');

  return new Response('<html><body>Strava connecté. Reviens dans Supotsu et lance une synchro.</body></html>', {
    headers: { 'content-type': 'text/html' },
  });
}

async function handleSync(req: Request): Promise<Response> {
  const userId = await userFromJwt(req.headers.get('Authorization')?.replace('Bearer ', ''));
  if (!userId) return json({ error: 'invalid user' }, 401);
  const db = admin();
  const token = await validAccessToken(db, userId);

  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=50', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return json({ error: `strava activities ${res.status}` }, 502);
  const activities = await res.json();

  const rows = (Array.isArray(activities) ? activities : [])
    .map((a) => normalizeActivity(a, userId))
    .filter((r): r is Record<string, unknown> => r !== null);

  if (rows.length > 0) {
    // Idempotent via the (user_id, source, external_id) unique index.
    await db.from('activities').upsert(rows, {
      onConflict: 'user_id,source,external_id',
      ignoreDuplicates: true,
    });
  }
  return json({ ok: true, imported: rows.length });
}

async function handleDisconnect(req: Request): Promise<Response> {
  const userId = await userFromJwt(req.headers.get('Authorization')?.replace('Bearer ', ''));
  if (!userId) return json({ error: 'invalid user' }, 401);
  await admin().from('connector_accounts').delete().eq('user_id', userId).eq('provider', 'strava');
  return json({ ok: true });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/.*\/strava/, '') || '/';
  try {
    if (req.method === 'GET' && path === '/connect') return await handleConnect(req);
    if (req.method === 'GET' && path === '/callback') return await handleCallback(url);
    if (req.method === 'POST' && path === '/sync') return await handleSync(req);
    if (req.method === 'POST' && path === '/disconnect') return await handleDisconnect(req);
    return json({ error: 'not found', path }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
