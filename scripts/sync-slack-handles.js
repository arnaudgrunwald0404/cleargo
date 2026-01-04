#!/usr/bin/env node
/**
 * Script to sync Slack handles for all users
 * This can be run manually or scheduled as a cron job
 * 
 * Usage: node scripts/sync-slack-handles.js
 */

require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

const SLACK_API_BASE = 'https://slack.com/api';

async function getSlackUserByEmail(email) {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
        throw new Error('SLACK_BOT_TOKEN is required');
    }

    const response = await fetch(
        `${SLACK_API_BASE}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
        {
            headers: {
                Authorization: `Bearer ${botToken}`,
            },
        }
    );

    const data = await response.json();

    if (!data.ok) {
        if (data.error === 'users_not_found') {
            return null; // User not found in Slack
        }
        throw new Error(`Slack API error: ${data.error}`);
    }

    return data;
}

// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
    console.error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncSlackHandles() {
    const result = {
        synced: 0,
        errors: 0,
        total: 0,
        details: [],
    };

    try {
        // Get all users from database
        const { data: users, error: usersError } = await supabase
            .from('app_user')
            .select('id, email, slack_handle')
            .not('email', 'is', null);

        if (usersError) {
            throw new Error(`Failed to fetch users: ${usersError.message}`);
        }

        if (!users || users.length === 0) {
            console.log('No users found to sync');
            return result;
        }

        result.total = users.length;
        console.log(`Found ${result.total} users to sync...\n`);

        // For each user with email, look up Slack user by email
        for (const user of users) {
            try {
                const slackUserResponse = await getSlackUserByEmail(user.email);

                if (slackUserResponse && slackUserResponse.user && slackUserResponse.user.id) {
                    // Update slack_handle in database
                    const { error: updateError } = await supabase
                        .from('app_user')
                        .update({ slack_handle: slackUserResponse.user.id })
                        .eq('id', user.id);

                    if (updateError) {
                        console.error(`❌ Error updating ${user.email}:`, updateError.message);
                        result.errors++;
                        result.details.push({
                            email: user.email,
                            error: updateError.message,
                        });
                    } else {
                        console.log(`✅ Synced ${user.email} → ${slackUserResponse.user.id}`);
                        result.synced++;
                        result.details.push({
                            email: user.email,
                            slack_handle: slackUserResponse.user.id,
                        });
                    }
                } else {
                    result.details.push({
                        email: user.email,
                        error: 'User not found in Slack workspace',
                    });
                }
            } catch (err) {
                console.error(`❌ Error looking up ${user.email}:`, err.message);
                result.errors++;
                result.details.push({
                    email: user.email,
                    error: err.message || 'Failed to lookup Slack user',
                });
            }
        }

        return result;
    } catch (error) {
        throw error;
    }
}

async function main() {
    try {
        console.log('🚀 Starting Slack handle sync...\n');
        const result = await syncSlackHandles();
        
        console.log('\n📊 Sync Summary:');
        console.log(`   Total users: ${result.total}`);
        console.log(`   ✅ Successfully synced: ${result.synced}`);
        console.log(`   ❌ Errors: ${result.errors}`);
        console.log(`   ⏭️  Not found in Slack: ${result.total - result.synced - result.errors}`);
        
        const withHandles = result.details.filter(d => d.slack_handle);
        const withErrors = result.details.filter(d => d.error && !d.slack_handle);
        
        if (withHandles.length > 0) {
            console.log('\n✅ Users with Slack handles synced:');
            withHandles.forEach((detail, index) => {
                console.log(`   ${index + 1}. ${detail.email} → ${detail.slack_handle}`);
            });
        }
        
        if (withErrors.length > 0) {
            console.log('\n❌ Users with errors:');
            withErrors.forEach((detail, index) => {
                console.log(`   ${index + 1}. ${detail.email}: ${detail.error}`);
            });
        }
        
        console.log('\n✅ Sync completed!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Sync failed:', error);
        process.exit(1);
    }
}

main();

