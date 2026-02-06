-- Store Slack notification theme (colors, emojis, branding) in app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS slack_theme jsonb DEFAULT NULL;
COMMENT ON COLUMN app_settings.slack_theme IS 'Slack notification theme: colors, emojis, branding (app name, logo URL, footer).';
