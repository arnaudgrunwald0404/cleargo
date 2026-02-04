-- Track when an epic's Aha record was not found (404) during field sync, so we can show a warning on /epics

ALTER TABLE epic
  ADD COLUMN IF NOT EXISTS aha_record_not_found boolean DEFAULT false;

COMMENT ON COLUMN epic.aha_record_not_found IS 'Set to true when Aha API returns 404 (Record not found) during epic field sync; cleared on successful sync.';
