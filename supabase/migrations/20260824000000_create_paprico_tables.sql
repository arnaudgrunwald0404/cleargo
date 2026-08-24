-- PaPriCo (Packaging & Pricing Committee) agenda-and-decision tracker.
-- Spec: docs/PaPriCo-report-spec.md
--
-- Four tables:
--   paprico_meeting          - committee meetings (draft -> agenda_published -> held -> closed)
--   paprico_item             - agenda items, release-derived (epic x criterion) or standing
--   paprico_decision         - append-only decision log (a change of mind is a new row
--                              with supersedes_id set; rows are never edited or deleted)
--   paprico_gating_criterion - which release criteria pull items onto the agenda
--
-- Naming follows repo convention (singular: epic, criterion, product).
-- Row access: RLS enabled with authenticated policies; write authorization is
-- capability-checked at the API layer (paprico.manage), same model as criteria routes.

-- ── paprico_meeting ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paprico_meeting (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_date DATE NOT NULL,
    chair_email TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'agenda_published', 'held', 'closed')),
    meeting_length_minutes INTEGER NOT NULL DEFAULT 60,
    agenda_published_at TIMESTAMPTZ,
    agenda_snapshot JSONB,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paprico_meeting_date ON public.paprico_meeting(meeting_date);
CREATE INDEX IF NOT EXISTS idx_paprico_meeting_status ON public.paprico_meeting(status);

-- ── paprico_item ────────────────────────────────────────────────────────────
-- Items are a global registry (not bound to one meeting): deferred items carry
-- forward automatically and the agenda for the next open meeting is computed on read.
CREATE TABLE IF NOT EXISTS public.paprico_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK (source IN ('release', 'standing')),
    -- ON DELETE SET NULL: if an epic or criterion is deleted the item remains
    -- and renders as orphaned rather than disappearing (spec §6 resilience).
    epic_id UUID REFERENCES public.epic(id) ON DELETE SET NULL,
    criterion_id UUID REFERENCES public.criterion(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    owner_email TEXT,
    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'on_agenda', 'decided', 'deferred', 'blocked', 'closed')),
    blocked_reason TEXT,
    time_box_minutes INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    auto_closed BOOLEAN NOT NULL DEFAULT false,
    -- System-appended notes (e.g. the auto-close note when a criterion flips complete).
    system_notes TEXT,
    -- Attachment links: array of { label, url } (submission deck, spreadsheet, Slack thread).
    links JSONB,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT paprico_item_blocked_reason CHECK (status <> 'blocked' OR blocked_reason IS NOT NULL)
);

-- Idempotent agenda sync: at most one open release-derived item per epic/criterion pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_paprico_item_open_release_pair
    ON public.paprico_item(epic_id, criterion_id)
    WHERE source = 'release' AND status <> 'closed';

CREATE INDEX IF NOT EXISTS idx_paprico_item_status ON public.paprico_item(status);
CREATE INDEX IF NOT EXISTS idx_paprico_item_epic ON public.paprico_item(epic_id);
CREATE INDEX IF NOT EXISTS idx_paprico_item_criterion ON public.paprico_item(criterion_id);

-- ── paprico_decision ────────────────────────────────────────────────────────
-- Append-only. The only mutable field is completed_at/completed_by (set when
-- the commitment lands); everything else is written once.
CREATE TABLE IF NOT EXISTS public.paprico_decision (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.paprico_item(id),
    meeting_id UUID NOT NULL REFERENCES public.paprico_meeting(id),
    decision_type TEXT NOT NULL CHECK (decision_type IN (
        'approved', 'approved_with_amendment', 'rejected',
        'deferred', 'assigned', 'no_decision_needed'
    )),
    decision_text TEXT NOT NULL,
    rationale TEXT,
    owner_email TEXT,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    completed_by TEXT,
    supersedes_id UUID REFERENCES public.paprico_decision(id),
    decided_by TEXT NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The single most important constraint in the spec: an assigned/approved
    -- decision cannot exist without an owner and a due date.
    CONSTRAINT paprico_decision_owner_required CHECK (
        decision_type NOT IN ('approved', 'approved_with_amendment', 'assigned')
        OR (owner_email IS NOT NULL AND due_date IS NOT NULL)
    ),
    CONSTRAINT paprico_decision_due_with_owner CHECK (owner_email IS NULL OR due_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_paprico_decision_item ON public.paprico_decision(item_id);
CREATE INDEX IF NOT EXISTS idx_paprico_decision_meeting ON public.paprico_decision(meeting_id);
CREATE INDEX IF NOT EXISTS idx_paprico_decision_open_commitments
    ON public.paprico_decision(due_date)
    WHERE completed_at IS NULL AND owner_email IS NOT NULL;

-- ── paprico_gating_criterion ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paprico_gating_criterion (
    criterion_id UUID PRIMARY KEY REFERENCES public.criterion(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    -- NULL means "use the default lookahead" (app_settings.paprico_default_lookahead_days).
    lookahead_days INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default agenda horizon, editable in the PaPriCo settings screen.
ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS paprico_default_lookahead_days INTEGER NOT NULL DEFAULT 60;

-- ── RLS + grants ────────────────────────────────────────────────────────────
ALTER TABLE public.paprico_meeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paprico_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paprico_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paprico_gating_criterion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.paprico_meeting;
CREATE POLICY "Allow all to authenticated users" ON public.paprico_meeting
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.paprico_item;
CREATE POLICY "Allow all to authenticated users" ON public.paprico_item
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.paprico_decision;
CREATE POLICY "Allow all to authenticated users" ON public.paprico_decision
    FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.paprico_gating_criterion;
CREATE POLICY "Allow all to authenticated users" ON public.paprico_gating_criterion
    FOR ALL TO authenticated USING (true);

-- Grants: tables created without role grants 42501 on every request
-- (same repair as 20260717000000_grant_launch_tables.sql).
GRANT ALL ON public.paprico_meeting TO anon, authenticated, service_role;
GRANT ALL ON public.paprico_item TO anon, authenticated, service_role;
GRANT ALL ON public.paprico_decision TO anon, authenticated, service_role;
GRANT ALL ON public.paprico_gating_criterion TO anon, authenticated, service_role;

-- ── Seed gating criteria ────────────────────────────────────────────────────
-- Matched by label against release-context criteria and stored by criterion_id,
-- so later renumbering/relabelling cannot break the report (spec §3).
-- "Product Name Confirmed" exists today only as the launch-context criterion
-- "Final product name signed off" (tracked in launch_criterion_status, not
-- epic_criterion_status), so it is not seeded here; add it in the PaPriCo
-- settings screen once a release-context equivalent exists. Same for
-- "Unit Economics & Margin Floor Documented" if not yet created.
INSERT INTO public.paprico_gating_criterion (criterion_id, enabled)
SELECT c.id, true
FROM public.criterion c
WHERE c.context = 'release'
  AND c.is_active = true
  AND (
        c.label ILIKE 'Packaging & Pricing Approved%'
     OR c.label ILIKE 'Packaging and Pricing Approved%'
     OR c.label ILIKE 'Confirmed Pricing Communicated%'
     OR c.label ILIKE 'Revenue forecast reviewed%'
     OR c.label ILIKE 'Revenue Forecast & Risk Analysis%'
     OR c.label ILIKE 'Revenue Forecast and Risk Analysis%'
     OR c.label ILIKE 'Commercialization%'
     OR c.label ILIKE 'Unit Economics & Margin Floor Documented%'
     OR c.label ILIKE 'Product Name Confirmed%'
  )
ON CONFLICT (criterion_id) DO NOTHING;
