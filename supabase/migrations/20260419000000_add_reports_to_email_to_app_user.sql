-- 20260419000000_add_reports_to_email_to_app_user.sql
-- Add reports_to_email column to app_user for manager/direct-report relationships.
-- Enables the team-members API to filter direct reports by manager email.

-- =============================================================================
-- 1. Add reports_to_email column to app_user
-- =============================================================================

ALTER TABLE public.app_user ADD COLUMN IF NOT EXISTS reports_to_email TEXT;

CREATE INDEX IF NOT EXISTS idx_app_user_reports_to ON public.app_user (reports_to_email);
