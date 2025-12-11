#!/usr/bin/env node
// Script to apply migration 0017_add_email_templates.sql
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    const migrationFile = path.join(__dirname, 'supabase', 'migrations', '0017_add_email_templates.sql');
    
    if (!fs.existsSync(migrationFile)) {
        console.error(`Migration file not found: ${migrationFile}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Applying migration 0017_add_email_templates.sql...');
    console.log('SQL:', sql);
    console.log('\n');

    // Use Supabase REST API to execute SQL via RPC
    // Note: This requires a function in Supabase that can execute SQL
    // Alternatively, you can use psql directly or Supabase dashboard
    
    // For now, we'll use the REST API approach
    try {
        // Split SQL into statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            if (statement.length === 0) continue;
            
            // Use Supabase REST API
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({ sql_string: statement + ';' })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Error executing statement: ${errorText}`);
                // Try alternative: direct psql connection info
                console.log('\nAlternative: Apply this migration manually using:');
                console.log('1. Supabase Dashboard > SQL Editor');
                console.log('2. Or use psql with the connection string');
                console.log('\nSQL to execute:');
                console.log(statement + ';');
                throw new Error(`Failed to execute SQL: ${response.status}`);
            }
        }

        console.log('✓ Migration 0017_add_email_templates.sql applied successfully');
    } catch (error) {
        console.error('Error applying migration:', error.message);
        console.log('\nPlease apply this migration manually:');
        console.log('1. Go to Supabase Dashboard > SQL Editor');
        console.log('2. Copy and paste the SQL from: supabase/migrations/0017_add_email_templates.sql');
        console.log('3. Execute it');
        process.exit(1);
    }
}

applyMigration().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});






