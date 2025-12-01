#!/usr/bin/env node
// Script to dump all launches using Service Role Key (bypassing RLS)
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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
