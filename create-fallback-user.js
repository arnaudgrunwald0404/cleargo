#!/usr/bin/env node
// Create fallback user in app_user table
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

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
