-- Set default rating_timing on criteria that have it NULL.
-- Maps category → launch stage name for both release_schedule and ui_rollout scopes.
-- Criteria marked ui_framework_only get the ui_rollout stage ID; others get release_schedule.
-- Only updates rows where rating_timing IS NULL (never overwrites manual assignments).

DO $$
DECLARE
  st text;
  mapping RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'launch_stages') THEN
    st := 'launch_stages';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'release_stages') THEN
    st := 'release_stages';
  ELSE
    RAISE EXCEPTION '20260311100000_set_default_rating_timing: expected launch_stages or release_stages';
  END IF;

  FOR mapping IN
    SELECT *
    FROM (VALUES
      ('Strategy',                                'Product Definition Complete'),
      ('UX & Research',                           'UX Preview'),
      ('Technical Readiness',                     'UX Preview'),
      ('Product Documentation',                   'GTM Access and Prep'),
      ('GTM',                                     'GTM Access and Prep'),
      ('Enablement & Training Readiness',         'GTM Access and Prep'),
      ('Sales Enablement',                        'GTM Access and Prep'),
      ('Product Marketing',                       'GTM Access and Prep'),
      ('Support',                                 'Internal Readiness'),
      ('Customer Support Readiness',              'Internal Readiness'),
      ('OPS',                                     'Internal Readiness'),
      ('Revenue Ops',                             'Internal Readiness'),
      ('Product',                                 'Internal Readiness'),
      ('Customer Success',                        'Internal Readiness'),
      ('Data & Analytics',                        'Internal Readiness'),
      ('Analytics & Metrics',                     'Internal Readiness'),
      ('Implementation Scale & Customer Adoption','Cohort 1'),
      ('Customer Success & Ongoing Adoption',     'Cohort 1'),
      ('Legal & Security',                        'Product Definition Complete'),
      ('PRODUCT_TECH',                            'UX Preview'),
      ('PRODUCT_DOCUMENTATION',                   'GTM Access and Prep'),
      ('DATA_ANALYTICS',                          'Internal Readiness'),
      ('ANALYTICS_AND_METRICS',                   'Internal Readiness'),
      ('LEGAL_SECURITY',                          'Product Definition Complete'),
      ('STRATEGY',                                'Product Definition Complete'),
      ('SUPPORT',                                 'Internal Readiness'),
      ('OTHER',                                   'Internal Readiness')
    ) AS t(category_name, stage_name)
  LOOP
    EXECUTE format($q$
      UPDATE public.criterion c SET rating_timing = ls.id
      FROM public.%I ls
      WHERE c.rating_timing IS NULL
        AND c.ui_framework_only = TRUE
        AND lower(trim(c.category)) = lower(trim($1))
        AND ls.scope = 'ui_rollout'
        AND lower(trim(ls.name)) = lower(trim($2))
    $q$, st)
      USING mapping.category_name, mapping.stage_name;

    EXECUTE format($q$
      UPDATE public.criterion c SET rating_timing = ls.id
      FROM public.%I ls
      WHERE c.rating_timing IS NULL
        AND (c.ui_framework_only IS NULL OR c.ui_framework_only = FALSE)
        AND lower(trim(c.category)) = lower(trim($1))
        AND ls.scope = 'release_schedule'
        AND lower(trim(ls.name)) = lower(trim($2))
    $q$, st)
      USING mapping.category_name, mapping.stage_name;
  END LOOP;

  EXECUTE format($q$
    UPDATE public.criterion c SET rating_timing = ls.id
    FROM public.%I ls
    WHERE c.rating_timing IS NULL
      AND (c.ui_framework_only IS NULL OR c.ui_framework_only = FALSE)
      AND lower(trim(c.category)) IN ('ux & research', 'product_tech', 'technical readiness')
      AND ls.scope = 'release_schedule'
      AND lower(trim(ls.name)) = 'gtm access and prep'
  $q$, st);

  RAISE NOTICE 'rating_timing defaults applied. Remaining NULL: %',
    (SELECT count(*) FROM public.criterion WHERE rating_timing IS NULL AND is_active = TRUE);
END $$;
