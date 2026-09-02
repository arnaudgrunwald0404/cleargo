-- Substrate for launch notifications and the agent-driven Story Brief interview.
-- Two independent gaps, one migration because neither is useful alone.
--
-- 1. notification_log can only be keyed to an epic. Launch checklist items are
--    what the workback actually chases -- they carry the owners, the due dates
--    and the gate semantics -- so without launch_id/criterion_id there is no way
--    to dedupe a nudge, apply a cooldown, or find the slack_ts of the message
--    that already exists for this artifact. slack_ts is already stored; nothing
--    can look it up.
--
-- 2. story-brief open_flags are free text inside the section JSON, and
--    postProcessGrounding APPENDS to them on every regeneration. They have no
--    identity and no state, so an agent cannot ask about one, record the answer,
--    and know next time that it is settled. That is the whole interview loop.

-- ── 1. Launch-scoped notifications ──────────────────────────────────────────

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS launch_id uuid REFERENCES public.launch(id) ON DELETE CASCADE;

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS criterion_id uuid REFERENCES public.criterion(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.notification_log.launch_id IS
  'Launch this notification concerns. Null for epic-scoped notifications (epic_id carries those).';

COMMENT ON COLUMN public.notification_log.criterion_id IS
  'Checklist item this notification concerns, so a nudge can be deduped per artifact and its existing Slack message edited in place via slack_ts rather than re-sent.';

-- The dedupe/cooldown lookup: "have we already messaged about this artifact, and
-- which Slack message was it?" Partial, because most rows are epic-scoped.
CREATE INDEX IF NOT EXISTS idx_notification_log_launch_artifact
  ON public.notification_log (launch_id, criterion_id, type, sent_at DESC)
  WHERE launch_id IS NOT NULL;

-- ── 2. Story Brief flags as first-class records ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.epic_story_brief_flag (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_story_brief_id UUID NOT NULL REFERENCES public.epic_story_brief(id) ON DELETE CASCADE,

  -- Stable identity across regenerations, derived in TS from section + normalised
  -- claim text (see storyBriefFlagKey). Without this a regeneration produces
  -- "new" flags for questions already answered.
  flag_key            TEXT NOT NULL,
  -- Which of the 8 template sections the gap sits in.
  section             TEXT NOT NULL,
  -- What the model wanted to assert but could not ground.
  claim               TEXT NOT NULL,
  -- The question to actually put to a human, if it differs from the claim.
  question            TEXT,

  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'asked', 'answered', 'deferred')),
  answer              TEXT,
  asked_at            TIMESTAMPTZ,
  answered_at         TIMESTAMPTZ,
  answered_by         TEXT,

  -- Which generation last produced this flag. A flag absent from the newest
  -- generation is stale rather than deleted: the answer stays on record in case
  -- the gap reappears.
  last_seen_generation INTEGER NOT NULL DEFAULT 1,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (epic_story_brief_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_esb_flag_brief_status
  ON public.epic_story_brief_flag (epic_story_brief_id, status);

-- The agent's work queue: everything still waiting on a human, oldest first.
CREATE INDEX IF NOT EXISTS idx_esb_flag_open
  ON public.epic_story_brief_flag (status, created_at)
  WHERE status IN ('open', 'asked');

ALTER TABLE public.epic_story_brief_flag ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "esb_flag_select_authenticated" ON public.epic_story_brief_flag;
CREATE POLICY "esb_flag_select_authenticated" ON public.epic_story_brief_flag
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "esb_flag_write_authenticated" ON public.epic_story_brief_flag;
CREATE POLICY "esb_flag_write_authenticated" ON public.epic_story_brief_flag
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Role grants are not automatic here: 20260717000000 exists solely because the
-- launch tables shipped without them and every role got 42501.
GRANT ALL ON public.epic_story_brief_flag TO anon, authenticated, service_role;
