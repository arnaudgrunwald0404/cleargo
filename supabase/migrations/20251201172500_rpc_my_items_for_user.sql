-- 20251201172500_rpc_my_items_for_user.sql
-- RPC to return "my items" filtered in SQL using decision_owner rules and pod->PM mapping
-- NOTE: Uses 'epic' table (renamed from 'launch' in migration 0018)

create or replace function my_items_for_user(p_email text)
returns table (
  id uuid,
  status text,
  condition text,
  condition_due_date date,
  last_updated_at timestamptz,
  launch jsonb,
  criterion jsonb
)
language sql
as $$
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

-- Permissions
grant execute on function my_items_for_user(text) to authenticated;
