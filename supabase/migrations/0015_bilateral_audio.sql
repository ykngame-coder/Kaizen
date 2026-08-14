-- Bilateral ambient audio: same pattern as meditation-audio (0014) — app-
-- provided content, public-read bucket, no user upload policy. Played as a
-- looping background track during the visual bilateral stimulation exercise
-- (BilateralScreen), independent from the meditation-audio bucket since it's
-- a different content type (short looping ambience vs. narrated sessions).

insert into storage.buckets (id, name, public)
values ('bilateral-audio', 'bilateral-audio', true)
on conflict (id) do nothing;

create policy "bilateral audio is publicly readable"
  on storage.objects for select
  using (bucket_id = 'bilateral-audio');
