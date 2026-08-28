-- Gate checklist items as first-class records.
--
-- A gate in ClearGO is one row with one owner and one status. A gate in Kristin's
-- 00 Launch Gate Checklist is a set of checklist items, each naturally owned by a
-- different function, signed off as a whole by two or three co-signers.
--
-- "Beta proof gate passed" is the clearest case: one checkbox standing in for
-- five items owned by five different functions — PM (entry conditions), SE lead
-- (claims hold up live), UX/Research (adoption is real), PMM (the story lands),
-- and RevOps (net-new motion sequenced).
--
-- Modelled as its own table rather than as `parent_criterion_id` on `criterion`
-- so that readiness scoring, notifications, and gatesTotal keep seeing three gate
-- rows instead of twenty. The gate keeps a single status; it is now DERIVED from
-- its items (gateStatusFromItems in src/lib/launchCriteria.ts).
--
-- Mirrors the template/instance split already used twice in this schema —
-- criterion/launch_criterion_status and launch_asset_template/launch_asset — so a
-- later template rename never rewrites the history of a shipped launch.
--
-- NOTE ON GRANTS: 20260717000000 had to repair the launch tables, which were
-- created without role grants and returned 42501 on every request. Both tables
-- below are granted at creation so that cannot recur.

CREATE TABLE IF NOT EXISTS public.criterion_item (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id        UUID NOT NULL REFERENCES public.criterion(id) ON DELETE CASCADE,
  item_key            TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  description         TEXT,
  -- Accountable function, from DecisionOwnerRole in src/types/criteria.ts.
  owner_role          TEXT,
  default_owner_email TEXT,
  -- An item that may legitimately not apply to a given launch.
  optional            BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_criterion_item_criterion
  ON public.criterion_item (criterion_id, sort_order);

CREATE TABLE IF NOT EXISTS public.launch_criterion_item (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id       UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES public.criterion_item(id) ON DELETE CASCADE,
  -- Copied at instantiation, not joined, for the same reason launch_asset copies
  -- its label: renaming a template must not relabel shipped launches.
  label           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'NOT_STARTED'
                    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE')),
  owner_email     TEXT,
  notes           TEXT,
  -- The checklist's SOURCE OF TRUTH lines, same shape as launch_criterion_status.links.
  links           JSONB DEFAULT '[]'::jsonb,
  optional        BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  last_updated_by UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (launch_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_launch_criterion_item_launch
  ON public.launch_criterion_item (launch_id);
CREATE INDEX IF NOT EXISTS idx_launch_criterion_item_status
  ON public.launch_criterion_item (launch_id, status);

ALTER TABLE public.criterion_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_criterion_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ci_select_authenticated" ON public.criterion_item;
CREATE POLICY "ci_select_authenticated" ON public.criterion_item
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ci_write_authenticated" ON public.criterion_item;
CREATE POLICY "ci_write_authenticated" ON public.criterion_item
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lci_select_authenticated" ON public.launch_criterion_item;
CREATE POLICY "lci_select_authenticated" ON public.launch_criterion_item
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lci_write_authenticated" ON public.launch_criterion_item;
CREATE POLICY "lci_write_authenticated" ON public.launch_criterion_item
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.criterion_item       TO anon, authenticated, service_role;
GRANT ALL ON public.launch_criterion_item TO anon, authenticated, service_role;
