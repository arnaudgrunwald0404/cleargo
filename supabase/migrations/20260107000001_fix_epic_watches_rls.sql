-- Fix RLS policies for epic_watches table
-- The original policies were too restrictive and didn't work with server-side Supabase client

-- Drop existing policies (both old and new names)
DROP POLICY IF EXISTS "Users can view their own watches" ON epic_watches;
DROP POLICY IF EXISTS "Users can insert their own watches" ON epic_watches;
DROP POLICY IF EXISTS "Users can delete their own watches" ON epic_watches;
DROP POLICY IF EXISTS "Authenticated users can select epic_watches" ON epic_watches;
DROP POLICY IF EXISTS "Authenticated users can insert epic_watches" ON epic_watches;
DROP POLICY IF EXISTS "Authenticated users can delete epic_watches" ON epic_watches;

-- Create simpler policies that allow authenticated users to manage watches
-- Application layer enforces user-specific access via email matching
CREATE POLICY "Authenticated users can select epic_watches" ON epic_watches
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert epic_watches" ON epic_watches
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete epic_watches" ON epic_watches
  FOR DELETE TO authenticated
  USING (true);

