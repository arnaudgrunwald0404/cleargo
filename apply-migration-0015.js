#!/usr/bin/env node
// Script to apply migration 0015_add_rating_timing_to_criterion.sql
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

async function applyMigration() {
    const migrationFile = path.join(__dirname, 'supabase', 'migrations', '0015_add_rating_timing_to_criterion.sql');
    
    if (!fs.existsSync(migrationFile)) {
        console.error(`Migration file not found: ${migrationFile}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Applying migration 0015_add_rating_timing_to_criterion.sql...');
    console.log('This will add the rating_timing column to the criterion table.\n');

    // Extract project ref from Supabase URL
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
        console.error('Could not extract project reference from Supabase URL');
        process.exit(1);
    }

    // Use Supabase Management API to execute SQL
    // Note: This requires direct database access or Supabase CLI
    console.log('To apply this migration, you can:');
    console.log('1. Use Supabase CLI: supabase db push');
    console.log('2. Apply directly via SQL editor in Supabase dashboard');
    console.log('3. Use psql with connection string\n');
    
    console.log('SQL to execute:');
    console.log('---');
    console.log(sql);
    console.log('---\n');
    
    console.log('Or run this command (if you have psql and SUPABASE_DB_PASSWORD set):');
    const dbUrl = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD || '[PASSWORD]'}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
    console.log(`psql "${dbUrl.replace(/\[PASSWORD\]/, 'YOUR_PASSWORD')}" -f ${migrationFile}`);
}

applyMigration().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

