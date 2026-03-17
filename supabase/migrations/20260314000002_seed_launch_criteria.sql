-- 20260314000002_seed_launch_criteria.sql
-- Seed default launch criteria templates based on a standard product launch playbook.
-- These are generic templates (not product-specific) that get instantiated per launch.
-- Admins can customize, add, or remove criteria via the Launch Criteria settings page.

DO $$
BEGIN
  -- Skip if launch criteria have already been seeded
  IF EXISTS (SELECT 1 FROM public.criterion WHERE context = 'launch' LIMIT 1) THEN
    RAISE NOTICE 'Launch criteria already seeded, skipping';
    RETURN;
  END IF;

-- =============================================================================
-- Phase 1: Strategy & Positioning (Weeks -8 to -6)
-- =============================================================================

INSERT INTO public.criterion (label, description, category, gate, tier_applicability, context, phase, sort_order, default_due_offset_days)
VALUES
  ('Lock product role in portfolio',
   'Define how this product fits within the broader product portfolio and which solution area it maps to.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 1, 56),

  ('Identify target customers',
   'Define the ideal customer profile (industry, company size, use case) for this launch.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 2, 52),

  ('Define success metrics',
   'Establish launch KPIs such as attach rate, activation, pipeline, and feature adoption targets.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 3, 50),

  ('Build packaging & pricing strategy',
   'Define revenue model, pricing tiers, and packaging. Add to price calculator if applicable.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 4, 50),

  ('Create product summary document',
   'Write a concise product overview covering value proposition, key features, and differentiation.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 5, 50),

  ('Draft product positioning statement',
   'Create the GTM positioning statement and messaging framework for the launch.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 6, 50),

  ('Update solution message house',
   'Slot the new product into the broader solution messaging framework.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 7, 46),

  ('Determine launch tier',
   'Classify as Tier 1, 2, or 3 based on market opportunity, strategic importance, and GTM investment.',
   'Strategy', true, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 8, 47),

  ('Analyze competitor offerings',
   'Document how this product compares to competitors and alternative solutions in the market.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 9, 44),

  ('Create "Why This / Why Now" narrative',
   'Build the strategic narrative for sales and analysts explaining market timing and differentiation.',
   'Strategy', false, 'ALL',
   'launch', 'Phase 1: Strategy & Positioning', 10, 42),

-- =============================================================================
-- Phase 2: Product Readiness & Validation (Weeks -6 to -4)
-- =============================================================================

  ('Core launch kick-off meeting',
   'Align cross-functional stakeholders (PMM, Sales, CS, Support) on launch plan and enablement timeline.',
   'Readiness', false, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 11, 42),

  ('Create differentiated narrative',
   'Standardize the product story for consistent use across all customer-facing teams.',
   'Readiness', false, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 12, 35),

  ('Build demo script',
   'Create a structured demo flow that showcases key workflows and value propositions.',
   'Readiness', false, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 13, 33),

  ('Record demo walkthrough',
   'Produce a recorded demo video validating that product workflows match real user behavior.',
   'Readiness', false, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 14, 30),

  ('Deliver product training sessions',
   'Run live training sessions covering positioning, value props, and key differentiators for internal teams.',
   'Readiness', false, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 15, 25),

  ('Sign-off: PM documentation',
   'Final technical and feature spec sign-off by Product Management.',
   'Readiness', true, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 16, 50),

  ('Sign-off: Business justification',
   'Leadership sign-off on business case, ROI model, and strategic alignment.',
   'Readiness', true, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 17, 14),

  ('Sign-off: Product education',
   'Sign-off confirming internal knowledge base and training materials are complete.',
   'Readiness', true, 'ALL',
   'launch', 'Phase 2: Product Readiness & Validation', 18, 14),

-- =============================================================================
-- Phase 3: Messaging & Asset Build (Weeks -4 to -2)
-- =============================================================================

  ('Create sell sheet for sales teams',
   'Design and deliver a one-pager for AMs and CSMs with key selling points and use cases.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 19, 24),

  ('Add sales slides to master deck',
   'Create and integrate product-specific slides into the master sales presentation.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 20, 24),

  ('Deliver FAQ & objection handling doc',
   'Create a comprehensive FAQ and objection handling document for customer-facing teams.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 21, 23),

  ('Deliver discovery questions',
   'Provide a set of discovery questions for CSMs and AMs to qualify opportunities.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 22, 23),

  ('Set up internal Slack channel',
   'Create a dedicated Slack channel for quick-response support during early launch period.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 23, 21),

  ('Deliver self-service docs & FAQs',
   'Publish customer-facing documentation, help articles, and frequently asked questions.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 24, 20),

  ('Deliver quick start guide',
   'Create a concise getting-started guide for end users.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 25, 20),

  ('Deliver "Easy to sell/explain/demo" guide',
   'Create a streamlined guide helping sales reps quickly explain and demo the product.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 26, 19),

  ('Deliver setup & configuration guide',
   'Document implementation steps, permissions setup, and configuration requirements.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 27, 17),

  ('Update pricing calculator & notify RevOps',
   'Add new SKU to pricing tools, deal calculation sheets, and PDF quote templates.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 28, 27),

  ('Update CRM with new SKU for quoting',
   'Add new product SKU to Salesforce (or CRM) so sales can include it in quotes.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 29, 16),

  ('Update order form',
   'Add the new product to order form templates.',
   'Enablement', false, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 30, 16),

  ('Sign-off: RevOps',
   'RevOps confirms pricing, quoting, and deal desk tooling are ready.',
   'Enablement', true, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 31, 15),

  ('Sign-off: Support',
   'Support team confirms tools, documentation, and escalation paths are in place.',
   'Enablement', true, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 32, 13),

  ('Sign-off: Implementation / CS',
   'Implementation and CS teams confirm readiness for client onboarding.',
   'Enablement', true, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 33, 13),

  ('Sign-off: PMM',
   'PMM confirms all messaging, collateral, and enablement materials are complete.',
   'Enablement', true, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 34, 13),

  ('Sign-off: Sales',
   'Sales leadership validates final pricing, collateral, and readiness to sell.',
   'Enablement', true, 'ALL',
   'launch', 'Phase 3: Messaging & Asset Build', 35, 12),

-- =============================================================================
-- Phase 4: Internal Enablement & Activation (Weeks -2 to -1)
-- =============================================================================

  ('Deliver live enablement session',
   'Run a focused (30 min max) live session for all customer-facing teams.',
   'Activation', false, 'ALL',
   'launch', 'Phase 4: Internal Enablement & Activation', 36, 13),

  ('Slack announcement with key info',
   'Post internal Slack announcement covering: what it is, when to use it, who it''s for, and where to find assets.',
   'Activation', false, 'ALL',
   'launch', 'Phase 4: Internal Enablement & Activation', 37, 12),

  ('Upload positioning & objection handling to sales tools',
   'Publish approved messaging and objection handling to Klue, Highspot, or equivalent sales enablement platform.',
   'Activation', false, 'ALL',
   'launch', 'Phase 4: Internal Enablement & Activation', 38, 12),

-- =============================================================================
-- Phase 5: Launch (Week 0)
-- =============================================================================

  ('Official launch announcement',
   'Execute the external launch: email campaign, in-app announcements, and press (if applicable).',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 39, 0),

  ('Website / product page live',
   'Publish approved product page, module snippet, or landing page on the website.',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 40, 0),

  ('Launch blog / feature spotlight',
   'Publish the launch blog post or feature spotlight article.',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 41, 7),

  ('Customer announcement (email + in-app)',
   'Send customer-facing launch announcement via email and in-app notification.',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 42, 0),

  ('Internal launch announcement',
   'Send company-wide internal announcement simultaneously with customer announcement.',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 43, 0),

  ('Sales Slack announcement: how to sell',
   'Post a recap in the sales Slack channel with key talking points and where to find assets.',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 44, 0),

  ('Deal desk guidance live',
   'Publish deal desk guidance with packaging, pricing notes, and discount guardrails.',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 45, 0),

  ('Activate growth campaign',
   'Launch any associated demand generation or growth marketing campaigns.',
   'Launch', false, 'TIER_1,TIER_2',
   'launch', 'Phase 5: Launch', 46, 0),

  ('Monitor launch metrics',
   'Begin tracking launch KPIs: feature attach rate, demo usage, activation, and pipeline impact.',
   'Launch', false, 'ALL',
   'launch', 'Phase 5: Launch', 47, 0),

-- =============================================================================
-- Phase 6: Post-Launch Optimization (Weeks +2 to +6)
-- =============================================================================

  ('Week 1 metrics review',
   'Review first-week performance: attach rate, demo usage, activation, and early pipeline signals.',
   'Post-Launch', false, 'ALL',
   'launch', 'Phase 6: Post-Launch Optimization', 48, -7),

  ('Gather customer feedback',
   'Collect structured feedback from CS, Support, and early adopters.',
   'Post-Launch', false, 'ALL',
   'launch', 'Phase 6: Post-Launch Optimization', 49, -7),

  ('Refine messaging based on feedback',
   'Update positioning, collateral, and objection handling based on early market feedback.',
   'Post-Launch', false, 'ALL',
   'launch', 'Phase 6: Post-Launch Optimization', 50, -14),

  ('30-day performance assessment',
   'Conduct a full 30-day performance review against launch KPIs.',
   'Post-Launch', false, 'ALL',
   'launch', 'Phase 6: Post-Launch Optimization', 51, -30),

  ('60-day performance assessment',
   'Final optimization round: assess long-term performance and decide on next investment.',
   'Post-Launch', false, 'ALL',
   'launch', 'Phase 6: Post-Launch Optimization', 52, -60);

END $$;
