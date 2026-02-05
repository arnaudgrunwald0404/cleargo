-- ============================================================================
-- HAPPINESS AUTOMATION FRAMEWORK
-- ============================================================================
-- This migration creates the schema for the "Happiness" automation system.
-- 
-- The vision:
-- 1. Define a segment of users a feature is intended for
-- 2. Identify users in that segment who aren't using the feature
-- 3. Trigger automated actions (Pendo guides, CSM nudges, etc.)
-- 4. Track the effectiveness of these interventions
-- ============================================================================

-- ============================================================================
-- HAPPINESS TRIGGER TYPES
-- ============================================================================

-- Types of conditions that can trigger a happiness automation
CREATE TYPE happiness_trigger_type AS ENUM (
  'segment_non_usage',     -- Users in segment X haven't used feature Y
  'usage_drop',            -- Usage has dropped below threshold
  'negative_feedback',     -- Survey response below threshold
  'feature_struggle',      -- High error rate or abandonment
  'time_since_launch'      -- X days after launch with low adoption
);

-- Types of actions that can be taken
CREATE TYPE happiness_action_type AS ENUM (
  'pendo_guide',           -- Show a Pendo in-app guide (tooltip, lightbox, etc.)
  'pendo_nps',             -- Trigger NPS/satisfaction survey
  'csm_notification',      -- Notify CSM to reach out
  'slack_alert',           -- Send alert to Slack channel
  'email_campaign',        -- Trigger email campaign (coming soon)
  'custom_webhook'         -- Call custom webhook (coming soon)
);

-- Status of an automation rule
CREATE TYPE happiness_automation_status AS ENUM (
  'draft',                 -- Being configured
  'pending_approval',      -- Waiting for approval
  'active',                -- Live and running
  'paused',                -- Temporarily paused
  'completed',             -- Finished (time-bound automations)
  'archived'               -- No longer in use
);

-- Status of an individual action execution
CREATE TYPE happiness_action_execution_status AS ENUM (
  'pending',               -- Queued for execution
  'in_progress',           -- Currently executing
  'completed',             -- Successfully completed
  'failed',                -- Execution failed
  'cancelled'              -- Cancelled before completion
);

-- ============================================================================
-- HAPPINESS AUTOMATION RULES
-- ============================================================================
-- Defines the automation rules for a HEART metric

CREATE TABLE happiness_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to HEART metric (can also be standalone)
  epic_heart_metric_id UUID REFERENCES epic_heart_metrics(id) ON DELETE CASCADE,
  
  -- Or link directly to an epic (for non-HEART automations)
  epic_id UUID REFERENCES epic(id) ON DELETE CASCADE,
  
  -- Rule definition
  name TEXT NOT NULL,
  description TEXT,
  
  -- Trigger configuration
  trigger_type happiness_trigger_type NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- Example trigger_config for 'segment_non_usage':
  -- {
  --   "segment_id": "abc123",
  --   "feature_id": "def456",          -- Pendo feature tag
  --   "event_ids": ["event1", "event2"], -- Or track events
  --   "lookback_days": 30,
  --   "min_segment_size": 10
  -- }
  
  -- Action configuration (what happens when triggered)
  action_type happiness_action_type NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  -- Example action_config for 'pendo_guide':
  -- {
  --   "guide_id": "pendo-guide-123",
  --   "target_segment_id": "segment-for-guide",
  --   "activation_mode": "auto" | "manual"
  -- }
  -- Example action_config for 'csm_notification':
  -- {
  --   "notification_channel": "slack" | "email",
  --   "slack_channel_id": "#csm-alerts",
  --   "message_template": "Customer {{account_name}} hasn't used {{feature_name}}",
  --   "include_account_details": true
  -- }
  
  -- Execution settings
  status happiness_automation_status NOT NULL DEFAULT 'draft',
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_interval_days INTEGER, -- Run every X days if recurring
  max_executions_per_user INTEGER DEFAULT 1, -- Max times to trigger per user
  cooldown_days INTEGER DEFAULT 7, -- Don't retrigger for X days after action
  
  -- Approval workflow
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_evaluated_at TIMESTAMPTZ,
  
  -- At least one link must exist
  CONSTRAINT happiness_rule_link CHECK (
    epic_heart_metric_id IS NOT NULL OR epic_id IS NOT NULL
  )
);

