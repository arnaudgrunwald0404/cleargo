-- 0001_seed.sql
-- Default settings and initial Product Ops fallback

insert into app_settings (id, threshold_tier1, threshold_tier2, threshold_tier3, staleness_days, digest_schedule, timezone, allowlisted_domains, fallback_user_email, email_sender)
values (1, 0.9, 0.8, 0.7, 14, 'MON_09_00', 'America/New_York', '{"clearcompany.com"}', 'agrunwald@clearcompany.com', 'noreply@tacticalsync.com')
on conflict (id) do update set
  threshold_tier1 = excluded.threshold_tier1,
  threshold_tier2 = excluded.threshold_tier2,
  threshold_tier3 = excluded.threshold_tier3,
  staleness_days = excluded.staleness_days,
  digest_schedule = excluded.digest_schedule,
  timezone = excluded.timezone,
  allowlisted_domains = excluded.allowlisted_domains,
  fallback_user_email = excluded.fallback_user_email,
  email_sender = excluded.email_sender,
  updated_at = now();

-- Optional: seed Product Ops fallback user (email-only placeholder)
insert into app_user (email, name, role)
values ('agrunwald@clearcompany.com', 'Product Ops Fallback', 'PRODUCT_OPS')
on conflict (email) do nothing;
