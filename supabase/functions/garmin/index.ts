// SUPOTSU — Garmin Health API integration (Supabase Edge Function, Deno).
//
// Why server-side: Garmin uses OAuth 1.0a and a *push* model. The consumer
// secret must never reach the mobile app, and Garmin POSTs new data to a
// webhook — so connection, token storage and ingestion all live here, behind
// the service_role key (Master Prompt hybrid backend, P22/P38).
//
// Routes (all under /functions/v1/garmin):
//   GET  /connect      → start OAuth, returns the Garmin authorize URL (needs the
//                        caller's Supabase JWT so we know which user connects)
//   GET  /callback     → OAuth verifier exchange, stores tokens + Garmin userId
//   POST /push         → Garmin push webhook: normalize + insert data
//   POST /deregister   → Garmin deregistration ping: mark the account revoked
//   POST /disconnect   → user-initiated: deregister with Garmin + drop tokens
//
// Required secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by the platform),
//   GARMIN_CONSUMER_KEY, GARMIN_CONSUMER_SECRET, GARMIN_CALLBACK_URL.
//
// The normalization below mirrors packages/connectors/src/garmin.ts — keep in
// sync (that module is unit-tested and is the canonical spec).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const GARMIN = {
  requestToken: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
  authorize: 'https://connect.garmin.com/oauthConfirm',
  accessToken: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
  userId: 'https://apis.garmin.com/wellness-api/rest/user/id',
  registration: 'https://apis.garmin.com/wellness-api/rest/user/registration',
};

const env = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const admin = () =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

// --- OAuth 1.0a (HMAC-SHA1) -------------------------------------------------
const enc = (s: string): string =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

