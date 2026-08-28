-- Co-signatures on a gate.
--
-- Every gate in the 00 Launch Gate Checklist ends with a signature block naming
-- two or three functions and leaving space for a name and a date:
--
--   Gate 1  Sign-off — PMM + CPO
--   Gate 2  Sign-off — CPO + RevOps
--   Gate 3  Sign-off — PMM + Product + SE lead
--
-- ClearGO stores one decision_owner per criterion, so "both signed" has never
-- been representable. That is the schema half of Akram's point about ownership
-- being unclear when multiple stakeholders are involved — no amount of filling in
-- existing fields fixes it.
--
-- One row per (launch, criterion, role): the roles required are declared on the
-- criterion (required_signoff_roles) and satisfied here.

CREATE TABLE IF NOT EXISTS public.launch_criterion_signoff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id     UUID NOT NULL REFERENCES public.launch(id) ON DELETE CASCADE,
  criterion_id  UUID NOT NULL REFERENCES public.criterion(id) ON DELETE CASCADE,
  -- The role being satisfied, from criterion.required_signoff_roles.
  role          TEXT NOT NULL,
  signer_user_id UUID REFERENCES public.app_user(id) ON DELETE SET NULL,
  -- Kept alongside the FK because the checklist records a typed name, and a
  -- signature should survive the signer later leaving.
  signer_name   TEXT,
  signer_email  TEXT,
  signed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT,
  UNIQUE (launch_id, criterion_id, role)
);

CREATE INDEX IF NOT EXISTS idx_launch_criterion_signoff_launch
  ON public.launch_criterion_signoff (launch_id, criterion_id);

ALTER TABLE public.launch_criterion_signoff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lcso_select_authenticated" ON public.launch_criterion_signoff;
CREATE POLICY "lcso_select_authenticated" ON public.launch_criterion_signoff
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lcso_write_authenticated" ON public.launch_criterion_signoff;
CREATE POLICY "lcso_write_authenticated" ON public.launch_criterion_signoff
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.launch_criterion_signoff TO anon, authenticated, service_role;
