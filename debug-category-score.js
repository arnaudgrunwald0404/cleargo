#!/usr/bin/env node
// Debug the Product Documentation category score calculation
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugCategoryScore(epicId) {
    console.log(`\n🔍 Debugging Product Documentation category score for epic: ${epicId}\n`);
    
    // Fetch epic
    const { data: epic } = await supabase
        .from('epic')
        .select('tier')
        .eq('id', epicId)
        .single();
    
    const tier = epic?.tier || 'TIER_3';
    
    // Fetch criteria statuses
    const { data: statuses } = await supabase
        .from('epic_criterion_status')
        .select(`
            *,
            criterion:criterion_id (
                id,
                label,
                category,
                gate,
                tier_applicability
            )
        `)
        .eq('epic_id', epicId);
    
    // Filter to Product Documentation category
    const productDocCriteria = statuses?.filter(s => 
        s.criterion?.category === 'Product Documentation'
    ) || [];
    
    console.log(`📋 Product Documentation Category Criteria (${productDocCriteria.length} total):\n`);
    
    const GATING_WEIGHT_MULTIPLIER = 3;
    const ANY_NOT_SET_CAP = 0.95;
    
    function statusToScore(status) {
        if (status === 'GO') return 1.0;
        if (status === 'CONDITIONAL_GO' || status === 'CONDITIONAL') return 0.5;
        return 0.0;
    }
    
    let sumScores = 0;
    let sumWeights = 0;
    let hasAnyNotSet = false;
    
    productDocCriteria.forEach((s, idx) => {
        const criterion = s.criterion;
        const status = s.status || 'NOT_SET';
        const isGate = criterion?.gate || false;
        const isSignoff = criterion?.label?.toLowerCase().includes('signoff');
        
        const score = statusToScore(status);
        const baseWeight = 1;
        const effectiveWeight = isGate ? baseWeight * GATING_WEIGHT_MULTIPLIER : baseWeight;
        
        if (status === 'NOT_SET') {
            hasAnyNotSet = true;
        }
        
        sumScores += score * effectiveWeight;
        sumWeights += effectiveWeight;
        
        console.log(`   ${idx + 1}. ${criterion.label}`);
        console.log(`      Status: ${status}`);
        console.log(`      Score: ${score}`);
        console.log(`      Gate: ${isGate ? 'Yes (3x weight)' : 'No (1x weight)'}`);
        console.log(`      Weight: ${effectiveWeight}`);
        console.log(`      Contribution: ${score * effectiveWeight}`);
        console.log(`      Is Signoff: ${isSignoff ? 'Yes' : 'No'}`);
        console.log('');
    });
    
    let categoryScore = sumWeights === 0 ? 0 : sumScores / sumWeights;
    
    console.log(`📊 Category Score Calculation:`);
    console.log(`   Sum of (score × weight): ${sumScores}`);
    console.log(`   Sum of weights: ${sumWeights}`);
    console.log(`   Raw score: ${categoryScore} (${Math.round(categoryScore * 100)}%)`);
    
    // Apply NOT_SET cap
    if (hasAnyNotSet) {
        const beforeCap = categoryScore;
        categoryScore = Math.min(categoryScore, ANY_NOT_SET_CAP);
        console.log(`   ⚠️  NOT_SET cap applied: ${beforeCap} → ${categoryScore} (${Math.round(categoryScore * 100)}%)`);
        console.log(`   Cap value: ${ANY_NOT_SET_CAP} (95%)`);
    }
    
    console.log(`\n   Final Category Score: ${categoryScore} (${Math.round(categoryScore * 100)}%)\n`);
    
    // Check if there's a signoff
    const signoff = productDocCriteria.find(s => 
        s.criterion?.label?.toLowerCase().includes('signoff')
    );
    
    if (signoff) {
        console.log(`⚠️  SIGNOFF FOUND: ${signoff.criterion.label}`);
        console.log(`   Status: ${signoff.status}`);
        if (signoff.status === 'GO') {
            console.log(`   ⚠️  This would override all other criteria in the category!`);
        }
    } else {
        console.log(`✅ No signoff in this category`);
    }
}

const epicId = process.argv[2] || 'c5060478-7afa-4f4e-82fb-9ae0df525cb6';
debugCategoryScore(epicId).catch(console.error);
