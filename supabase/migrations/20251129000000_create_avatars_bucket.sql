-- Create a new storage bucket for avatars
-- Note: The 'public' column might not exist in all Supabase versions
-- Using INSERT with only id and name, then setting public via ALTER if needed
insert into storage.buckets (id, name)
values ('avatars', 'avatars')
on conflict (id) do nothing;

-- Set bucket as public if the column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'storage' 
        AND table_name = 'buckets' 
        AND column_name = 'public'
    ) THEN
        UPDATE storage.buckets SET public = true WHERE id = 'avatars';
    END IF;
END $$;

-- Allow public access to avatars (drop first if exists)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Allow authenticated users to upload avatar images (drop first if exists)
DROP POLICY IF EXISTS "Anyone can upload an avatar" ON storage.objects;
create policy "Anyone can upload an avatar"
  on storage.objects for insert
  with check ( bucket_id = 'avatars' and auth.role() = 'authenticated' );

-- Allow authenticated users to update their own avatar (drop first if exists)
DROP POLICY IF EXISTS "Anyone can update their own avatar" ON storage.objects;
create policy "Anyone can update their own avatar"
  on storage.objects for update
  using ( bucket_id = 'avatars' and auth.role() = 'authenticated' );
