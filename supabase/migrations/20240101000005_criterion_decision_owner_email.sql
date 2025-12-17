-- 0006_criterion_decision_owner_email.sql
-- Add decision_owner_email field to criterion table to store email or placeholder

ALTER TABLE criterion
  ADD COLUMN IF NOT EXISTS decision_owner_email text;

COMMENT ON COLUMN criterion.decision_owner_email IS 'Email address of decision owner, or special placeholder "[name of pod''s product manager]" which will be resolved at launch level based on pod';



