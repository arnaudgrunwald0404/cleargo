-- Ensure notification_log has 'error' column (missing when table was created from older migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notification_log'
          AND column_name = 'error'
    ) THEN
        ALTER TABLE notification_log ADD COLUMN error text;
    END IF;
END $$;
