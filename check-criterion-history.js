#!/usr/bin/env node
// Check when a specific criterion was last updated
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCriterionHistory(epicId, criterionLabel) {
    console.log(`\n🔍 Checking history for: "${criterionLabel}" in epic ${epicId}\n`);
    
    // Find the criterion
    const { data: statuses } = await supabase
        .from('epic_criterion_status')
        .select(`
            *,
            criterion:criterion_id (
                id,
                label,
                category
            )
        `)
        .eq('epic_id', epicId);
    
    const criterion = statuses?.find(s => 
        s.criterion?.label?.toLowerCase().includes('packaging') &&
        s.criterion?.label?.toLowerCase().includes('pricing')
    );
    
    if (!criterion) {
        console.log('❌ Criterion not found');
        return;
    }
    
    console.log(`📋 Criterion Details:`);
    console.log(`   ID: ${criterion.id}`);
    console.log(`   Label: ${criterion.criterion.label}`);
    console.log(`   Current Status: ${criterion.status || 'NOT_SET'}`);
    console.log(`   Last Updated: ${criterion.last_updated_at || 'NOT SET'}`);
    console.log(`   Last Updated By: ${criterion.last_updated_by || 'NOT SET'}`);
    
    // Check audit log
    const { data: auditLogs } = await supabase
        .from('audit_log')
        .select('*')
        .eq('entity_type', 'epic_criterion_status')
        .eq('entity_id', criterion.id)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (auditLogs && auditLogs.length > 0) {
        console.log(`\n📜 Audit Log (last 10 changes):`);
        auditLogs.forEach((log, idx) => {
            console.log(`   ${idx + 1}. ${log.created_at}`);
            console.log(`      Actor: ${log.actor_id}`);
            if (log.json_diff?.status) {
                console.log(`      Status: ${log.json_diff.status.old || 'null'} → ${log.json_diff.status.new || 'null'}`);
            }
        });
    } else {
        console.log(`\n📜 No audit log entries found`);
    }
    
    // Check epic update history
    const { data: epic } = await supabase
        .from('epic')
        .select('updated_at, readiness_score, readiness_status')
        .eq('id', epicId)
        .single();
    
    if (epic) {
        console.log(`\n📊 Epic Readiness History:`);
        console.log(`   Last Updated: ${epic.updated_at}`);
        console.log(`   Current Readiness Score: ${epic.readiness_score}`);
        console.log(`   Current Readiness Status: ${epic.readiness_status}`);
        
        // Compare timestamps
        if (criterion.last_updated_at && epic.updated_at) {
            const criterionTime = new Date(criterion.last_updated_at);
            const epicTime = new Date(epic.updated_at);
            
            console.log(`\n⏰ Timeline Analysis:`);
            console.log(`   Criterion last updated: ${criterionTime.toISOString()}`);
            console.log(`   Epic last updated: ${epicTime.toISOString()}`);
            
            if (criterionTime > epicTime) {
                console.log(`   ⚠️  Criterion was updated AFTER epic readiness was last calculated!`);
                console.log(`   ⚠️  This means the readiness score is stale and needs recalculation.`);
            } else {
                console.log(`   ✅ Epic readiness was updated after criterion change`);
            }
        }
    }
    
    console.log(`\n✅ Check complete!\n`);
}

const epicId = process.argv[2] || 'c5060478-7afa-4f4e-82fb-9ae0df525cb6';
checkCriterionHistory(epicId, 'Packaging & Pricing').catch(console.error);
