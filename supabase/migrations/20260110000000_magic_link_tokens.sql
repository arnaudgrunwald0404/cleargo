-- Create table to track used magic link tokens
-- This replaces the file-based token store for better reliability in serverless environments

CREATE TABLE IF NOT EXISTS used_magic_link_tokens (
  jti text PRIMARY KEY,
  email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_used_tokens_expires_at ON used_magic_link_tokens(expires_at);

-- Enable RLS (though this table doesn't need user-specific access)
ALTER TABLE used_magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage tokens (for API routes)
DROP POLICY IF EXISTS "Service role can manage tokens" ON used_magic_link_tokens;
CREATE POLICY "Service role can manage tokens" ON used_magic_link_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to check tokens (for API routes)
DROP POLICY IF EXISTS "Authenticated users can check tokens" ON used_magic_link_tokens;
CREATE POLICY "Authenticated users can check tokens" ON used_magic_link_tokens
  FOR SELECT
  TO authenticated
  USING (true);

-- Function to clean up expired tokens (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM used_magic_link_tokens
  WHERE expires_at < now();
$$;

COMMENT ON TABLE used_magic_link_tokens IS 'Tracks magic link tokens to prevent reuse. Tokens expire after 30 minutes.';
COMMENT ON COLUMN used_magic_link_tokens.jti IS 'JWT ID (unique identifier for the token)';
COMMENT ON COLUMN used_magic_link_tokens.email IS 'Email address associated with the token';
COMMENT ON COLUMN used_magic_link_tokens.sent_at IS 'When the magic link email was sent';
COMMENT ON COLUMN used_magic_link_tokens.used_at IS 'When the token was marked as used (NULL if not yet used)';
COMMENT ON COLUMN used_magic_link_tokens.expires_at IS 'When the token expires (30 minutes after creation)';