-- ============================================================================
-- HAPPINESS TARGET AUDIENCES
-- ============================================================================
-- Stores the computed list of users who match the trigger criteria

CREATE TABLE happiness_target_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES happiness_automation_rules(id) ON DELETE CASCADE,
  
  -- Snapshot info
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Audience details
  pendo_visitor_id TEXT NOT NULL,
  pendo_account_id TEXT,
  
  -- User details (denormalized for easy access)
  visitor_email TEXT,
  account_name TEXT,
  
  -- Status tracking
  has_been_actioned BOOLEAN NOT NULL DEFAULT false,
  actioned_at TIMESTAMPTZ,
  
  -- Outcome tracking
  converted_at TIMESTAMPTZ, -- When they started using the feature
  
  -- Unique per rule + visitor
  UNIQUE(rule_id, pendo_visitor_id)
);

-- ============================================================================
-- HAPPINESS ACTION EXECUTIONS
-- ============================================================================
-- Tracks individual action executions

CREATE TABLE happiness_action_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES happiness_automation_rules(id) ON DELETE CASCADE,
  target_audience_id UUID REFERENCES happiness_target_audiences(id) ON DELETE SET NULL,
  
  -- Execution details
  status happiness_action_execution_status NOT NULL DEFAULT 'pending',
  action_type happiness_action_type NOT NULL,
  
  -- Action-specific data
  action_payload JSONB NOT NULL DEFAULT '{}',
  -- For pendo_guide: { guide_id, visitor_id }
  -- For csm_notification: { csm_email, message, account_id }
  
  -- Results
  result_data JSONB,
  -- For pendo_guide: { guide_shown: true, clicked: false }
  -- For csm_notification: { slack_ts, email_sent: true }
  
  error_message TEXT,
  
  -- Timestamps
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- HAPPINESS AUTOMATION METRICS
-- ============================================================================
-- Tracks the effectiveness of automations over time

CREATE TABLE happiness_automation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES happiness_automation_rules(id) ON DELETE CASCADE,
  
  -- Metric snapshot date
  snapshot_date DATE NOT NULL,
  
  -- Audience metrics
  total_in_segment INTEGER NOT NULL DEFAULT 0,
  total_non_users INTEGER NOT NULL DEFAULT 0,
  
  -- Action metrics
  actions_triggered INTEGER NOT NULL DEFAULT 0,
  actions_completed INTEGER NOT NULL DEFAULT 0,
  actions_failed INTEGER NOT NULL DEFAULT 0,
  
  -- Outcome metrics
  conversions INTEGER NOT NULL DEFAULT 0, -- Users who started using feature
  conversion_rate DECIMAL(5,4), -- conversions / actions_completed
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(rule_id, snapshot_date)
);

-- ============================================================================
-- CSM NUDGE QUEUE
-- ============================================================================
-- Queue of nudges for CSMs to action (human-in-the-loop)

CREATE TABLE happiness_csm_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES happiness_automation_rules(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES happiness_action_executions(id) ON DELETE SET NULL,
  
  -- Target
  pendo_account_id TEXT NOT NULL,
  account_name TEXT,
  
  -- Assignment
  assigned_csm_email TEXT,
  assigned_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'contacted', 'resolved', 'dismissed')),
  
  -- Context (what to tell the CSM)
  context JSONB NOT NULL DEFAULT '{}',
  -- {
  --   "epic_name": "New Dashboard Feature",
  --   "feature_name": "Advanced Analytics Tab",
  --   "segment_name": "Enterprise Customers",
  --   "non_user_count": 5,
  --   "days_since_launch": 30,
  --   "suggested_action": "Schedule a demo call to showcase the new analytics features"
  -- }
  
  -- Notes from CSM
  csm_notes TEXT,
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_happiness_rules_epic_metric ON happiness_automation_rules(epic_heart_metric_id);
CREATE INDEX idx_happiness_rules_epic ON happiness_automation_rules(epic_id);
CREATE INDEX idx_happiness_rules_status ON happiness_automation_rules(status);
CREATE INDEX idx_happiness_rules_trigger_type ON happiness_automation_rules(trigger_type);

