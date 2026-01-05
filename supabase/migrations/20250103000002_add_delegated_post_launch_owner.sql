-- Add delegated_post_launch_owner_id to epic_success_configs
-- Allows delegating post-launch owner responsibility similar to criteria delegation

ALTER TABLE public.epic_success_configs
ADD COLUMN IF NOT EXISTS delegated_post_launch_owner_id uuid REFERENCES public.app_user(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_epic_success_configs_delegated_owner 
  ON public.epic_success_configs(delegated_post_launch_owner_id);

COMMENT ON COLUMN public.epic_success_configs.delegated_post_launch_owner_id IS 'Delegated post-launch owner (overrides post_launch_owner if set)';

