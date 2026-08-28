-- Retire the pre-workback launch checklist, and the two duplicate asset rows.
--
-- A row-by-row pass over all 145 criteria (74 release + 60 launch + 11 assets)
-- found the Launch checklist carrying the wrong altitude of question. The Phase
-- 1-6 rows predate the workback model and ask per-FEATURE questions at
-- BUNDLE level: with four epics on one launch, "Deliver setup & configuration
-- guide" has no single answer. Most of them are also already answered somewhere:
--
--   22 rows are a section of an artifact or a row in the asset table
--      ("Draft product positioning statement" is a Message Brief section;
--       "Launch blog / feature spotlight" is the Blog Post asset)
--    9 rows are per-feature questions the Epic matrix already asks
--      ("Deliver self-service docs & FAQs" = Support Tools & Documentation)
--    2 rows are fields pretending to be tasks
--      ("Determine launch tier" is launch.tier)
--
-- The 8 "Sign-off: X" rows are deliberately NOT retired here — they stay active
-- and become derived roll-ups of the Epic matrix (20260821000700).
--
-- Nothing is deleted. is_active = false keeps the history of shipped launches
-- readable; the read paths now filter on it (src/app/api/launches/[id]/route.ts),
-- which they did not before — the column was selected and never used.

-- 44 legacy launch criteria: everything outside Phase 00 / Phase 01 except the
-- sign-offs, which have their own fate.
UPDATE public.criterion
   SET is_active = false
 WHERE context = 'launch'
   AND phase NOT LIKE 'Phase 0%'
   AND label NOT LIKE 'Sign-off:%';

-- The four release criteria that genuinely belong to the Launch. They need no new
-- launch rows: "Website / product page live" and "Activate growth campaign"
-- already exist there, and Sales Collateral / Sales Materials are covered by the
-- "Sales Talk Track Update" asset. So these are deactivations only.
--
-- Each fails the placement test — "if this epic never gets a launch, does the
-- question still need an answer?" — where the other 70 release criteria pass it.
-- Note that "Launch Campaign (if applicable)" carries its own hedge in the label,
-- which is what a per-epic matrix looks like when the question is not per-epic.
UPDATE public.criterion
   SET is_active = false
 WHERE context = 'release'
   AND label IN (
     'Sales Collateral',
     'Website/Landing Pages',
     'Launch Campaign (if applicable)',
     'Sales Materials'
   );

-- The two asset rows that are the same documents as the Phase 01 artifacts.
-- "Launch Brief" is described in its own seed as "The Campaign Brief itself", and
-- the Field Enablement Guide asset carries text identical to the Enablement Brief
-- criterion. Since the Assets tab now lists the five artifacts above the
-- supporting assets, these two rendered twice on one screen.
UPDATE public.launch_asset_template
   SET is_active = false
 WHERE asset_key IN ('launch_brief', 'field_enablement_guide');

-- Deactivating a template does not touch rows already instantiated on a launch,
-- so close those out explicitly rather than leaving them permanently unticked.
UPDATE public.launch_asset a
   SET status = 'NOT_APPLICABLE',
       notes = COALESCE(NULLIF(a.notes, '') || ' | ', '')
               || 'Superseded 2026-08-21: tracked as a Phase 01 artifact instead.'
  FROM public.launch_asset_template t
 WHERE a.template_id = t.id
   AND t.asset_key IN ('launch_brief', 'field_enablement_guide')
   AND a.status <> 'NOT_APPLICABLE';
