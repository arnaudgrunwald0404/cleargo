-- Migration: Add file attachments for criterion status
-- This allows users to attach files to specific criterion rows

CREATE TABLE IF NOT EXISTS criterion_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_criterion_status_id uuid NOT NULL REFERENCES epic_criterion_status(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES app_user(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_file_size CHECK (file_size > 0 AND file_size <= 52428800) -- Max 50MB
);

CREATE INDEX IF NOT EXISTS idx_criterion_attachment_lcs ON criterion_attachment(launch_criterion_status_id);
CREATE INDEX IF NOT EXISTS idx_criterion_attachment_uploaded_by ON criterion_attachment(uploaded_by);

-- Enable RLS
ALTER TABLE criterion_attachment ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view all attachments" ON criterion_attachment;
CREATE POLICY "Users can view all attachments"
  ON criterion_attachment FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON criterion_attachment;
CREATE POLICY "Authenticated users can upload attachments"
  ON criterion_attachment FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own attachments" ON criterion_attachment;
CREATE POLICY "Users can delete their own attachments"
  ON criterion_attachment FOR DELETE
  USING (uploaded_by IN (
    SELECT id FROM app_user WHERE email = auth.jwt()->>'email'
  ));

COMMENT ON TABLE criterion_attachment IS 'File attachments for launch criterion status rows';
COMMENT ON COLUMN criterion_attachment.storage_path IS 'Path in Supabase storage bucket';







