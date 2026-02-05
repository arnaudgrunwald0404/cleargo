-- Allow deleting app_user rows by setting referencing columns to NULL in epic_criterion_status.
-- Table was originally launch_criterion_status; constraint names were kept on rename.

ALTER TABLE public.epic_criterion_status
  DROP CONSTRAINT IF EXISTS launch_criterion_status_decision_owner_id_fkey,
  DROP CONSTRAINT IF EXISTS launch_criterion_status_condition_owner_id_fkey,
  DROP CONSTRAINT IF EXISTS launch_criterion_status_last_updated_by_fkey;

ALTER TABLE public.epic_criterion_status
  ADD CONSTRAINT epic_criterion_status_decision_owner_id_fkey
    FOREIGN KEY (decision_owner_id) REFERENCES public.app_user(id) ON DELETE SET NULL,
  ADD CONSTRAINT epic_criterion_status_condition_owner_id_fkey
    FOREIGN KEY (condition_owner_id) REFERENCES public.app_user(id) ON DELETE SET NULL,
  ADD CONSTRAINT epic_criterion_status_last_updated_by_fkey
    FOREIGN KEY (last_updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;
