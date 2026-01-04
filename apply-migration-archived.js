#!/usr/bin/env node
// Script to apply the archived column migration to release_schedule table
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    console.log('Applying archived column migration to release_schedule table...\n');

    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20251207000000_add_archived_to_release_schedule.sql');
    
    if (!fs.existsSync(migrationPath)) {
        console.error(`Migration file not found: ${migrationPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL into statements and execute them
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
        if (statement.length === 0) continue;
        
        console.log(`Executing: ${statement.substring(0, 60)}...`);
        
        try {
            // Use Supabase REST API to execute SQL via RPC
            // Note: This requires exec_sql RPC function or direct database access
            // For now, we'll use a workaround with the Supabase client
            const { data, error } = await supabase.rpc('exec_sql', { 
                sql_string: statement + ';' 
            });

            if (error) {
                // If exec_sql doesn't exist, try direct query (may not work for DDL)
                console.warn(`RPC exec_sql failed, trying alternative method...`);
                console.warn(`Error: ${error.message}`);
                console.warn(`\nPlease apply this migration manually via Supabase dashboard or CLI:\n`);
                console.warn(sql);
                process.exit(1);
            } else {
                console.log(`✓ Statement executed successfully`);
            }
        } catch (err) {
            console.error(`✗ Error executing statement:`, err.message);
            console.error(`\nPlease apply this migration manually via Supabase dashboard or CLI:\n`);
            console.error(sql);
            process.exit(1);
        }
    }

    console.log('\n✓ Migration applied successfully!');
}

applyMigration().catch(error => {
    console.error('Migration failed:', error);
    console.error('\nPlease apply this migration manually via Supabase dashboard or CLI.');
    process.exit(1);
});

