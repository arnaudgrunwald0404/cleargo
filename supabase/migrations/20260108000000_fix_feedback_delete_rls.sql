-- Fix feedback delete RLS policy
-- The issue: created_by_id stores app_user.id, but RLS policy checks auth.uid()
-- Solution: Update RLS policy to check if current user's app_user.id matches created_by_id
-- Use auth.jwt()->>'email' to get the current user's email and match it to app_user.id

-- Drop existing policies
DROP POLICY IF EXISTS "Allow update own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Allow delete own feedback" ON public.feedback;

-- Recreate update policy with correct check
-- Check if the current authenticated user's app_user.id matches created_by_id
-- Use LOWER() for case-insensitive email comparison
CREATE POLICY "Allow update own feedback" ON public.feedback
    FOR UPDATE TO authenticated 
    USING (
        created_by_id IN (
            SELECT id FROM app_user 
            WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
        )
    );

-- Recreate delete policy with correct check
CREATE POLICY "Allow delete own feedback" ON public.feedback
    FOR DELETE TO authenticated 
    USING (
        created_by_id IN (
            SELECT id FROM app_user 
            WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
        )
    );

