-- Ensure feedback.epic_id is nullable so "Feedback on the tool" and "Feedback on the process" work without an epic.
-- Idempotent: only drops NOT NULL if the column is currently NOT NULL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'epic_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.feedback ALTER COLUMN epic_id DROP NOT NULL;
  END IF;
END $$;
