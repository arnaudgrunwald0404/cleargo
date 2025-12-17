#!/usr/bin/env node
// Script to apply migration 0006_criterion_decision_owner_email.sql
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

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    const migrationFile = path.join(__dirname, 'supabase', 'migrations', '0006_criterion_decision_owner_email.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Applying migration: 0006_criterion_decision_owner_email.sql');
    console.log('SQL:', sql);
    
    // Execute using Supabase REST API
    // Note: Supabase JS client doesn't support raw SQL directly
    // We'll use the REST API with the service role key
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
        // Try alternative: use direct SQL execution via Supabase management API
        console.log('Trying alternative method...');
        
        // Extract project ref from URL
        const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
        const dbUrl = `postgresql://postgres.${projectRef}:${supabaseKey}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
        
        console.log('Please apply this SQL manually in your Supabase dashboard:');
        console.log('\n--- SQL to execute ---');
        console.log(sql);
        console.log('--- End SQL ---\n');
        console.log('Or run this command if you have psql installed:');
        console.log(`psql "${dbUrl}" -c "${sql.replace(/\n/g, ' ').trim()}"`);
        return;
    }

    const result = await response.json();
    console.log('✓ Migration applied successfully!', result);
}

applyMigration().catch(error => {
    console.error('Migration failed:', error);
    console.log('\nPlease apply the migration manually:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the SQL from: supabase/migrations/0006_criterion_decision_owner_email.sql');
    process.exit(1);
});