CREATE INDEX idx_happiness_audiences_rule ON happiness_target_audiences(rule_id);
CREATE INDEX idx_happiness_audiences_visitor ON happiness_target_audiences(pendo_visitor_id);
CREATE INDEX idx_happiness_audiences_account ON happiness_target_audiences(pendo_account_id);
CREATE INDEX idx_happiness_audiences_actioned ON happiness_target_audiences(has_been_actioned);

CREATE INDEX idx_happiness_executions_rule ON happiness_action_executions(rule_id);
CREATE INDEX idx_happiness_executions_status ON happiness_action_executions(status);
CREATE INDEX idx_happiness_executions_scheduled ON happiness_action_executions(scheduled_for);

CREATE INDEX idx_happiness_metrics_rule ON happiness_automation_metrics(rule_id);
CREATE INDEX idx_happiness_metrics_date ON happiness_automation_metrics(snapshot_date);

CREATE INDEX idx_happiness_csm_nudges_rule ON happiness_csm_nudges(rule_id);
CREATE INDEX idx_happiness_csm_nudges_status ON happiness_csm_nudges(status);
CREATE INDEX idx_happiness_csm_nudges_csm ON happiness_csm_nudges(assigned_csm_email);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE happiness_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE happiness_target_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE happiness_action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE happiness_automation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE happiness_csm_nudges ENABLE ROW LEVEL SECURITY;

-- Admin-only access for automation rules
CREATE POLICY happiness_rules_admin_select ON happiness_automation_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

CREATE POLICY happiness_rules_admin_insert ON happiness_automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

CREATE POLICY happiness_rules_admin_update ON happiness_automation_rules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

CREATE POLICY happiness_rules_admin_delete ON happiness_automation_rules
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

-- Same policies for target audiences
CREATE POLICY happiness_audiences_admin_all ON happiness_target_audiences
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

-- Same policies for executions
CREATE POLICY happiness_executions_admin_all ON happiness_action_executions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

-- Same policies for metrics
CREATE POLICY happiness_metrics_admin_all ON happiness_automation_metrics
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

-- CSM nudges: CSMs can see their assigned nudges, admins see all
CREATE POLICY happiness_csm_nudges_select ON happiness_csm_nudges
  FOR SELECT TO authenticated
  USING (
    assigned_csm_email = auth.jwt() ->> 'email'
    OR EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

CREATE POLICY happiness_csm_nudges_update ON happiness_csm_nudges
  FOR UPDATE TO authenticated
  USING (
    assigned_csm_email = auth.jwt() ->> 'email'
    OR EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

CREATE POLICY happiness_csm_nudges_admin_insert ON happiness_csm_nudges
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_user au
      WHERE au.email = auth.jwt() ->> 'email'
        AND au.role IN ('SUPERADMIN', 'PRODUCT_OPS', 'CPO')
    )
  );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_happiness_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER happiness_rules_updated_at
  BEFORE UPDATE ON happiness_automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_happiness_updated_at();

CREATE TRIGGER happiness_csm_nudges_updated_at
  BEFORE UPDATE ON happiness_csm_nudges
  FOR EACH ROW EXECUTE FUNCTION update_happiness_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE happiness_automation_rules IS 
  'Defines automation rules for the Happiness category of HEART metrics. Rules can trigger in-app guides, CSM nudges, or other actions based on user behavior.';

COMMENT ON TABLE happiness_target_audiences IS 
  'Computed list of users who match the trigger criteria for a happiness automation rule. Refreshed periodically.';

COMMENT ON TABLE happiness_action_executions IS 
  'Tracks individual executions of happiness automation actions (guides shown, notifications sent, etc.)';

COMMENT ON TABLE happiness_automation_metrics IS 
  'Daily snapshots of automation effectiveness metrics (reach, conversions, etc.)';

COMMENT ON TABLE happiness_csm_nudges IS 
  'Queue of nudges for Customer Success Managers to action. Enables human-in-the-loop for sensitive customer outreach.';
