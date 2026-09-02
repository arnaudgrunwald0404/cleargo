-- ClearGO · launch artifacts (Google Docs) + the Campaign→Marketing Brief rename
-- Generated bundle of supabase/migrations/20260825000000 and 20260826000000, in order.
-- Paste into the Supabase SQL editor: migrations are not auto-applied on deploy.
-- Safe to re-run (idempotent guards throughout).
--
-- VERIFIED AGAINST THIS DATABASE 2026-08-26 by probing PostgREST:
--   • the whole 2026-08-21 gate/ownership batch is ALREADY APPLIED — not repeated here
--   • launch_artifact and launch_artifact_flag do NOT exist  → created below
--   • criterion still carries the label 'Campaign Brief delivered' → renamed below
--
-- Wrapped in a transaction so a partial apply rolls back rather than leaving the
-- artifact tables present but the rename half-done.

BEGIN;

-- ============================================================
-- 20260825000000_create_launch_artifact.sql
-- ============================================================
-- Launch artifacts: the five Google Docs behind the runway.
--
-- The runway itself has been modelled since 20260819000000 — Phase 00
-- Commercialization Gate and Phase 01 Artifact Runway are `criterion` rows with
-- tier-scaled T-minus offsets and a depends_on chain. What has never been
-- modelled is the DOCUMENT. "Story Brief delivered" is satisfied today by a
-- human pasting a URL into launch_criterion_status.links.
--
-- This table gives each artifact a first-class record: which Doc it is, who owns
-- it, where it sits in the review cycle, and the audit trail of what the agent
-- drafted from. The Google Doc remains the system of record for CONTENT — the
-- jsonb columns here are a snapshot for diffing and grounding downstream
-- artifacts, never the authoritative text.
--
-- Linked to the runway by criterion_id rather than replacing it, so readiness,
-- workback dates, and the gate chain keep working untouched.

