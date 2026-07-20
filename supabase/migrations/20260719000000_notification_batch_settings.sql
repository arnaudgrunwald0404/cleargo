-- Notification batch (CLEARGO-I-5, I-9) config.
-- I-5: emails that get pinged when a launch's FIRST comment has no @mention
--      (the epic PM is resolved automatically; these are the extra watchers,
--       e.g. Dan / the product lead).
-- I-9: the final "master approver(s)" notified only once every department
--      gate criterion on an epic has been signed off.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS orphan_comment_watcher_emails jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS master_approver_emails jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.app_settings.orphan_comment_watcher_emails IS
  'Emails notified when the first comment on a criterion has no @mention (I-5). The epic PM is added automatically.';
COMMENT ON COLUMN public.app_settings.master_approver_emails IS
  'Final Go/No-Go approver emails, notified only after every department gate on an epic is signed off (I-9).';
