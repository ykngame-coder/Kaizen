// SUPOTSU — Apple Santé via Raccourcis iOS (Supabase Edge Function, Deno).
//
// Free, no dev build: an iOS Shortcut reads Health samples (HRV, resting HR,
// sleep…) and POSTs them here on a schedule. The request carries a per-user
// "ingest token" (created by create_apple_health_token() and pasted into the
// Shortcut). We resolve the user by that token and upsert the metrics.
//
// Route: POST /functions/v1/apple-health/ingest
//   header  X-Supotsu-Token: <ingest token>   (or ?token=)
//   body    { "metrics": [ { "type": "hrv", "value": 61, "date": "2026-07-20T05:00:00Z" }, ... ] }
//
// Normalization mirrors packages/connectors/src/appleHealth.ts (tested spec).

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

const UNITS: Record<string, string> = {
  hrv: 'ms',
  resting_heart_rate: 'bpm',
  sleep_duration: 'h',
  stress: 'score',
  weight: 'kg',
  body_fat: '%',
  hydration: 'ml',
};

// deno-lint-ignore no-explicit-any
function normalize(entries: any[], userId: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const e of entries ?? []) {
    const unit = UNITS[e?.type];
    const value = typeof e?.value === 'number' ? e.value : Number(e?.value);
    const time = e?.date ? new Date(e.date) : null;
    if (!unit || !Number.isFinite(value) || !time || Number.isNaN(time.getTime())) continue;
    rows.push({
      user_id: userId,
      type: e.type,
      value: Number(value.toFixed(2)),
      unit,
      source: 'apple_health',
      reliability: 'high',
      measured_at: time.toISOString(),
    });
  }
  return rows;
}

async function handleIngest(req: Request, url: URL): Promise<Response> {
  const token = req.headers.get('x-supotsu-token') ?? url.searchParams.get('token');
  if (!token) return json({ error: 'missing token' }, 401);

  const db = admin();
  const { data: acc } = await db
    .from('connector_accounts')
    .select('user_id')
    .eq('provider', 'apple_health')
    .eq('ingest_token', token)
    .maybeSingle();
  if (!acc) return json({ error: 'invalid token' }, 401);

  let body: { metrics?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const rows = normalize((body.metrics as unknown[]) ?? [], acc.user_id);
  if (rows.length > 0) {
    // Idempotent via the (user, type, measured_at, source) unique index.
    const { error } = await db
      .from('health_metrics')
      .upsert(rows, { onConflict: 'user_id,type,measured_at,source', ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);
  }
  return json({ ok: true, ingested: rows.length });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/.*\/apple-health/, '') || '/';
  try {
    if (req.method === 'POST' && path === '/ingest') return await handleIngest(req, url);
    return json({ error: 'not found', path }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
