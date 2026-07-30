// SUPOTSU — Apple Santé via Raccourcis iOS (Supabase Edge Function, Deno).
//
// Free, no dev build: an iOS Shortcut reads Health samples (HRV, resting HR,
// sleep…) and POSTs them here on a schedule. The request carries a per-user
// "ingest token" (created by create_apple_health_token() and pasted into the
// Shortcut). We resolve the user by that token and upsert the metrics.
//
// Route: POST /functions/v1/apple-health/ingest
//   header  X-Supotsu-Token: <ingest token>   (or ?token=)
//   body, either:
//     · Shortcut format : { "metrics": [ { "type": "hrv", "value": 61, "date": "…ISO…" }, … ] }
//     · Health Auto Export: { "data": { "metrics": [ { "name": "resting_heart_rate",
//                            "data": [ { "date": "2026-07-26 00:00:00 +0200", "qty": 56 } ] }, … ] } }
//
// Normalization mirrors packages/connectors/src/{appleHealth,healthAutoExport}.ts (tested spec).

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
  sleep_efficiency: 'score',
  stress: 'score',
  weight: 'kg',
  body_fat: '%',
  muscle_mass: 'kg',
  hydration: 'ml',
};

// Health Auto Export metric name → Supotsu type (mirrors healthAutoExport.ts).
const HAE_MAP: Record<string, string> = {
  heart_rate_variability: 'hrv',
  resting_heart_rate: 'resting_heart_rate',
  weight_body_mass: 'weight',
  body_fat_percentage: 'body_fat',
  lean_body_mass: 'muscle_mass',
  dietary_water: 'hydration',
};

/** "2026-07-26 00:00:00 +0200" (or ISO) → UTC ISO, else null. */
function haeDate(ts: unknown): string | null {
  if (typeof ts !== 'string') return null;
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}):?(\d{2})?$/);
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7]}:${m[8] ?? '00'}` : ts;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Flatten Health Auto Export's { data: { metrics } } to simple entries. */
// deno-lint-ignore no-explicit-any
function fromHealthAutoExport(data: any): { type: string; value: number; date: string }[] {
  const out: { type: string; value: number; date: string }[] = [];
  for (const metric of Array.isArray(data?.metrics) ? data.metrics : []) {
    const points = Array.isArray(metric?.data) ? metric.data : [];
    if (metric?.name === 'sleep_analysis') {
      for (const p of points) {
        // Convention (mirrors healthAutoExport.ts): measured_at of sleep_duration
        // is the BEDTIME (sleepStart), so circadian/regularity read correct times.
        const date = haeDate(p?.sleepStart ?? p?.inBedStart ?? p?.date);
        const total = Number(p?.totalSleep);
        const inBed = Number(p?.inBed);
        if (!date || !Number.isFinite(total) || total <= 0) continue;
        out.push({ type: 'sleep_duration', value: total, date });
        if (Number.isFinite(inBed) && inBed > 0) {
          out.push({ type: 'sleep_efficiency', value: Math.min(100, (total / inBed) * 100), date });
        }
      }
      continue;
    }
    const type = HAE_MAP[metric?.name];
    if (!type) continue;
    for (const p of points) {
      const value = Number(p?.qty);
      const date = haeDate(p?.date);
      if (Number.isFinite(value) && date) out.push({ type, value, date });
    }
  }
  return out;
}

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

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  // Accept either the Shortcut format or Health Auto Export ({ data: { metrics } }).
  const entries = body?.data && Array.isArray(body.data.metrics)
    ? fromHealthAutoExport(body.data)
    : ((body?.metrics as unknown[]) ?? []);
  const rows = normalize(entries, acc.user_id);
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
