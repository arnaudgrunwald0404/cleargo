-- Fix security issue: Set immutable search_path for functions flagged by Supabase
-- This prevents role-based search_path manipulation attacks

-- Fix update_webhook_url function
CREATE OR REPLACE FUNCTION public.update_webhook_url(new_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE app_settings
  SET aha_webhook_url = new_url,
      updated_at = now()
  WHERE id = 1;
END;
$$;

-- Fix my_items_for_user function
CREATE OR REPLACE FUNCTION public.my_items_for_user(p_email text)
RETURNS table (
  id uuid,
  status text,
  condition text,
  condition_due_date date,
  last_updated_at timestamptz,
  launch jsonb,
  criterion jsonb
)
LANGUAGE sql
SET search_path = public
AS $$
  with settings as (
    select pod_product_manager_mapping from app_settings where id = 1
  ),
  base as (
    select
      lcs.id,
      lcs.status,
      lcs.condition,
      lcs.condition_due_date,
      lcs.last_updated_at,
      -- resolved email per row
      case
        when c.decision_owner_email is null or c.decision_owner_email = '' then null
        when c.decision_owner_email <> '[name of pod''s product manager]'
             and position('pod' in lower(c.decision_owner_email)) = 0
          then lower(c.decision_owner_email)
        else lower(
          (
            select s.pod_product_manager_mapping ->> coalesce(
              la.pod,
              (la.aha_fields -> 'custom_fields' ->> 'dev_backlog_pod')
            ) from settings s
          )
        )
      end as resolved_email,
      -- embed launch subset (note: table is 'epic' but column name remains 'launch' for API compatibility)
      jsonb_build_object(
        'id', la.id,
        'name', la.name,
        'target_launch_date', la.target_launch_date,
        'tier', la.tier
      ) as launch,
      -- embed criterion subset
      jsonb_build_object(
        'label', c.label,
        'category', c.category
      ) as criterion
    from launch_criterion_status lcs
    join epic la on la.id = lcs.launch_id
    join criterion c on c.id = lcs.criterion_id
  )
  select id, status, condition, condition_due_date, last_updated_at, launch, criterion
  from base
  where resolved_email = lower(p_email)
  order by last_updated_at desc;
$$;

