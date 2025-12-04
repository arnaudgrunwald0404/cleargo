-- 0020_make_refresh_token_nullable.sql
-- Make refresh_token nullable in google_calendar_integrations table
-- Google may not return a refresh_token on re-authorization if one already exists

-- Only alter if table exists (migration 0019 must be applied first)
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'google_calendar_integrations'
  ) THEN
    -- Check if column is NOT NULL before altering
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'google_calendar_integrations'
      AND column_name = 'refresh_token'
      AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE google_calendar_integrations 
        ALTER COLUMN refresh_token DROP NOT NULL;
      
      COMMENT ON COLUMN google_calendar_integrations.refresh_token IS 
        'OAuth refresh token. May be null if Google did not return one (e.g., on re-authorization when token already exists).';
    END IF;
  END IF;
END $$;

