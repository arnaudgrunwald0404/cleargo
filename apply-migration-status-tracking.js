const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  const migrationFile = path.join(__dirname, 'supabase', 'migrations', '20260119000000_add_status_tracking_to_comments.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');
  
  console.log('Applying migration: 20260119000000_add_status_tracking_to_comments.sql\n');
  
  // Extract project ref from URL
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
  
  // Construct direct database URL
  const dbUrl = `postgresql://postgres.${projectRef}:${supabaseKey}@db.${projectRef}.supabase.co:5432/postgres`;
  
  console.log('Database URL:', dbUrl.replace(supabaseKey, '***'));
  
  // Use psql to execute the migration
  const { execSync } = require('child_process');
  
  try {
    console.log('Executing migration...\n');
    // Write SQL to a temp file to avoid shell escaping issues
    const tempFile = path.join(__dirname, '.temp-migration.sql');
    fs.writeFileSync(tempFile, sql);
    
    const result = execSync(`psql "${dbUrl}" -f "${tempFile}"`, {
      encoding: 'utf8',
      stdio: 'inherit'
    });
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
    
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
