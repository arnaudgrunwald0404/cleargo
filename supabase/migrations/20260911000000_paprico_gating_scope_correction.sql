-- PaPriCo gating scope correction
--
-- The 2026-09-18 agenda generated 78 items across 48 epics, and the committee's
-- read was that the list had stopped being about packaging and pricing. Where
-- the 78 came from:
--
--   30  Commercialization                                     (30 epics)
--   18  Packaging & Pricing Approved, Documented
--   14  Revenue forecast reviewed by SVP Sales + Head RevOps
--    9  Revenue Forecast & Risk Analysis
--    7  Confirmed Pricing Communicated & Documented
--
-- Two of those are not decisions this committee takes:
--
-- 1. "Commercialization" sits in the Customer Success & Ongoing Adoption
--    category and is scoped to Tier 3, so it contributed 30 items -- 19 epics
--    were on the agenda for that criterion and nothing else. It is adoption
--    readiness, tracked by the launch owner. It was pulled in by the broad
--    `ILIKE 'Commercialization%'` match in the original gating seed
--    (20260824000000_create_paprico_tables.sql).
--
-- 2. "Revenue Forecast & Risk Analysis" and "Revenue forecast reviewed by SVP
--    Sales + Head RevOps" are the same review twice. Only 3 epics reached the
--    agenda through the forecast criteria alone, and they reached it through
--    both. The SVP review is the one with a named approver, so it stays.
--
-- Result: 78 items / 48 epics -> 39 items / 28 epics, of which 25 items are the
-- packaging and pricing gaps the committee actually owns.
--
-- NOT decided here: whether forecast review belongs on the packaging and
-- pricing agenda at all. That is a chair call (Arnaud Grunwald), and flipping
-- `enabled` for the surviving forecast criterion in Settings -> PaPriCo is all
-- it takes if the answer is no.
--
-- `enabled = false` rather than DELETE: the row keeps its tier scope, lookahead
-- and time box, so re-enabling from the settings screen restores the previous
-- configuration instead of falling back to defaults.

UPDATE public.paprico_gating_criterion g
   SET enabled = false,
       updated_at = now()
  FROM public.criterion c
 WHERE c.id = g.criterion_id
   AND g.enabled = true
   AND (
         c.label ILIKE 'Commercialization%'
      OR c.label ILIKE 'Revenue Forecast & Risk Analysis%'
      OR c.label ILIKE 'Revenue Forecast and Risk Analysis%'
   );

-- Items already materialized from the now-disabled criteria stay in the table
-- with their status and any decisions attached. Disabling a criterion stops new
-- items being generated; it does not retroactively close what the committee has
-- already been shown. Close the stragglers so the 18 Sept agenda reflects the
-- new scope, leaving anything already decided or blocked untouched.
UPDATE public.paprico_item i
   SET status = 'closed',
       auto_closed = true,
       system_notes = COALESCE(i.system_notes || E'\n', '')
                      || 'Auto-closed by 20260911000000_paprico_gating_scope_correction: '
                      || 'the gating criterion was removed from the PaPriCo scope.',
       updated_at = now()
  FROM public.criterion c
 WHERE c.id = i.criterion_id
   AND i.source = 'release'
   AND i.status IN ('proposed', 'on_agenda', 'deferred')
   AND (
         c.label ILIKE 'Commercialization%'
      OR c.label ILIKE 'Revenue Forecast & Risk Analysis%'
      OR c.label ILIKE 'Revenue Forecast and Risk Analysis%'
   );
