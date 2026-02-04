#!/usr/bin/env node
/**
 * Delete a Slack message posted by the bot.
 * Usage: node scripts/delete-slack-message.js [channel_id] [message_ts]
 * Example (from URL .../archives/C03BFJTFKTP/p1769766223389419):
 *   node scripts/delete-slack-message.js C03BFJTFKTP 1769766223.389419
 */

require('dotenv').config({ path: '.env' });

const SLACK_API_BASE = 'https://slack.com/api';

const channel = process.argv[2] || 'C03BFJTFKTP';
const ts = process.argv[3] || '1769766223.389419';

async function main() {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
        console.error('SLACK_BOT_TOKEN is required (set in .env)');
        process.exit(1);
    }

    const response = await fetch(`${SLACK_API_BASE}/chat.delete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({ channel, ts }),
    });

    const data = await response.json();

    if (!data.ok) {
        console.error('Slack API error:', data.error);
        process.exit(1);
    }

    console.log('Message deleted.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
