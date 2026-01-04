-- ============================================================================
-- Manual Metric Values Table
-- ============================================================================
-- Stores manually entered metric values for metrics with source=MANUAL
-- or when manual override is needed

CREATE TABLE IF NOT EXISTS public.manual_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id uuid NOT NULL REFERENCES public.epic(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.success_metrics(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  value jsonb NOT NULL, -- Stores number, boolean, or null based on measurement_type
  entered_by uuid NOT NULL REFERENCES public.app_user(id),
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(epic_id, metric_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_manual_metric_values_epic_date 
  ON public.manual_metric_values(epic_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_manual_metric_values_metric 
  ON public.manual_metric_values(metric_id);

-- ============================================================================
-- Row-Level Security Policies
-- ============================================================================

ALTER TABLE public.manual_metric_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON public.manual_metric_values
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow write access to PMs and admins" ON public.manual_metric_values
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE id = auth.uid()
      AND (
        roles && ARRAY['PM', 'SUPERADMIN', 'PRODUCT_OPS', 'CPO']::text[]
      )
    )
  );

CREATE POLICY "Allow update access to PMs and admins" ON public.manual_metric_values
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE id = auth.uid()
      AND (
        roles && ARRAY['PM', 'SUPERADMIN', 'PRODUCT_OPS', 'CPO']::text[]
      )
    )
  );

CREATE POLICY "Allow delete access to admins" ON public.manual_metric_values
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE id = auth.uid()
      AND (
        roles && ARRAY['SUPERADMIN', 'PRODUCT_OPS', 'CPO']::text[]
      )
    )
  );

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.manual_metric_values IS 'Manually entered metric values for success measurement';
COMMENT ON COLUMN public.manual_metric_values.value IS 'JSON value: number for PERCENTAGE/COUNT/DURATION, boolean for BOOLEAN, null for missing';

