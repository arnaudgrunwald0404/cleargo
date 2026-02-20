#!/usr/bin/env node
// Diagnose readiness score calculation for a specific epic
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseReadiness(epicId) {
    console.log(`\n🔍 Diagnosing readiness for epic: ${epicId}\n`);
    
    // Fetch epic data
    const { data: epic, error: epicError } = await supabase
        .from('epic')
        .select('id, name, tier, target_launch_date, readiness_score, readiness_status, risk_level, updated_at, created_at')
        .eq('id', epicId)
        .single();
    
    if (epicError || !epic) {
        console.error(`❌ Epic not found: ${epicError?.message || 'Unknown error'}`);
        return;
    }
    
    console.log(`📋 Epic Details:`);
    console.log(`   ID: ${epic.id}`);
    console.log(`   Name: ${epic.name}`);
    console.log(`   Tier: ${epic.tier || 'NOT SET'}`);
    console.log(`   Target Launch Date: ${epic.target_launch_date || 'NOT SET'}`);
    console.log(`   Current Readiness Score: ${epic.readiness_score !== null && epic.readiness_score !== undefined ? `${Math.round(epic.readiness_score * 100)}%` : 'NOT SET'}`);
    console.log(`   Current Readiness Score (exact): ${epic.readiness_score !== null && epic.readiness_score !== undefined ? epic.readiness_score : 'NOT SET'}`);
    console.log(`   Current Readiness Status: ${epic.readiness_status || 'NOT SET'}`);
    console.log(`   Risk Level: ${epic.risk_level || 'NOT SET'}`);
    console.log(`   Last Updated: ${epic.updated_at || 'NOT SET'}`);
    console.log(`   Created: ${epic.created_at || 'NOT SET'}`);
    
    // Fetch all criteria statuses
    const { data: statuses, error: statusError } = await supabase
        .from('epic_criterion_status')
        .select(`
            *,
            criterion:criterion_id (
                id,
                label,
                category,
                gate,
                tier_applicability,
                sort_order
            )
        `)
        .eq('epic_id', epicId);
    
    // Sort by criterion sort_order in JavaScript
    if (statuses && !statusError) {
        statuses.sort((a, b) => {
            const aOrder = a.criterion?.sort_order || 0;
            const bOrder = b.criterion?.sort_order || 0;
            return aOrder - bOrder;
        });
    }
    
    if (statusError) {
        console.error(`❌ Error loading criteria: ${statusError.message}`);
        return;
    }
    
    if (!statuses || statuses.length === 0) {
        console.log(`\n⚠️  No criteria statuses found for this epic`);
        return;
    }
    
    console.log(`\n📊 Criteria Analysis (${statuses.length} total):\n`);
    
    // Helper to determine applicability by tier
    const applies = (app, tier) => {
        if (!app) return true;
        if (app === 'ALL') return true;
        if (app === 'TIER_1_ONLY' && tier === 'TIER_1') return true;
        if (app === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2')) return true;
        return false;
    };
    
    const tier = epic.tier || 'TIER_3';
    
    // Group by category
    const byCategory = new Map();
    let applicableCount = 0;
    let notApplicableCount = 0;
    let notSetCount = 0;
    let goCount = 0;
    let conditionalCount = 0;
    let noGoCount = 0;
    let signoffCount = 0;
    
    statuses.forEach(status => {
        const criterion = status.criterion;
        if (!criterion) return;
        
        const applicability = criterion.tier_applicability;
        const isApplicable = applies(applicability, tier);
        
        if (!isApplicable) {
            notApplicableCount++;
            return;
        }
        
        applicableCount++;
        
        const category = criterion.category || 'OTHER';
        if (!byCategory.has(category)) {
            byCategory.set(category, []);
        }
        
        const isSignoff = criterion.label?.toLowerCase().includes('signoff');
        if (isSignoff) signoffCount++;
        
        const statusValue = status.status || 'NOT_SET';
        if (statusValue === 'NOT_SET') notSetCount++;
        else if (statusValue === 'GO') goCount++;
        else if (statusValue === 'CONDITIONAL' || statusValue === 'CONDITIONAL_GO') conditionalCount++;
        else if (statusValue === 'NO_GO') noGoCount++;
        
        byCategory.get(category).push({
            label: criterion.label,
            status: statusValue,
            gate: criterion.gate || false,
            isSignoff,
            id: status.id
        });
    });
    
    console.log(`📈 Summary:`);
    console.log(`   Applicable criteria: ${applicableCount}`);
    console.log(`   Non-applicable criteria: ${notApplicableCount}`);
    console.log(`   Status breakdown:`);
    console.log(`      - GO: ${goCount}`);
    console.log(`      - CONDITIONAL: ${conditionalCount}`);
    console.log(`      - NO_GO: ${noGoCount}`);
    console.log(`      - NOT_SET: ${notSetCount}`);
    console.log(`   Signoff criteria: ${signoffCount}`);
    
    // Show criteria by category
    console.log(`\n📁 Criteria by Category:\n`);
    
    for (const [category, criteria] of byCategory.entries()) {
        console.log(`   ${category}:`);
        
        // Check for signoff in this category
        const signoffs = criteria.filter(c => c.isSignoff);
        const signoffGO = signoffs.some(s => s.status === 'GO');
        
        if (signoffs.length > 0) {
            console.log(`      ⚠️  SIGNOFF DETECTED: ${signoffs.map(s => s.label).join(', ')}`);
            signoffs.forEach(s => {
                console.log(`         - ${s.label}: ${s.status} ${s.status === 'GO' ? '✅ (Would override other criteria)' : ''}`);
            });
        }
        
        criteria.forEach(c => {
            const statusIcon = c.status === 'GO' ? '✅' : 
                              c.status === 'CONDITIONAL' || c.status === 'CONDITIONAL_GO' ? '⚠️' :
                              c.status === 'NO_GO' ? '❌' : '⚪';
            const gateIcon = c.gate ? '🔒' : '';
            const signoffIcon = c.isSignoff ? '📝' : '';
            
            let effectiveStatus = c.status;
            if (signoffGO && !c.isSignoff) {
                effectiveStatus = 'GO (overridden by signoff)';
            }
            
            console.log(`      ${statusIcon} ${gateIcon} ${signoffIcon} ${c.label}`);
            console.log(`         Status: ${c.status} → Effective: ${effectiveStatus}`);
        });
        console.log('');
    }
    
    // Simulate readiness calculation (simplified version)
    console.log(`\n🧮 Readiness Calculation Simulation:\n`);
    
    // Scoring constants
    const GATING_WEIGHT_MULTIPLIER = 3;
    const NO_GO_GATING_CAP = 0.60;
    const CONDITIONAL_GATING_CAP = 0.85;
    const NOT_SET_GATING_CAP = 0.75;
    const ANY_NOT_SET_CAP = 0.95;
    
    function statusToScore(status) {
        if (status === 'GO') return 1.0;
        if (status === 'CONDITIONAL_GO' || status === 'CONDITIONAL') return 0.5;
        return 0.0;
    }
    
    function computeCategoryScore(criteria, categoryId) {
        const inCategory = criteria.filter(c => c.categoryId === categoryId);
        if (inCategory.length === 0) {
            return { categoryId, score: 0, hasGatingNoGo: false, hasAnyNotSet: false };
        }
        
        // Find signoff and apply signoff override
        const signoff = inCategory.find(c => c.isSignoff);
        const useSignoffOverride = signoff && signoff.status === 'GO';
        
        let hasGatingNoGo = false;
        let hasGatingConditional = false;
        let hasGatingNotSet = false;
        let hasAnyNotSet = false;
        
        let sumScores = 0;
        let sumWeights = 0;
        
        for (const c of inCategory) {
            const effectiveStatus = useSignoffOverride ? 'GO' : c.status;
            
            if (effectiveStatus === 'NOT_APPLICABLE') {
                if (c.isGating) {
                    hasGatingNotSet = true;
                    hasAnyNotSet = true;
                }
                continue;
            }
            
            const score = statusToScore(effectiveStatus);
            const baseWeight = c.weight || 1;
            const effectiveWeight = c.isGating ? baseWeight * GATING_WEIGHT_MULTIPLIER : baseWeight;
            
            if (effectiveStatus === 'NOT_SET') {
                hasAnyNotSet = true;
                if (c.isGating) hasGatingNotSet = true;
            }
            
            if (c.isGating) {
                if (effectiveStatus === 'NO_GO') hasGatingNoGo = true;
                if (effectiveStatus === 'CONDITIONAL_GO' || effectiveStatus === 'CONDITIONAL') hasGatingConditional = true;
            }
            
            sumScores += score * effectiveWeight;
            sumWeights += effectiveWeight;
        }
        
        let score = sumWeights === 0 ? 0 : sumScores / sumWeights;
        
        // Apply gating caps
        if (hasGatingNoGo) {
            score = Math.min(score, NO_GO_GATING_CAP);
        } else if (hasGatingConditional) {
            score = Math.min(score, CONDITIONAL_GATING_CAP);
        } else if (hasGatingNotSet) {
            score = Math.min(score, NOT_SET_GATING_CAP);
        }
        
        // Apply global "missing" cap
        if (hasAnyNotSet) {
            score = Math.min(score, ANY_NOT_SET_CAP);
        }
        
        return { categoryId, score, hasGatingNoGo, hasAnyNotSet };
    }
    
    // Convert to CriterionInput format
    const criteriaInputs = [];
    for (const s of statuses) {
        const applicability = s.criterion?.tier_applicability;
        if (applicability && !applies(applicability, tier)) {
            continue;
        }
        
        const criterion = s.criterion;
        if (!criterion) continue;
        
        const label = criterion.label;
        const category = criterion.category || 'OTHER';
        const isGate = criterion.gate || false;
        const isSignoff = label?.toLowerCase().includes('signoff');
        
        // Normalize status
        let normalizedStatus = s.status || 'NOT_SET';
        if (normalizedStatus === 'CONDITIONAL') normalizedStatus = 'CONDITIONAL_GO';
        
        criteriaInputs.push({
            id: s.id || criterion.id,
            categoryId: category,
            isSignoff: isSignoff,
            status: normalizedStatus,
            isGating: isGate,
            weight: 1
        });
    }
    
    // Calculate readiness
    const categoryIds = Array.from(new Set(criteriaInputs.map(c => c.categoryId)));
    const categoryScores = categoryIds.map(categoryId => computeCategoryScore(criteriaInputs, categoryId));
    
    const activeCategories = categoryScores.length > 0 
        ? categoryScores 
        : [{ categoryId: 'none', score: 0, hasGatingNoGo: false, hasAnyNotSet: false }];
    
    let sumCategoryScores = 0;
    let sumCategoryWeights = 0;
    
    for (const cs of activeCategories) {
        const weight = 1;
        sumCategoryScores += cs.score * weight;
        sumCategoryWeights += weight;
    }
    
    const readiness = sumCategoryWeights === 0 ? 0 : sumCategoryScores / sumCategoryWeights;
    const blocked = activeCategories.some(cs => cs.hasGatingNoGo);
    
    let verdict;
    if (blocked) {
        verdict = 'NO_GO_BLOCKED_BY_GATING';
    } else if (readiness >= 0.9) {
        verdict = 'GO';
    } else if (readiness >= 0.7) {
        verdict = 'CONDITIONAL_GO';
    } else {
        verdict = 'AT_RISK';
    }
    
    console.log(`   Calculated Readiness Score: ${Math.round(readiness * 100)}%`);
    console.log(`   Calculated Readiness Score (exact): ${readiness}`);
    console.log(`   Verdict: ${verdict}`);
    console.log(`   Blocked: ${blocked ? 'Yes (gate blockers)' : 'No'}`);
    
    console.log(`\n   Category Scores (detailed):`);
    categoryScores.forEach(cs => {
        const categoryCriteria = criteriaInputs.filter(c => c.categoryId === cs.categoryId);
        const signoff = categoryCriteria.find(c => c.isSignoff);
        const signoffStatus = signoff?.status;
        
        console.log(`      ${cs.categoryId}:`);
        console.log(`         Score: ${Math.round(cs.score * 100)}% (exact: ${cs.score})`);
        if (signoff && signoffStatus === 'GO') {
            console.log(`         ⚠️  SIGNOFF OVERRIDE ACTIVE: "${signoff.id}" is GO`);
            console.log(`         ⚠️  All criteria in this category are treated as GO for scoring`);
            const overridden = categoryCriteria.filter(c => !c.isSignoff && c.status !== 'GO');
            if (overridden.length > 0) {
                console.log(`         ⚠️  Overridden criteria:`);
                overridden.forEach(c => {
                    console.log(`            - ${c.id}: ${c.status} → GO (overridden)`);
                });
            }
        }
        console.log(`         Has gate blockers: ${cs.hasGatingNoGo}`);
        console.log(`         Has NOT_SET criteria: ${cs.hasAnyNotSet}`);
        
        // Show detailed breakdown for Product Documentation category
        if (cs.categoryId === 'Product Documentation') {
            console.log(`         Criteria breakdown:`);
            categoryCriteria.forEach(c => {
                const effectiveStatus = (signoff && signoffStatus === 'GO' && !c.isSignoff) ? 'GO (overridden)' : c.status;
                console.log(`            - ${c.id}: ${c.status} → ${effectiveStatus} (gate: ${c.isGating}, signoff: ${c.isSignoff})`);
            });
        }
    });
    
    console.log(`\n   Comparison:`);
    console.log(`      Stored score: ${epic.readiness_score !== null && epic.readiness_score !== undefined ? `${Math.round(epic.readiness_score * 100)}%` : 'NOT SET'}`);
    console.log(`      Stored score (exact): ${epic.readiness_score !== null && epic.readiness_score !== undefined ? epic.readiness_score : 'NOT SET'}`);
    console.log(`      Calculated score: ${Math.round(readiness * 100)}%`);
    console.log(`      Calculated score (exact): ${readiness}`);
    const diff = Math.abs((epic.readiness_score || 0) - readiness);
    console.log(`      Difference: ${diff} (${(diff * 100).toFixed(4)}%)`);
    if (diff > 0.001) {
        console.log(`      ⚠️  MISMATCH! Scores don't match.`);
        console.log(`      ⚠️  The stored score may be outdated or calculated differently.`);
    } else {
        console.log(`      ✅ Scores match (within rounding tolerance)`);
    }
    
    // Find the specific criterion mentioned
    const packagingCriterion = statuses.find(s => 
        s.criterion?.label?.toLowerCase().includes('packaging') && 
        s.criterion?.label?.toLowerCase().includes('pricing')
    );
    
    if (packagingCriterion) {
        console.log(`\n🎯 "Packaging & Pricing Approved, Documented" Analysis:\n`);
        console.log(`   Label: ${packagingCriterion.criterion.label}`);
        console.log(`   Status: ${packagingCriterion.status || 'NOT_SET'}`);
        console.log(`   Category: ${packagingCriterion.criterion.category || 'OTHER'}`);
        console.log(`   Gate: ${packagingCriterion.criterion.gate ? 'Yes' : 'No'}`);
        console.log(`   Tier Applicability: ${packagingCriterion.criterion.tier_applicability || 'ALL'}`);
        console.log(`   Is Applicable: ${applies(packagingCriterion.criterion.tier_applicability, tier) ? 'Yes' : 'No'}`);
        
        // Check if there's a signoff in the same category
        const sameCategory = statuses.filter(s => 
            s.criterion?.category === packagingCriterion.criterion.category &&
            applies(s.criterion?.tier_applicability, tier)
        );
        const signoffInCategory = sameCategory.find(s => 
            s.criterion?.label?.toLowerCase().includes('signoff')
        );
        
        if (signoffInCategory) {
            console.log(`\n   ⚠️  SIGNOFF IN SAME CATEGORY:`);
            console.log(`      ${signoffInCategory.criterion.label}: ${signoffInCategory.status}`);
            if (signoffInCategory.status === 'GO') {
                console.log(`      ⚠️  This signoff would override "${packagingCriterion.criterion.label}" to GO`);
                console.log(`      ⚠️  This is why the readiness score shows 100% despite this criterion being NOT_SET`);
            }
        } else {
            console.log(`\n   ✅ No signoff override in this category`);
            console.log(`   ⚠️  This criterion is NOT_SET but readiness is 100% - investigating...`);
        }
    } else {
        console.log(`\n⚠️  "Packaging & Pricing Approved, Documented" criterion not found`);
        console.log(`   Searching for similar criteria...`);
        const similar = statuses.filter(s => 
            s.criterion?.label?.toLowerCase().includes('packaging') ||
            s.criterion?.label?.toLowerCase().includes('pricing')
        );
        if (similar.length > 0) {
            similar.forEach(s => {
                console.log(`   - ${s.criterion.label}: ${s.status || 'NOT_SET'}`);
            });
        }
    }
    
    console.log(`\n✅ Diagnosis complete!\n`);
}

// Get epic ID from command line
const epicId = process.argv[2] || 'c5060478-7afa-4f4e-82fb-9ae0df525cb6';
diagnoseReadiness(epicId).catch(console.error);
