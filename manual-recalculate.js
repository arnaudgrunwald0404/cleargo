#!/usr/bin/env node
// Manually trigger readiness recalculation for a specific epic
require('dotenv').config({ path: '.env.local' });

// Import the recompute function
const path = require('path');
const { recomputeEpicReadiness } = require('./src/lib/readiness.ts');

async function manualRecalculate(epicId) {
    console.log(`\n🔄 Manually recalculating readiness for epic: ${epicId}\n`);
    
    try {
        await recomputeEpicReadiness(epicId);
        console.log(`✅ Recalculation completed successfully!\n`);
        
        // Now check the updated score
        const { createClient } = require('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const supabase = require('@supabase/supabase-js').createClient(supabaseUrl, supabaseKey);
        
        const { data: epic } = await supabase
            .from('epic')
            .select('readiness_score, readiness_status, updated_at')
            .eq('id', epicId)
            .single();
        
        if (epic) {
            console.log(`📊 Updated Epic Readiness:`);
            console.log(`   Score: ${epic.readiness_score !== null && epic.readiness_score !== undefined ? `${Math.round(epic.readiness_score * 100)}%` : 'NOT SET'} (exact: ${epic.readiness_score})`);
            console.log(`   Status: ${epic.readiness_status || 'NOT SET'}`);
            console.log(`   Updated At: ${epic.updated_at || 'NOT SET'}`);
        }
        
    } catch (error) {
        console.error(`❌ Error during recalculation:`, error);
        console.error(`   Message: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
    }
}

const epicId = process.argv[2] || 'c5060478-7afa-4f4e-82fb-9ae0df525cb6';
manualRecalculate(epicId).catch(console.error);
