-- Community leaderboard: daily score snapshots (opt-in) + a general/category
-- ranking RPC, mirroring challenge_leaderboard's security-definer aggregation
-- pattern. See docs/superpowers/specs/2026-08-24-community-leaderboard-design.md.

create table public.daily_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  kaizen smallint,
  sport smallint,
  nutrition smallint,
  sleep smallint,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index daily_scores_date_idx on public.daily_scores (date);

alter table public.daily_scores enable row level security;

create policy "daily_scores are self-owned"
  on public.daily_scores for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.profiles
  add column display_name text,
  add column leaderboard_opt_in boolean not null default false;

create or replace function public.leaderboard(p_category text, p_days int)
returns table (user_id uuid, display_name text, avatar_url text, avg_score numeric, rank bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
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
    -- Inclusive on both ends: -(p_days - 1) makes "7 jours" cover exactly 7 calendar days.
    where ds.date >= current_date - (p_days - 1)
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
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default; this security-definer function has no
-- auth.uid() check of its own, so close it off to the anonymous role explicitly.
revoke execute on function public.leaderboard(text, int) from public;
grant execute on function public.leaderboard(text, int) to authenticated;
