-- 2026-08-28 Story Brief notification state tracking
--
-- Tracks per-epic completeness assessment results and notification cadence state
-- so the cron job knows when to send and how often.

-- Per-epic notification state for Story Brief nudges.
-- One row per epic; created on first assessment and updated each run.
CREATE TABLE IF NOT EXISTS public.story_brief_notification_state (
    id BIGSERIAL PRIMARY KEY,
    epic_id UUID NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
    -- When the brief was last assessed for completeness
    last_assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Snapshot of the completeness score (0-1) at last assessment
    last_completeness_score NUMERIC(4,2) NOT NULL CHECK (last_completeness_score >= 0 AND last_completeness_score <= 1),
    -- Number of complete sections out of total
    complete_sections INT NOT NULL DEFAULT 0 CHECK (complete_sections >= 0),
    total_sections INT NOT NULL DEFAULT 9 CHECK (total_sections > 0),
    -- When the last notification was sent for this epic
    last_notified_at TIMESTAMPTZ,
    -- How many notifications have been sent for this epic
    notification_count INT NOT NULL DEFAULT 0 CHECK (notification_count >= 0),
    -- JSONB snapshot of gaps at last assessment (for debugging and audit)
    last_gaps JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbn_state_epic ON public.story_brief_notification_state(epic_id);
CREATE INDEX IF NOT EXISTS idx_sbn_state_last_notified ON public.story_brief_notification_state(last_notified_at);
CREATE INDEX IF NOT EXISTS idx_sbn_state_score ON public.story_brief_notification_state(last_completeness_score);

COMMENT ON TABLE public.story_brief_notification_state IS 'Tracks Story Brief completeness and notification cadence per epic';