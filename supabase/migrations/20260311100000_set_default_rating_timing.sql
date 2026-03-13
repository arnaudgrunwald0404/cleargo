-- Set default rating_timing on criteria that have it NULL.
-- Maps category → launch stage name for both release_schedule and ui_rollout scopes.
-- Criteria marked ui_framework_only get the ui_rollout stage ID; others get release_schedule.
-- Only updates rows where rating_timing IS NULL (never overwrites manual assignments).

DO $$
DECLARE
  mapping RECORD;
BEGIN
  -- Category → stage name mapping (stage names shared across scopes).
  -- If a stage doesn't exist in a scope, the criterion is left alone.
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
      ('OPS',                                     'Internal Readiness'),
      ('OTHER',                                   'Internal Readiness')
    ) AS t(category_name, stage_name)
  LOOP
    -- UI-framework-only criteria → ui_rollout stage
    UPDATE public.criterion c
    SET rating_timing = ls.id
    FROM public.launch_stages ls
    WHERE c.rating_timing IS NULL
      AND c.ui_framework_only = TRUE
      AND lower(trim(c.category)) = lower(trim(mapping.category_name))
      AND ls.scope = 'ui_rollout'
      AND lower(trim(ls.name)) = lower(trim(mapping.stage_name));

    -- Non-UI-framework criteria → release_schedule stage
    UPDATE public.criterion c
    SET rating_timing = ls.id
    FROM public.launch_stages ls
    WHERE c.rating_timing IS NULL
      AND (c.ui_framework_only IS NULL OR c.ui_framework_only = FALSE)
      AND lower(trim(c.category)) = lower(trim(mapping.category_name))
      AND ls.scope = 'release_schedule'
      AND lower(trim(ls.name)) = lower(trim(mapping.stage_name));
  END LOOP;

  -- Fallback: "UX & Research" non-UI-framework criteria → "GTM Access and Prep" in release_schedule
  -- (since "UX Preview" doesn't exist in release_schedule scope)
  UPDATE public.criterion c
  SET rating_timing = ls.id
  FROM public.launch_stages ls
  WHERE c.rating_timing IS NULL
    AND (c.ui_framework_only IS NULL OR c.ui_framework_only = FALSE)
    AND lower(trim(c.category)) IN ('ux & research', 'product_tech', 'technical readiness')
    AND ls.scope = 'release_schedule'
    AND lower(trim(ls.name)) = 'gtm access and prep';

  RAISE NOTICE 'rating_timing defaults applied. Remaining NULL: %',
    (SELECT count(*) FROM public.criterion WHERE rating_timing IS NULL AND is_active = TRUE);
END $$;
