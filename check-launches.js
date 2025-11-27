// Quick diagnostic script to check launch data
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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
