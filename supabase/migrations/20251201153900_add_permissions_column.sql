-- Add permissions column to app_settings for capability→roles overrides
-- This supports the Admin > Settings > Permissions matrix UI.

alter table app_settings
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column app_settings.permissions is 'RBAC overrides: capability id -> array of role ids';
