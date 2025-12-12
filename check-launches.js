// Quick diagnostic script to check launch data
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
    console.error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey
);

async function checkLaunches() {
    const { data, error } = await supabase
        .from('launch')
        .select('id, name, tier, status, risk_level')
        .limit(10);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found', data.length, 'launches:');
        console.table(data);
    }
}

checkLaunches();