CREATE TABLE IF NOT EXISTS public.launch_artifact (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id      UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,

  -- The five artifacts in workback order. gate_checklist is the pre-Story
  -- commercialization gate (00), the rest are the Phase 01 runway (01-04).
  -- marketing_brief was called campaign_brief until Kristin renamed it on
  -- 2026-08-26; 20260826000000 carries the rename for databases already created.
  artifact_type  TEXT NOT NULL CHECK (artifact_type IN (
                   'gate_checklist',
                   'story_brief',
                   'messaging_brief',
                   'enablement_guide',
                   'marketing_brief'
                 )),

  -- The runway row this document satisfies. Nullable: the gate checklist spans
  -- three criteria (naming, pricing, beta) rather than mapping to one, and an
  -- artifact can exist before its criterion has been instantiated.
  criterion_id   UUID REFERENCES public.criterion(id) ON DELETE SET NULL,

  -- Google Docs identity. Null until the doc factory has run — which requires
  -- Google credentials, so every read path must tolerate null.
  doc_id         TEXT,
  doc_url        TEXT,
  folder_id      TEXT,

  -- The review cycle. Deliberately a new vocabulary: epic_story_brief's
  -- draft/ratified pair has no room for "the agent has drafted this and is
  -- waiting on a human", which is the whole point of the automation.
  status         TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN (
                   'NOT_STARTED',       -- doc exists (or does not); nobody has drafted
                   'DRAFTING',          -- the agent is mid-run
                   'PENDING_REVIEW',    -- drafted, owner has been asked
                   'CHANGES_REQUESTED', -- owner sent it back, with a reason
                   'APPROVED'           -- v1.0; unblocks the next artifact
                 )),

  -- v0.1 until approved, v1.0 after — the filing convention Kristin's templates
  -- specify ([CODE]_Story-Brief_v0.1).
  version        TEXT NOT NULL DEFAULT 'v0.1',

  -- Story -> PM, everything downstream -> PMM (Kristin, 2026-08-19). Seeded from
  -- the criterion's default_owner_email at instantiation.
  owner_email    TEXT,

  -- Audit, not source of truth. ai_draft is never mutated after a run so a
  -- later draft can be diffed against it; the snapshots record what the agent
  -- could see at the time, which is what makes a bad draft explainable.
  ai_draft            JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Why the owner sent it back. Fed into the next draft as an instruction.
  change_request_note TEXT,

  -- Bumped on every draft; flags carry it as last_seen_generation so a question
  -- answered in generation 2 is not re-asked in generation 3.
  generation     INTEGER NOT NULL DEFAULT 0,

  last_drafted_at TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One document per type per launch. Note this is (launch, type) and NOT
  -- (launch) alone: epic_story_brief's UNIQUE(epic_id) structurally allows only
  -- one artifact per parent, which is exactly what blocked generalising it.
  UNIQUE (launch_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_launch_artifact_launch
  ON public.launch_artifact (launch_id, artifact_type);

-- The work queue: everything waiting on a human, oldest first.
CREATE INDEX IF NOT EXISTS idx_launch_artifact_pending
  ON public.launch_artifact (status, submitted_at)
  WHERE status IN ('PENDING_REVIEW', 'CHANGES_REQUESTED');

ALTER TABLE public.launch_artifact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "la_select_authenticated" ON public.launch_artifact;
CREATE POLICY "la_select_authenticated" ON public.launch_artifact
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "la_write_authenticated" ON public.launch_artifact;
CREATE POLICY "la_write_authenticated" ON public.launch_artifact
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.launch_artifact TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- The interview queue.
--
-- Mirrors epic_story_brief_flag (20260820010000) but keyed to launch_artifact,
-- so all five artifacts get the same "the agent asks what it could not ground"
-- loop rather than only the epic Story Brief.
--
-- Worth recording why this table is not simply reused: epic_story_brief_flag is
-- FK'd to epic_story_brief, which is epic-scoped and single-artifact. There is
-- no column on it that could point at a launch artifact.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.launch_artifact_flag (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_artifact_id UUID NOT NULL REFERENCES public.launch_artifact(id) ON DELETE CASCADE,

  -- Stable identity: section + normalised claim, hashed. Without it a
  -- regeneration re-asks every question that was already answered, because
  -- open_flags is free text that gets reworded on each run.
  flag_key           TEXT NOT NULL,
  section            TEXT NOT NULL,
  claim              TEXT NOT NULL,
  question           TEXT,

  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'asked', 'answered', 'deferred')),
  answer             TEXT,
  asked_at           TIMESTAMPTZ,
  answered_at        TIMESTAMPTZ,
  -- Raw Slack user id when answered from the modal, hence TEXT not a FK.
  answered_by        TEXT,

  last_seen_generation INTEGER NOT NULL DEFAULT 1,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (launch_artifact_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_la_flag_artifact_status
  ON public.launch_artifact_flag (launch_artifact_id, status);

CREATE INDEX IF NOT EXISTS idx_la_flag_open
  ON public.launch_artifact_flag (status, created_at)
  WHERE status IN ('open', 'asked');

ALTER TABLE public.launch_artifact_flag ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "laf_select_authenticated" ON public.launch_artifact_flag;
CREATE POLICY "laf_select_authenticated" ON public.launch_artifact_flag
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "laf_write_authenticated" ON public.launch_artifact_flag;
CREATE POLICY "laf_write_authenticated" ON public.launch_artifact_flag
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.launch_artifact_flag TO anon, authenticated, service_role;

-- ============================================================
-- 20260826000000_rename_campaign_to_marketing_brief.sql
-- ============================================================
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

COMMIT;

-- ============================================================
-- Verification — run after COMMIT; every row should read OK.
-- ============================================================
SELECT 'launch_artifact table'   AS check,
       CASE WHEN to_regclass('public.launch_artifact')      IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'launch_artifact_flag table',
       CASE WHEN to_regclass('public.launch_artifact_flag') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'marketing_brief accepted by CHECK',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conname = 'launch_artifact_artifact_type_check'
            AND pg_get_constraintdef(oid) LIKE '%marketing_brief%'
       ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'criterion renamed',
       CASE WHEN EXISTS (
         SELECT 1 FROM public.criterion
          WHERE context = 'launch' AND label = 'Marketing Brief delivered'
       ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'no stale Campaign Brief label',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM public.criterion
          WHERE context = 'launch' AND label = 'Campaign Brief delivered'
       ) THEN 'OK' ELSE 'STILL PRESENT' END;
