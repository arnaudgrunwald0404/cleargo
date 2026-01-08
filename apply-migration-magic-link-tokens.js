#!/usr/bin/env node
// Script to apply migration 20260110000000_magic_link_tokens.sql
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in .env');
    process.exit(1);
}

async function applyMigration() {
    const migrationFile = path.join(__dirname, 'supabase', 'migrations', '20260110000000_magic_link_tokens.sql');
    
    if (!fs.existsSync(migrationFile)) {
        console.error(`Migration file not found: ${migrationFile}`);
        process.exit(1);
    }
    
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Applying migration: 20260110000000_magic_link_tokens.sql\n');
    
    // Extract project ref from URL
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
    
    console.log('To apply this migration, you have two options:\n');
    console.log('Option 1: Use Supabase Dashboard (Recommended)');
    console.log('1. Go to https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('2. Copy and paste the SQL below');
    console.log('3. Click "Run"\n');
    console.log('--- SQL to execute ---');
    console.log(sql);
    console.log('--- End SQL ---\n');
    
    console.log('Option 2: Use psql (if you have it installed)');
    const dbUrl = `postgresql://postgres.${projectRef}:${supabaseKey}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
    console.log(`psql "${dbUrl}" -f "${migrationFile}"\n`);
    
    // Try to use Supabase REST API if exec_sql function exists
    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Try to execute via RPC if available
        const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
        
        if (!error) {
            console.log('✓ Migration applied successfully via RPC!');
            return;
        }
    } catch (err) {
        // RPC not available, that's okay
    }
    
    console.log('Note: Automatic execution via API is not available.');
    console.log('Please use Option 1 (Supabase Dashboard) to apply the migration.');
}

applyMigration().catch(error => {
    console.error('Error:', error.message);
    console.log('\nPlease apply the migration manually using the instructions above.');
    process.exit(1);
});
