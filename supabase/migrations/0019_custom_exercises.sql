-- ---------------------------------------------------------------------------
-- Let a user add a custom exercise the shared library doesn't cover (e.g.
-- home-gym equipment, a personal variant). exercises was previously "shared
-- library, readable by any authenticated user, not writable" — this adds a
-- narrow exception: a user may insert rows they own (created_by = auth.uid())
-- and only they (not other users) see their own custom rows on top of the
-- built-in catalogue (created_by is null).
-- ---------------------------------------------------------------------------
alter table public.exercises
  add column created_by uuid references auth.users (id) on delete cascade;

create index exercises_created_by_idx on public.exercises (created_by);

drop policy "exercises are readable by authenticated users" on public.exercises;

create policy "exercises: built-ins and own custom ones are readable"
  on public.exercises for select
  to authenticated
  using (created_by is null or created_by = auth.uid());

create policy "custom exercises are insertable by their owner"
  on public.exercises for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "custom exercises are deletable by their owner"
  on public.exercises for delete
  to authenticated
  using (created_by = auth.uid());
