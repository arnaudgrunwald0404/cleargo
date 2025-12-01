-- Insert default app settings if not exists
INSERT INTO app_settings (id, fallback_user_email, email_sender)
VALUES (1, 'agrunwald@clearcompany.com', 'noreply@tacticalsync.com')
ON CONFLICT (id) DO UPDATE
SET fallback_user_email = EXCLUDED.fallback_user_email,
    email_sender = EXCLUDED.email_sender;
