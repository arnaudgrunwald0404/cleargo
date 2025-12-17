-- 0003_rls_policies.sql
-- Enable RLS and add basic policies for authenticated users

-- Enable RLS on all tables
alter table app_user enable row level security;
alter table product enable row level security;
alter table launch enable row level security;
alter table criterion enable row level security;
alter table launch_criterion_status enable row level security;
alter table decision_snapshot enable row level security;
alter table notification_log enable row level security;
alter table audit_log enable row level security;
alter table app_settings enable row level security;
alter table roster enable row level security;

-- Policy: Allow authenticated users to read everything (Portfolio view, etc.)
drop policy if exists "Authenticated users can select app_user" on app_user;
create policy "Authenticated users can select app_user" on app_user for select to authenticated using (true);
drop policy if exists "Authenticated users can select product" on product;
create policy "Authenticated users can select product" on product for select to authenticated using (true);
drop policy if exists "Authenticated users can select launch" on launch;
create policy "Authenticated users can select launch" on launch for select to authenticated using (true);
drop policy if exists "Authenticated users can select criterion" on criterion;
create policy "Authenticated users can select criterion" on criterion for select to authenticated using (true);
drop policy if exists "Authenticated users can select launch_criterion_status" on launch_criterion_status;
create policy "Authenticated users can select launch_criterion_status" on launch_criterion_status for select to authenticated using (true);
drop policy if exists "Authenticated users can select decision_snapshot" on decision_snapshot;
create policy "Authenticated users can select decision_snapshot" on decision_snapshot for select to authenticated using (true);
drop policy if exists "Authenticated users can select notification_log" on notification_log;
create policy "Authenticated users can select notification_log" on notification_log for select to authenticated using (true);
drop policy if exists "Authenticated users can select audit_log" on audit_log;
create policy "Authenticated users can select audit_log" on audit_log for select to authenticated using (true);
drop policy if exists "Authenticated users can select app_settings" on app_settings;
create policy "Authenticated users can select app_settings" on app_settings for select to authenticated using (true);
drop policy if exists "Authenticated users can select roster" on roster;
create policy "Authenticated users can select roster" on roster for select to authenticated using (true);

-- Policy: Allow authenticated users to insert/update/delete (Basic "Auth Users" trust for Sprint 1)
-- Note: Strict RBAC (e.g., only Product Ops can edit Settings) will be enforced in application layer or future DB policies.
drop policy if exists "Authenticated users can insert app_user" on app_user;
create policy "Authenticated users can insert app_user" on app_user for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update app_user" on app_user;
create policy "Authenticated users can update app_user" on app_user for update to authenticated using (true);

drop policy if exists "Authenticated users can insert product" on product;
create policy "Authenticated users can insert product" on product for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update product" on product;
create policy "Authenticated users can update product" on product for update to authenticated using (true);

drop policy if exists "Authenticated users can insert launch" on launch;
create policy "Authenticated users can insert launch" on launch for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update launch" on launch;
create policy "Authenticated users can update launch" on launch for update to authenticated using (true);
drop policy if exists "Authenticated users can delete launch" on launch;
create policy "Authenticated users can delete launch" on launch for delete to authenticated using (true);

drop policy if exists "Authenticated users can insert criterion" on criterion;
create policy "Authenticated users can insert criterion" on criterion for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update criterion" on criterion;
create policy "Authenticated users can update criterion" on criterion for update to authenticated using (true);

drop policy if exists "Authenticated users can insert launch_criterion_status" on launch_criterion_status;
create policy "Authenticated users can insert launch_criterion_status" on launch_criterion_status for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update launch_criterion_status" on launch_criterion_status;
create policy "Authenticated users can update launch_criterion_status" on launch_criterion_status for update to authenticated using (true);

drop policy if exists "Authenticated users can insert decision_snapshot" on decision_snapshot;
create policy "Authenticated users can insert decision_snapshot" on decision_snapshot for insert to authenticated with check (true);

drop policy if exists "Authenticated users can insert notification_log" on notification_log;
create policy "Authenticated users can insert notification_log" on notification_log for insert to authenticated with check (true);

drop policy if exists "Authenticated users can insert audit_log" on audit_log;
create policy "Authenticated users can insert audit_log" on audit_log for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update app_settings" on app_settings;
create policy "Authenticated users can update app_settings" on app_settings for update to authenticated using (true);

drop policy if exists "Authenticated users can insert roster" on roster;
create policy "Authenticated users can insert roster" on roster for insert to authenticated with check (true);
drop policy if exists "Authenticated users can update roster" on roster;
create policy "Authenticated users can update roster" on roster for update to authenticated using (true);
drop policy if exists "Authenticated users can delete roster" on roster;
create policy "Authenticated users can delete roster" on roster for delete to authenticated using (true);