async function hmacSha1(key: string, msg: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function oauthHeader(
  method: string,
  url: string,
  extraOauth: Record<string, string>,
  tokenSecret = '',
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: env('GARMIN_CONSUMER_KEY'),
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    ...extraOauth,
  };
  const params = Object.keys(oauth)
    .sort()
    .map((k) => `${enc(k)}=${enc(oauth[k])}`)
    .join('&');
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(params)}`;
  const signingKey = `${enc(env('GARMIN_CONSUMER_SECRET'))}&${enc(tokenSecret)}`;
  oauth.oauth_signature = await hmacSha1(signingKey, base);
  const header = Object.keys(oauth)
    .map((k) => `${enc(k)}="${enc(oauth[k])}"`)
    .join(', ');
  return `OAuth ${header}`;
}

async function signedGet(url: string, oauthParams: Record<string, string>, tokenSecret = ''): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: await oauthHeader('POST', url, oauthParams, tokenSecret) },
  });
  if (!res.ok) throw new Error(`Garmin ${url} → ${res.status}: ${await res.text()}`);
  return res.text();
}

const parseForm = (s: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(s).entries());

// --- Normalization (mirror of packages/connectors/src/garmin.ts) ------------
const iso = (sec: number): string => new Date(sec * 1000).toISOString();
const ACTIVITY_MAP: Record<string, string> = {
  RUNNING: 'running', INDOOR_RUNNING: 'running', TRAIL_RUNNING: 'running', TREADMILL_RUNNING: 'running',
  WALKING: 'walking', INDOOR_WALKING: 'walking', HIKING: 'walking',
  CYCLING: 'cycling', INDOOR_CYCLING: 'cycling', MOUNTAIN_BIKING: 'cycling', ROAD_BIKING: 'cycling', VIRTUAL_RIDE: 'cycling',
  LAP_SWIMMING: 'swimming', OPEN_WATER_SWIMMING: 'swimming', SWIMMING: 'swimming',
  STRENGTH_TRAINING: 'strength',
  INDOOR_CARDIO: 'cross_training', HIIT: 'cross_training', FITNESS_EQUIPMENT: 'cross_training', MULTI_SPORT: 'cross_training',
  YOGA: 'yoga', PILATES: 'yoga', BREATHWORK: 'mobility', MOBILITY: 'mobility',
};
const mapType = (t?: string): string => (t && ACTIVITY_MAP[t.toUpperCase()]) || 'other';

// deno-lint-ignore no-explicit-any
function normalizePush(body: any): { activities: any[]; healthMetrics: any[] } {
  const activities: any[] = [];
  const healthMetrics: any[] = [];
  for (const a of body.activities ?? []) {
    if (a.startTimeInSeconds === undefined || !a.durationInSeconds) continue;
    activities.push({
      externalId: a.summaryId ?? (a.activityId !== undefined ? String(a.activityId) : undefined),
      type: mapType(a.activityType),
      source: 'garmin',
      startedAt: iso(a.startTimeInSeconds),
      durationSec: Math.round(a.durationInSeconds),
      distanceM: a.distanceInMeters !== undefined ? Math.round(a.distanceInMeters) : undefined,
      calories: a.activeKilocalories,
      avgHeartRate: a.averageHeartRateInBeatsPerMinute,
    });
  }
  const push = (m: any) => healthMetrics.push({ source: 'garmin', reliability: 'high', ...m });
  for (const d of body.dailies ?? []) {
    if (d.startTimeInSeconds === undefined) continue;
    if (typeof d.restingHeartRateInBeatsPerMinute === 'number')
      push({ type: 'resting_heart_rate', value: d.restingHeartRateInBeatsPerMinute, unit: 'bpm', measuredAt: iso(d.startTimeInSeconds) });
    if (typeof d.averageStressLevel === 'number' && d.averageStressLevel >= 0)
      push({ type: 'stress', value: d.averageStressLevel, unit: 'score', measuredAt: iso(d.startTimeInSeconds) });
  }
  for (const s of body.sleeps ?? []) {
    if (s.startTimeInSeconds === undefined || !s.durationInSeconds) continue;
    push({ type: 'sleep_duration', value: Number((s.durationInSeconds / 3600).toFixed(2)), unit: 'h', measuredAt: iso(s.startTimeInSeconds) });
    if (typeof s.overallSleepScore?.value === 'number')
      push({ type: 'sleep_efficiency', value: s.overallSleepScore.value, unit: 'score', measuredAt: iso(s.startTimeInSeconds) });
  }
  for (const h of body.hrv ?? []) {
    if (h.startTimeInSeconds !== undefined && typeof h.lastNightAvg === 'number')
      push({ type: 'hrv', value: h.lastNightAvg, unit: 'ms', measuredAt: iso(h.startTimeInSeconds) });
  }
  for (const b of body.bodyComps ?? []) {
    if (b.startTimeInSeconds === undefined) continue;
    if (typeof b.weightInGrams === 'number')
      push({ type: 'weight', value: Number((b.weightInGrams / 1000).toFixed(2)), unit: 'kg', measuredAt: iso(b.startTimeInSeconds) });
    if (typeof b.bodyFatInPercent === 'number')
      push({ type: 'body_fat', value: b.bodyFatInPercent, unit: '%', measuredAt: iso(b.startTimeInSeconds) });
  }
  return { activities, healthMetrics };
}

// --- Handlers ---------------------------------------------------------------
async function handleConnect(req: Request): Promise<Response> {
  // Identify the caller from their Supabase JWT.
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'missing token' }, 401);
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData } = await client.auth.getUser(jwt);
  const userId = userData.user?.id;
  if (!userId) return json({ error: 'invalid user' }, 401);

  // 1) request token
  const cb = `${env('GARMIN_CALLBACK_URL')}?u=${userId}`;
  const reqTokenRes = await signedGet(GARMIN.requestToken, { oauth_callback: cb });
  const { oauth_token, oauth_token_secret } = parseForm(reqTokenRes);

  // Stash the request token + secret as a pending connection for this user.
  await admin()
    .from('connector_accounts')
    .upsert(
      {
        user_id: userId,
        provider: 'garmin',
        status: 'pending', // becomes 'active' once the callback exchange succeeds
        access_token: oauth_token,
        access_token_secret: oauth_token_secret,
      },
      { onConflict: 'user_id,provider' },
    );

  return json({ authorizeUrl: `${GARMIN.authorize}?oauth_token=${oauth_token}` });
}

async function handleCallback(url: URL): Promise<Response> {
  const oauthToken = url.searchParams.get('oauth_token');
  const verifier = url.searchParams.get('oauth_verifier');
  if (!oauthToken || !verifier) return json({ error: 'missing oauth params' }, 400);

  // Find the pending connection by its request token.
  const db = admin();
  const { data: pending } = await db
    .from('connector_accounts')
    .select('user_id, access_token_secret')
    .eq('provider', 'garmin')
    .eq('access_token', oauthToken)
    .maybeSingle();
  if (!pending) return json({ error: 'unknown request token' }, 400);

  // 2) exchange for the access token
  const accessRes = await signedGet(
    GARMIN.accessToken,
    { oauth_token: oauthToken, oauth_verifier: verifier },
    pending.access_token_secret,
  );
  const access = parseForm(accessRes);

  // 3) fetch the Garmin user id (for routing webhooks back to this user)
  const idRes = await fetch(GARMIN.userId, {
    headers: {
      Authorization: await oauthHeader('GET', GARMIN.userId, { oauth_token: access.oauth_token }, access.oauth_token_secret),
    },
  });
  const { userId: garminUserId } = await idRes.json();

  await db
    .from('connector_accounts')
    .update({
      status: 'active',
      external_user_id: garminUserId,
      access_token: access.oauth_token,
      access_token_secret: access.oauth_token_secret,
      connected_at: new Date().toISOString(),
    })
    .eq('user_id', pending.user_id)
    .eq('provider', 'garmin');

  return new Response('<html><body>Garmin connecté. Tu peux revenir dans Supotsu.</body></html>', {
    headers: { 'content-type': 'text/html' },
  });
}

// deno-lint-ignore no-explicit-any
async function handlePush(body: any): Promise<Response> {
  const db = admin();
  // Group Garmin userAccessToken/userId per record; each summary carries userId.
  const byGarminUser = new Map<string, any>();
  for (const key of ['activities', 'dailies', 'sleeps', 'hrv', 'bodyComps']) {
    for (const rec of body[key] ?? []) {
      const gid = rec.userId;
      if (!gid) continue;
      const bucket = byGarminUser.get(gid) ?? {};
      (bucket[key] ??= []).push(rec);
      byGarminUser.set(gid, bucket);
    }
  }

  for (const [garminUserId, bucket] of byGarminUser) {
    const { data: account } = await db
      .from('connector_accounts')
      .select('user_id')
      .eq('provider', 'garmin')
      .eq('external_user_id', garminUserId)
      .eq('status', 'active')
      .maybeSingle();
    if (!account) continue;

    const { activities, healthMetrics } = normalizePush(bucket);

    if (activities.length > 0) {
      await db.from('activities').insert(
        activities.map((a) => ({
          user_id: account.user_id,
          type: a.type,
          source: 'garmin',
          started_at: a.startedAt,
          duration_sec: a.durationSec,
          distance_m: a.distanceM ?? null,
          calories: a.calories ?? null,
          avg_heart_rate: a.avgHeartRate ?? null,
        })),
      );
    }
    if (healthMetrics.length > 0) {
      // Idempotent via the (user, type, measured_at, source) unique index.
      await db.from('health_metrics').upsert(
        healthMetrics.map((m) => ({
          user_id: account.user_id,
          type: m.type,
          value: m.value,
          unit: m.unit,
          source: 'garmin',
          reliability: m.reliability ?? null,
          measured_at: m.measuredAt,
        })),
        { onConflict: 'user_id,type,measured_at,source', ignoreDuplicates: true },
      );
    }
  }
  return json({ ok: true });
}

// deno-lint-ignore no-explicit-any
async function handleDeregister(body: any): Promise<Response> {
  const db = admin();
  for (const d of body.deregistrations ?? []) {
    if (!d.userId) continue;
    await db
      .from('connector_accounts')
      .update({ status: 'revoked' })
      .eq('provider', 'garmin')
      .eq('external_user_id', d.userId);
  }
  return json({ ok: true });
}

async function handleDisconnect(req: Request): Promise<Response> {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'missing token' }, 401);
  const db = admin();
  const { data: userData } = await db.auth.getUser(jwt);
  const userId = userData.user?.id;
  if (!userId) return json({ error: 'invalid user' }, 401);

  const { data: acc } = await db
    .from('connector_accounts')
    .select('access_token, access_token_secret')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .maybeSingle();

  // Best-effort deregistration with Garmin, then drop the tokens locally.
  if (acc?.access_token) {
    try {
      await fetch(GARMIN.registration, {
        method: 'DELETE',
        headers: {
          Authorization: await oauthHeader('DELETE', GARMIN.registration, { oauth_token: acc.access_token }, acc.access_token_secret ?? ''),
        },
      });
    } catch (_e) {
      // Ignore — we still remove local tokens below.
    }
  }
  await db.from('connector_accounts').delete().eq('user_id', userId).eq('provider', 'garmin');
  return json({ ok: true });
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/.*\/garmin/, '') || '/';
  try {
    if (req.method === 'GET' && path === '/connect') return await handleConnect(req);
    if (req.method === 'GET' && path === '/callback') return await handleCallback(url);
    if (req.method === 'POST' && path === '/push') return await handlePush(await req.json());
    if (req.method === 'POST' && path === '/deregister') return await handleDeregister(await req.json());
    if (req.method === 'POST' && path === '/disconnect') return await handleDisconnect(req);
    return json({ error: 'not found', path }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
