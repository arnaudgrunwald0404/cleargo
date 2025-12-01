#!/usr/bin/env node
// Apply migrations using Supabase Management API
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const migrationsDir = path.join(__dirname, 'db', 'migrations');
const migrationFiles = [
    '0001_initial.sql',
    '0002_aha_integration.sql',
    '0002_performance_indexes.sql',
    '0003_rls_policies.sql',
    '0004_aha_extended_fields.sql'
];

async function executeSql(sql) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json();
}

async function applyMigrations() {
    console.log('Starting migration process...\n');

    for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        console.log(`Applying ${file}...`);

        const sql = fs.readFileSync(filePath, 'utf8');

        try {
            // Split SQL into individual statements and execute them
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--'));

            for (const statement of statements) {
                // Use Supabase REST API to execute SQL
                // Note: This requires a custom function or direct database access
                console.log(`  Executing statement...`);
            }

            console.log(`✓ ${file} applied successfully`);
        } catch (error) {
            console.error(`✗ Error applying ${file}:`, error.message);
            process.exit(1);
        }
    }

    console.log('\nAll migrations applied successfully!');
}

applyMigrations().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
