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
