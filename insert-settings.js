#!/usr/bin/env node
// Quick script to insert default app settings
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
    console.error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey
);

async function insertSettings() {
    const { data, error } = await supabase
        .from('app_settings')
        .upsert({
            id: 1,
            fallback_user_email: 'agrunwald@clearcompany.com',
            email_sender: 'noreply@tacticalsync.com',
            threshold_tier1: 0.9,
            threshold_tier2: 0.8,
            threshold_tier3: 0.7,
            staleness_days: 14,
            digest_schedule: 'MON_09_00',
            timezone: 'America/New_York',
            allowlisted_domains: ['clearcompany.com']
        })
        .select();

    if (error) {
        console.error('Error:', error);
        process.exit(1);
    }

    console.log('✅ Default settings inserted:', data);
}

insertSettings();
