-- Migration: Add milestone-based targets for HEART metrics
-- Allows multiple targets per metric (e.g., 30% at 30 days, 60% at 90 days, 80% at 180 days)

-- ============================================================================
-- Milestone Targets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS heart_metric_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_heart_metric_id UUID NOT NULL REFERENCES epic_heart_metrics(id) ON DELETE CASCADE,
  
  -- Milestone definition
  days_after_launch INTEGER NOT NULL CHECK (days_after_launch > 0),
  target_value NUMERIC NOT NULL CHECK (target_value >= 0),
  
  -- Optional label (e.g., "1 Month", "3 Months", "6 Months")
  label TEXT,
  
  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure unique milestone per metric per day
  UNIQUE(epic_heart_metric_id, days_after_launch)
);

-- Index for efficient lookups
CREATE INDEX idx_heart_metric_milestones_metric ON heart_metric_milestones(epic_heart_metric_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE heart_metric_milestones ENABLE ROW LEVEL SECURITY;

-- Read: Anyone authenticated can read milestones
CREATE POLICY heart_metric_milestones_select ON heart_metric_milestones
  FOR SELECT TO authenticated
  USING (true);

-- Insert: Anyone authenticated can create milestones
CREATE POLICY heart_metric_milestones_insert ON heart_metric_milestones
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update: Anyone authenticated can update milestones
CREATE POLICY heart_metric_milestones_update ON heart_metric_milestones
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete: Anyone authenticated can delete milestones
CREATE POLICY heart_metric_milestones_delete ON heart_metric_milestones
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT ALL ON heart_metric_milestones TO authenticated;
GRANT ALL ON heart_metric_milestones TO service_role;

-- ============================================================================
-- Updated_at trigger function (if not exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_heart_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_heart_metric_milestones_updated_at
  BEFORE UPDATE ON heart_metric_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_heart_milestones_updated_at();

-- ============================================================================
-- Migrate existing single targets to milestones
-- ============================================================================

-- For any metric that has target_value and target_timeframe_days set,
-- create a corresponding milestone entry
INSERT INTO heart_metric_milestones (epic_heart_metric_id, days_after_launch, target_value, label)
SELECT 
  id,
  target_timeframe_days,
  target_value,
  CASE 
    WHEN target_timeframe_days <= 30 THEN '1 Month'
    WHEN target_timeframe_days <= 60 THEN '2 Months'
    WHEN target_timeframe_days <= 90 THEN '3 Months'
    WHEN target_timeframe_days <= 180 THEN '6 Months'
    ELSE target_timeframe_days || ' Days'
  END
FROM epic_heart_metrics
WHERE target_value IS NOT NULL 
  AND target_timeframe_days IS NOT NULL
  AND target_timeframe_days > 0
ON CONFLICT (epic_heart_metric_id, days_after_launch) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE heart_metric_milestones IS 'Milestone-based targets for HEART metrics (e.g., 30% at 30 days, 60% at 90 days)';
COMMENT ON COLUMN heart_metric_milestones.days_after_launch IS 'Number of days after epic launch when this target should be reached';
COMMENT ON COLUMN heart_metric_milestones.target_value IS 'Target value to achieve by this milestone (e.g., 30 for 30%)';
COMMENT ON COLUMN heart_metric_milestones.label IS 'Human-readable label for this milestone (e.g., "1 Month", "Q1")';
