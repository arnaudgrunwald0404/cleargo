#!/usr/bin/env node
// Create fallback user in app_user table
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createFallbackUser() {
    const { data, error } = await supabase
        .from('app_user')
        .upsert({
            email: 'agrunwald@clearcompany.com',
            name: 'Arnaud Grunwald',
            role: 'PRODUCT_OPS',
            is_active: true
        }, { onConflict: 'email' })
        .select();

    if (error) {
        console.error('Error:', error);
        process.exit(1);
    }

    console.log('✅ Fallback user created:', data);
}

createFallbackUser();
