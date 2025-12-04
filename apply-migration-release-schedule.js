#!/usr/bin/env node
// Script to apply the release_schedule table migration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function applyMigration() {
    console.log('Applying release_schedule table migration...\n');

    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20251127000000_create_release_schedule.sql');
    
    if (!fs.existsSync(migrationPath)) {
        console.error(`Migration file not found: ${migrationPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
        // Use Supabase REST API to execute SQL via PostgREST
        // We'll use the REST API directly since Supabase JS client doesn't support raw SQL
        
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`
            },
            body: JSON.stringify({ sql_string: sql })
        });

        if (!response.ok) {
            // If exec_sql doesn't exist, try direct SQL execution via pg REST API
            // Alternative: use the Supabase dashboard SQL editor or psql
            console.log('Note: exec_sql RPC function may not exist. Trying alternative method...');
            console.log('\nPlease apply this migration manually:');
            console.log('1. Go to your Supabase Dashboard');
            console.log('2. Navigate to SQL Editor');
            console.log('3. Copy and paste the following SQL:\n');
            console.log(sql);
            console.log('\nOr use psql with your database connection string.');
            return;
        }

        const result = await response.json();
        console.log('✓ Migration applied successfully!');
        console.log('Result:', result);
    } catch (error) {
        console.error('Error applying migration:', error.message);
        console.log('\nPlease apply this migration manually:');
        console.log('1. Go to your Supabase Dashboard');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy and paste the following SQL:\n');
        console.log(sql);
        process.exit(1);
    }
}

applyMigration().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});





