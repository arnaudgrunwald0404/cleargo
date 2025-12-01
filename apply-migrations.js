#!/usr/bin/env node
// Script to apply database migrations using Supabase credentials
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migrationsDir = path.join(__dirname, 'db', 'migrations');
const migrationFiles = [
    '0001_initial.sql',
    '0002_aha_integration.sql',
    '0002_performance_indexes.sql',
    '0003_rls_policies.sql',
    '0004_aha_extended_fields.sql'
];

async function applyMigrations() {
    console.log('Starting migration process...\n');

    for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        console.log(`Applying ${file}...`);

        const sql = fs.readFileSync(filePath, 'utf8');

        // Execute the SQL using Supabase RPC or direct query
        // Note: Supabase JS client doesn't support raw SQL execution directly
        // We need to use the REST API or construct the database URL

        const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

        if (error) {
            console.error(`Error applying ${file}:`, error);
            // Continue with other migrations
        } else {
            console.log(`✓ ${file} applied successfully`);
        }
    }

    console.log('\nMigration process completed!');
}

applyMigrations().catch(console.error);
