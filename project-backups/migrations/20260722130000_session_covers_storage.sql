-- Session cover images storage bucket

insert into storage.buckets (id, name, public)
values ('session-covers', 'session-covers', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Healers can upload session covers"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'session-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access
create policy "Session covers are publicly readable"
on storage.objects
for select to authenticated
using (bucket_id = 'session-covers');

-- Allow owners to update/delete their own covers
create policy "Healers can update own session covers"
on storage.objects
for update to authenticated
using (
  bucket_id = 'session-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Healers can delete own session covers"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'session-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);
