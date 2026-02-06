#!/usr/bin/env node
/**
 * Send a test Slack DM to a user by email.
 * Usage: node scripts/send-slack-test-dm.js [email]
 * Example: node scripts/send-slack-test-dm.js mpaiva@clearcompany.com
 */

require('dotenv').config({ path: '.env' });

const SLACK_API_BASE = 'https://slack.com/api';
const email = process.argv[2] || process.env.SLACK_TEST_EMAIL;

if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/send-slack-test-dm.js <email>');
    process.exit(1);
}

async function main() {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
        console.error('SLACK_BOT_TOKEN is required (set in .env)');
        process.exit(1);
    }

    const auth = { Authorization: `Bearer ${botToken}` };

    // Look up Slack user by email
    const lookupRes = await fetch(
        `${SLACK_API_BASE}/users.lookupByEmail?email=${encodeURIComponent(email.trim().toLowerCase())}`,
        { headers: auth }
    );
    const lookup = await lookupRes.json();
    if (!lookup.ok || !lookup.user?.id) {
        console.error('Slack lookup failed:', lookup.error || 'User not found in Slack workspace');
        process.exit(1);
    }
    const slackUserId = lookup.user.id;
    console.log(`Found Slack user: ${lookup.user.profile?.display_name || lookup.user.name} (${slackUserId})`);

    // Open DM conversation
    const openRes = await fetch(`${SLACK_API_BASE}/conversations.open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ users: slackUserId }),
    });
    const open = await openRes.json();
    if (!open.ok || !open.channel?.id) {
        console.error('Failed to open DM:', open.error);
        process.exit(1);
    }
    const channelId = open.channel.id;

    // Post test message
    const text = 'This is a test message from ClearGO. If you received this, Slack DM notifications are working.';
    const postRes = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
            channel: channelId,
            text,
        }),
    });
    const post = await postRes.json();
    if (!post.ok) {
        console.error('Failed to send message:', post.error);
        process.exit(1);
    }

    console.log('Test DM sent successfully to', email);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
