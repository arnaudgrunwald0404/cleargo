-- Allow NOT_APPLICABLE on a launch checklist row.
--
-- WHY: the Beta proof gate is "if applicable" (Kristin's 00 Launch Gate
-- Checklist, Gate 3 — it only applies to capabilities that run a design-partner
-- beta). Today that is harmless because the row is gate=false with no date and
-- nothing depending on it, so it is inert. The moment it becomes a real gate
-- with dependents, every capability WITHOUT a beta would carry a permanently
-- unclearable gate sitting in front of product enablement.
--
-- launch_asset already has this fourth state (20260819010000); the checklist
-- never got it. Same four values, so the two tables now agree.
--
-- The original CHECK in 20260314000001 was declared inline and unnamed, so
-- Postgres auto-named it. Resolve the name from the catalog rather than assuming
-- it, because a table repaired by hand may carry a different one.

DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'launch_criterion_status'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%NOT_STARTED%'
   LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.launch_criterion_status DROP CONSTRAINT %I',
      v_name
    );
  END IF;
END $$;

ALTER TABLE public.launch_criterion_status
  ADD CONSTRAINT launch_criterion_status_status_check
  CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE'));
