-- Remove Slack channel C03BFJTFKTP from all tables (data cleanup).
-- This channel was used by mistake; default should come from .env or another channel.

-- app_settings: clear default channel if it was this ID
UPDATE app_settings
SET slack_default_channel = NULL
WHERE slack_default_channel = 'C03BFJTFKTP';

-- app_settings: remove any key in slack_channels whose value is this channel ID
UPDATE app_settings
SET slack_channels = (
    SELECT coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
    FROM jsonb_each(slack_channels) AS e(k, v)
    WHERE e.v::text <> '"C03BFJTFKTP"'
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_each(slack_channels) AS e(k, v)
    WHERE e.v::text = '"C03BFJTFKTP"'
);

-- epic: clear per-epic override if set to this channel
UPDATE epic
SET slack_channel = NULL
WHERE slack_channel = 'C03BFJTFKTP';

-- notification_log: clear stored channel for past entries (historical only)
UPDATE notification_log
SET slack_channel = NULL
WHERE slack_channel = 'C03BFJTFKTP';
