-- Make feedback usable for product-wide feedback (not tied to a specific epic)
-- Existing epic-specific feedback continues to work as-is.

ALTER TABLE public.feedback
  ALTER COLUMN epic_id DROP NOT NULL;

