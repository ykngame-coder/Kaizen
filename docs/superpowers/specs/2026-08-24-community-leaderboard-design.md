# Classement communauté (général + par catégorie) — Design

Date: 2026-08-24
Status: Approved by user, ready for implementation.

## Problem

The user wants a small community leaderboard: a general ranking plus one
per category (sport, nutrition, sommeil). Today's "Communauté" screen
(`CommunityScreen.tsx`) only has challenges — no general/global ranking
concept exists anywhere. The app already computes several per-user scores
client-side (Score Kaizen, score Sport, score Nutrition, Score sommeil 2.0)
but none are ever written to the database, so nothing can be compared across
users yet. There is also no public-safe display identity today — only a
private email and an existing `avatar_url`.

## Decisions (from brainstorming)

- **Opt-in only**, one global toggle ("Participer au classement"). No
  friends/following graph exists in the app, and a public-by-default ranking
  of everyone's health data was rejected — opt-in keeps this privacy-safe
  without building a social graph.
- **Reuse the scores the app already computes and shows the user**, rather
  than invent a parallel points system: Score Kaizen for "Général", and the
  existing Sport/Nutrition/Sleep-2.0 scores for the three category rankings.
  Keeps the leaderboard consistent with what a user already sees on their
  own screens.
- **Three time windows**: 7 jours, 3 mois, 1 an — all as rolling averages
  ending today, switchable in the UI.
- **Daily snapshot table + on-read SQL aggregation (RPC)**, not a
  server-side recomputation of scores. A new `daily_scores` table holds one
  row per user per day (one column per score); a `leaderboard(category,
  days)` RPC averages over the requested window, mirroring the existing
  `challenge_leaderboard` RPC pattern (`supabase/migrations/0004_community_marketplace.sql`).
  Rejected alternative: recomputing scores server-side via a cron/Edge
  Function — would require duplicating the sleep/ACWR/etc. scoring logic
  from `packages/engines` in SQL, with a real risk of the leaderboard
  showing a different number than the user's own screen. The app has no
  cron/scheduled compute today; everything is client-computed on view.
- **Single opt-in toggle**, not per-category — simpler mental model, one
  settings switch controls all four rankings.
- **New editable `display_name` (pseudo)** on `profiles`, shown with the
  existing `avatar_url`. Auto-generated default (e.g. "Athlète 4821") so a
  user who opts in without typing a pseudo still shows something reasonable.
- **Lives inside the existing Communauté screen** as a new segment next to
  "Défis" — no new nav entry, no new tab.

## Data model

New migration, e.g. `00XX_daily_scores_leaderboard.sql`:

```sql
create table public.daily_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kaizen smallint,
  sport smallint,
  nutrition smallint,
  sleep smallint,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.daily_scores enable row level security;

create policy "daily_scores owner read/write"
  on public.daily_scores for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.profiles
  add column display_name text,
  add column leaderboard_opt_in boolean not null default false;
```

`daily_scores` stays owner-only under RLS — it is never queried directly by
the client for anyone else's data. Cross-user aggregation happens only
inside the `security definer` RPC below, which returns rank/pseudo/avatar/
score and nothing else.

## Write path

Each screen that already computes one of these scores upserts today's value
after computing it, gated on `leaderboard_opt_in` (skip the write entirely
if the user hasn't opted in — no point writing data that will never be
read):

| Screen | Score | Column |
|---|---|---|
| `DashboardScreen.tsx` (`buildDailySnapshot`) | Score Kaizen | `kaizen` |
| `SportScreen.tsx` (score carousel page) | Score Sport | `sport` |
| `NutritionScreen.tsx` | Score Nutrition | `nutrition` |
| `SommeilScreen.tsx` (Score 2.0) | Score sommeil | `sleep` |

A single `useRecordDailyScore(column, value)` hook does the upsert
(`on conflict (user_id, date) do update`), called from each of the four
screens with their respective column. Idempotent — safe to call on every
render/mount without deduping client-side.

Gaps are expected and accepted: if a user doesn't open a given screen on a
given day, that day has no row for that column — consistent with the app's
existing local-first, compute-on-view model (no background/server compute
exists today).

## Read path — `leaderboard` RPC

