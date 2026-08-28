-- Kristin renamed "Campaign Brief" to "Marketing Brief" (2026-08-26).
--
-- The criterion label is not decoration: it is the join key. Criterion rows have
-- no stable key column, so every lookup -- in migrations 20260819000000,
-- 20260820000000, 20260821000500, 20260821001200, and now the artifact registry
-- -- matches on the label text. Renaming it in code without renaming it here
-- would silently unlink the document from its readiness row.
--
-- Earlier migrations are deliberately left alone. They are applied history and
-- ran correctly against the label as it was; rewriting them would make the
-- record of what happened untrue.
--
-- Idempotent: safe to re-run, and a no-op where the rename already landed.

-- 1. The runway criterion. Scoped to context = 'launch' so an identically
--    labelled release criterion, if one ever exists, is untouched.
UPDATE public.criterion
   SET label = 'Marketing Brief delivered'
 WHERE context = 'launch'
   AND label = 'Campaign Brief delivered';

-- 2. Descriptions that name the artifact. These are read by PMMs in the admin
--    UI, so leaving the old name would make the rename look half-done.
UPDATE public.criterion
   SET description = REPLACE(description, 'Campaign Brief', 'Marketing Brief')
 WHERE context = 'launch'
   AND description LIKE '%Campaign Brief%';

-- 3. The supporting-asset template that points at the brief itself. Its label
--    and description both carry the old name.
UPDATE public.launch_asset_template
   SET label = REPLACE(label, 'Campaign Brief', 'Marketing Brief'),
       description = REPLACE(description, 'Campaign Brief', 'Marketing Brief')
 WHERE label LIKE '%Campaign Brief%'
    OR description LIKE '%Campaign Brief%';

-- 4. Instances already created from those templates. Labels are COPIED at
--    instantiation rather than joined (so a template rename never rewrites a
--    shipped launch), which is right in general and exactly wrong here: this is
--    a correction of the name itself, not a template revision, so live launches
--    should show it too.
UPDATE public.launch_asset
   SET label = REPLACE(label, 'Campaign Brief', 'Marketing Brief')
 WHERE label LIKE '%Campaign Brief%';

UPDATE public.launch_criterion_status
   SET label = REPLACE(label, 'Campaign Brief', 'Marketing Brief')
 WHERE label LIKE '%Campaign Brief%';

-- 5. Any artifact rows created before the rename. The CHECK constraint on
--    artifact_type is updated first so the value is legal, then the rows move.
--    Guarded on the table existing, since 20260825000000 may not be applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'launch_artifact'
  ) THEN
    ALTER TABLE public.launch_artifact
      DROP CONSTRAINT IF EXISTS launch_artifact_artifact_type_check;

    ALTER TABLE public.launch_artifact
      ADD CONSTRAINT launch_artifact_artifact_type_check
      CHECK (artifact_type IN (
        'gate_checklist',
        'story_brief',
        'messaging_brief',
        'enablement_guide',
        'marketing_brief'
      ));

    UPDATE public.launch_artifact
       SET artifact_type = 'marketing_brief'
     WHERE artifact_type = 'campaign_brief';
  END IF;
END $$;
