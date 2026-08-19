-- Supporting assets as first-class records, from Part 6 "Asset Checklist" of
-- Kristin Penney's Campaign Brief template.
--
-- Until now the only asset tracking on a launch was two URL columns (brief_url,
-- feg_url) plus a free-form links jsonb on each criterion status. Part 6 is an
-- explicit eleven-row checklist -- tick / asset / owner (R) / notes -- and the
-- Enablement Guide's own Collateral Index asks the same question a third way
-- ("Asset | Status | Where to Find It"), with the warning that "a broken link or
-- stale asset here erodes trust in the whole guide". That is a table, not a
-- column pair.
--
-- Mirrors the criterion / launch_criterion_status split already used for the
-- checklist: a template list that admins curate, instantiated per launch so a
-- later rename never rewrites the history of a shipped launch.
--
-- NOTE ON GRANTS: 20260717000000 had to repair the launch tables, which were
-- created without role grants and returned 42501 on every request. Both tables
-- below are granted at creation so that cannot recur.

CREATE TABLE IF NOT EXISTS public.launch_asset_template (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key           TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  description         TEXT,
  -- 'ALL' or a comma-separated tier list, matching criterion.tier_applicability
  -- so launchCriterionApplies() can be reused unchanged.
  tier_applicability  TEXT NOT NULL DEFAULT 'ALL',
  -- Part 6 marks two rows optional ("optional for T2", "optional"). Optional
  -- assets instantiate like the rest but may be closed as NOT_APPLICABLE.
  optional            BOOLEAN NOT NULL DEFAULT false,
  default_owner_email TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.launch_asset (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id       UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  -- Null for an asset added ad hoc to one launch. Postgres treats NULLs as
  -- distinct in a unique index, so several ad-hoc rows per launch are fine
  -- while a templated asset can only be instantiated once.
  template_id     UUID REFERENCES public.launch_asset_template(id) ON DELETE SET NULL,
  -- Copied at instantiation rather than joined: renaming a template must not
  -- silently relabel assets on launches that already shipped.
  label           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'NOT_STARTED'
                    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE')),
  owner_email     TEXT,
  -- The Collateral Index's "Where to Find It".
  url             TEXT,
  notes           TEXT,
  optional        BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  last_updated_by UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (launch_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_launch_asset_launch ON public.launch_asset (launch_id);
CREATE INDEX IF NOT EXISTS idx_launch_asset_status ON public.launch_asset (launch_id, status);

ALTER TABLE public.launch_asset_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_asset ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lat_select_authenticated" ON public.launch_asset_template;
CREATE POLICY "lat_select_authenticated" ON public.launch_asset_template
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lat_write_authenticated" ON public.launch_asset_template;
CREATE POLICY "lat_write_authenticated" ON public.launch_asset_template
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "la_select_authenticated" ON public.launch_asset;
CREATE POLICY "la_select_authenticated" ON public.launch_asset
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "la_write_authenticated" ON public.launch_asset;
CREATE POLICY "la_write_authenticated" ON public.launch_asset
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.launch_asset_template TO anon, authenticated, service_role;
GRANT ALL ON public.launch_asset TO anon, authenticated, service_role;

-- Part 6, verbatim. Owners follow Kristin's rule that PMM owns everything
-- downstream of the Story Brief, so they resolve to the launch owner.
INSERT INTO public.launch_asset_template
  (asset_key, label, description, tier_applicability, optional, default_owner_email, sort_order)
VALUES
  ('launch_brief', 'Launch Brief',
   'The Campaign Brief itself -- the launch operating document.',
   'ALL', false, '[launch owner (PMM)]', 0),

  ('field_enablement_guide', 'Field Enablement Guide',
   '12-18 pp, DCC format. Tier 2 baseline is the 12-section template; Tier 1 adds six more sections.',
   'ALL', false, '[launch owner (PMM)]', 1),

  ('sales_talk_track', 'Sales Talk Track Update',
   'Scripts the field can say verbatim, quoted from the ratified Message Brief.',
   'ALL', false, '[launch owner (PMM)]', 2),

  ('klue_battlecard', 'Klue Battlecard Update',
   'Competitive positioning. Note which competitors the update must cover.',
   'ALL', false, '[launch owner (PMM)]', 3),

  ('csm_playbook', 'CSM Playbook / FAQ',
   'Adoption and retention play for Customer Success.',
   'ALL', false, '[launch owner (PMM)]', 4),

  ('am_talking_points', 'AM Talking Points',
   'Expansion and renewal angle for Account Management.',
   'ALL', false, '[launch owner (PMM)]', 5),

  ('customer_comm', 'Customer Email or In-App Comm',
   'Marked optional for Tier 2 in the template, pending confirmation.',
   'ALL', true, '[launch owner (PMM)]', 6),

  ('blog_post', 'Blog Post',
   'Marked optional in the template, pending confirmation.',
   'ALL', true, '[launch owner (PMM)]', 7),

  ('internal_slack_announcement', 'Internal Launch Slack Announcement',
   'What it is, when to use it, who it is for, and where to find the assets.',
   'ALL', false, '[launch owner (PMM)]', 8),

  ('support_faq', 'FAQ for Support Team / self-serve page',
   'Support-facing FAQ and the customer self-serve page.',
   'ALL', false, '[launch owner (PMM)]', 9),

  ('pricing_calculator', 'Self-serve pricing calculator (standard tiers)',
   'Standard-tier pricing calculator entry. Blocked by Gate 2 until the pricing model is stable.',
   'ALL', false, '[launch owner (PMM)]', 10)
ON CONFLICT (asset_key) DO NOTHING;