```sql
create or replace function public.leaderboard(p_category text, p_days int)
returns table(user_id uuid, display_name text, avatar_url text, avg_score numeric, rank bigint)
security definer
language sql
as $$
  select
    ds.user_id,
    coalesce(p.display_name, 'Athlète') as display_name,
    p.avatar_url,
    avg(
      case p_category
        when 'general' then ds.kaizen
        when 'sport' then ds.sport
        when 'nutrition' then ds.nutrition
        when 'sleep' then ds.sleep
      end
    ) as avg_score,
    rank() over (
      order by avg(
        case p_category
          when 'general' then ds.kaizen
          when 'sport' then ds.sport
          when 'nutrition' then ds.nutrition
          when 'sleep' then ds.sleep
        end
      ) desc
    ) as rank
  from public.daily_scores ds
  join public.profiles p on p.id = ds.user_id and p.leaderboard_opt_in
  where ds.date >= current_date - p_days
  group by ds.user_id, p.display_name, p.avatar_url
  having avg(
    case p_category
      when 'general' then ds.kaizen
      when 'sport' then ds.sport
      when 'nutrition' then ds.nutrition
      when 'sleep' then ds.sleep
    end
  ) is not null
  order by avg_score desc
  limit 100;
$$;
```

Period → `p_days` mapping done client-side: 7 jours → `7`, 3 mois → `90`, 1
an → `365`. `p_category` ∈ `general | sport | nutrition | sleep`.
`security definer` lets the function read across all opted-in users despite
`daily_scores`' owner-only RLS — same shape as the existing
`challenge_leaderboard` function.

A user not present in the returned top 100 (opted in but ranked lower, or
not opted in) is handled client-side: the leaderboard UI shows a "vous
n'êtes pas classé sur cette période" state rather than a second query for
MVP — no dedicated "my rank" RPC this pass (see Out of scope).

## UI

`CommunityScreen.tsx` gains a top-level `SegmentedControl`: **Défis /
Classement** (reuses the existing challenges UI unchanged under "Défis").

**Classement** tab:
- Category `SegmentedControl`: Général / Sport / Nutrition / Sommeil.
- Period control (small segmented row): 7j / 3 mois / 1 an.
- Ranked list: rank number, avatar (`avatar_url` or a placeholder), pseudo
  (`display_name`), score value — the current user's row is highlighted if
  present.
- If the user hasn't opted in: an inline card at the top of this tab with a
  short explanation and a `Switch` to opt in directly (writes
  `leaderboard_opt_in` immediately) — no forced trip to Settings.

## Settings (pseudo + opt-in)

`ProfileEditScreen.tsx` (already touched this session for i18n) gains:
- **Pseudo** — an `Input` bound to `display_name`.
- **Participer au classement** — a `Switch`/toggle bound to
  `leaderboard_opt_in`. Turning it on with an empty pseudo auto-fills a
  generated default (e.g. `Athlète ${last4OfUserId}`) so the leaderboard
  never shows a blank name; the user can still overwrite it.

This settings toggle and the inline one in the Classement tab write to the
same `leaderboard_opt_in` field — either entry point works.

## Testing

- Unit tests: `useRecordDailyScore`'s upsert-gated-on-opt-in logic (mocked
  repository); the period→`p_days` mapping helper; the category→column
  selection logic used to build the RPC call.
- No direct unit test for the SQL RPC itself (Postgres, not exercised by
  the mobile app's vitest suite) — verified manually against a seeded
  Supabase project as part of QA.
- Manual QA: confirm a non-opted-in user's scores never appear in any
  `leaderboard()` result; confirm a newly-opted-in user with no `daily_scores`
  rows yet shows the "not ranked" state instead of erroring; confirm
  visiting Dashboard/Sport/Nutrition/Sommeil after opting in produces
  upserted rows visible in the leaderboard on next read.

## Out of scope for this pass

- No dedicated "my rank" query when the user falls outside the top 100 —
  just a "non classé sur cette période" state.
- No per-category opt-in granularity (single global toggle only).
- No friends/following — audience is always "all opted-in users".
- No historical trend/graph of a user's own rank over time.
- No push notifications for rank changes.
- No admin/moderation tooling for pseudos (e.g. profanity filtering) — can
  follow up if it becomes a real problem post-launch.
