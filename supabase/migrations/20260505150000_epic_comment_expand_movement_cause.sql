-- Allow granular PM note classifications (still one TEXT column for compatibility).

ALTER TABLE public.epic_comment
  DROP CONSTRAINT IF EXISTS epic_comment_movement_cause_check;

ALTER TABLE public.epic_comment
  ADD CONSTRAINT epic_comment_movement_cause_check
  CHECK (
    movement_cause IS NULL
    OR movement_cause IN (
      'Internal',
      'External',
      'Internal, Engineering',
      'Internal, Design',
      'Internal, Product',
      'Internal, GTM',
      'External, Third-party'
    )
  );

COMMENT ON COLUMN public.epic_comment.movement_cause IS
  'PM note driver: legacy Internal|External, or Internal/External with subtype (Engineering, Design, Product, GTM, Third-party). Required for new notes via AddEpicNoteForm.';
