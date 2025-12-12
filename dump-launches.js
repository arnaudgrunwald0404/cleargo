#!/usr/bin/env node
// Script to dump all launches using Service Role Key (bypassing RLS)
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

async function dumpLaunches() {
    console.log('Fetching all launches...');
    const { data, error } = await supabase
        .from('launch')
        .select('id, name, aha_id, tier, status, created_at, owner_id, owner_email');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${data.length} launches:`);
    console.table(data);
}

dumpLaunches();
