#!/usr/bin/env node
// Script to directly apply migration using pg library
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
    process.exit(1);
}

// Extract project ref
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

// Construct direct database URL (transaction mode)
const dbUrl = `postgresql://postgres.${projectRef}:${supabaseKey}@db.${projectRef}.supabase.co:5432/postgres`;

async function applyMigration() {
    const migrationFile = path.join(__dirname, 'supabase', 'migrations', '20260110000000_magic_link_tokens.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Applying migration: 20260110000000_magic_link_tokens.sql\n');
    console.log('Database URL:', dbUrl.replace(supabaseKey, '***'));
    
    // Try using psql with the correct connection string
    const { execSync } = require('child_process');
    
    try {
        console.log('Executing migration...\n');
        const result = execSync(`psql "${dbUrl}" -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
            encoding: 'utf8',
            stdio: 'inherit'
        });
        console.log('\n✓ Migration applied successfully!');
    } catch (error) {
        console.error('\n✗ Migration failed. Error:', error.message);
        console.log('\nPlease apply manually via Supabase Dashboard:');
        console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
        console.log('2. Copy the SQL from:', migrationFile);
        console.log('3. Paste and run it');
        process.exit(1);
    }
}

applyMigration().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
