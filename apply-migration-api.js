#!/usr/bin/env node
// Script to apply migration using Supabase Management API
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
    process.exit(1);
}

async function applyMigration() {
    const migrationFile = path.join(__dirname, 'supabase', 'migrations', '20260110000000_magic_link_tokens.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Applying migration: 20260110000000_magic_link_tokens.sql\n');
    
    // Extract project ref
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
    
    // Try using Supabase REST API to execute SQL
    // Split SQL into individual statements
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Executing ${statements.length} SQL statements...\n`);
    
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.length === 0) continue;
        
        try {
            // Use Supabase REST API with service role key
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({ query: statement + ';' })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log(`Statement ${i + 1} failed, trying alternative method...`);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            console.log(`✓ Statement ${i + 1}/${statements.length} executed`);
        } catch (error) {
            console.error(`✗ Failed to execute statement ${i + 1}:`, error.message);
            console.log('\nPlease apply the migration manually via Supabase Dashboard:');
            console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
            console.log('2. Copy the SQL from:', migrationFile);
            console.log('3. Paste and run it');
            process.exit(1);
        }
    }
    
    console.log('\n✓ Migration applied successfully!');
}

applyMigration().catch(error => {
    console.error('Error:', error.message);
    console.log('\nPlease apply the migration manually via Supabase Dashboard.');
    process.exit(1);
});
