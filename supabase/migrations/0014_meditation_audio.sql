-- Meditation audio: app-provided content (not user-generated), so the
-- bucket is public-read like avatars, but nobody uploads through the app —
-- only the project owner, via the Supabase dashboard/CLI. No insert/update/
-- delete policy is granted to authenticated users on purpose.

insert into storage.buckets (id, name, public)
values ('meditation-audio', 'meditation-audio', true)
on conflict (id) do nothing;

create policy "meditation audio is publicly readable"
  on storage.objects for select
  using (bucket_id = 'meditation-audio');
