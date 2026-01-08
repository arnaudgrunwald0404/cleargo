-- Create storage bucket for criterion attachments
-- This bucket stores file attachments for launch criterion status rows

-- Create the bucket
insert into storage.buckets (id, name)
values ('criterion-attachments', 'criterion-attachments')
on conflict (id) do nothing;

-- Set bucket as private (not public)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'storage' 
        AND table_name = 'buckets' 
        AND column_name = 'public'
    ) THEN
        UPDATE storage.buckets SET public = false WHERE id = 'criterion-attachments';
    END IF;
END $$;

-- Allow authenticated users to view attachments
create policy "Authenticated users can view criterion attachments"
  on storage.objects for select
  using ( bucket_id = 'criterion-attachments' and auth.role() = 'authenticated' );

-- Allow authenticated users to upload attachments
create policy "Authenticated users can upload criterion attachments"
  on storage.objects for insert
  with check ( bucket_id = 'criterion-attachments' and auth.role() = 'authenticated' );

-- Allow authenticated users to delete attachments (they can delete their own via the API)
create policy "Authenticated users can delete criterion attachments"
  on storage.objects for delete
  using ( bucket_id = 'criterion-attachments' and auth.role() = 'authenticated' );
