#!/usr/bin/env node
// Diagnose why due dates aren't showing for an epic
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseEpic(epicReferenceOrName) {
    console.log(`\n🔍 Diagnosing epic: ${epicReferenceOrName}\n`);
    
    // Try to find epic by aha_id (reference_num) or name
    let epic = null;
    
    // First try by aha_id (reference_num)
    const { data: epicByRef, error: refError } = await supabase
        .from('epic')
        .select('*')
        .eq('aha_id', epicReferenceOrName)
        .single();
    
    if (!refError && epicByRef) {
        epic = epicByRef;
        console.log(`✅ Found epic by reference: ${epic.aha_id}`);
    } else {
        // Try by name (partial match)
        const { data: epicsByName, error: nameError } = await supabase
            .from('epic')
            .select('*')
            .ilike('name', `%${epicReferenceOrName}%`);
        
        if (!nameError && epicsByName && epicsByName.length > 0) {
            epic = epicsByName[0];
            console.log(`✅ Found epic by name: ${epic.name}`);
        }
    }
    
    if (!epic) {
        console.error(`❌ Epic not found: ${epicReferenceOrName}`);
        return;
    }
    
    console.log(`\n📋 Epic Details:`);
    console.log(`   ID: ${epic.id}`);
    console.log(`   Name: ${epic.name}`);
    console.log(`   Aha ID: ${epic.aha_id}`);
    console.log(`   Target Launch Date: ${epic.target_launch_date || '❌ MISSING'}`);
    console.log(`   Tier: ${epic.tier || 'NOT SET'}`);
    
    // Check launch stages
    const { data: launchStages, error: stagesError } = await supabase
        .from('launch_stages')
        .select('*')
        .order('sort_order');
    
    console.log(`\n📅 Launch Stages:`);
    if (stagesError) {
        console.log(`   ❌ Error loading launch stages: ${stagesError.message}`);
    } else if (!launchStages || launchStages.length === 0) {
        console.log(`   ❌ NO LAUNCH STAGES FOUND - Due dates cannot be calculated without launch stages!`);
    } else {
        console.log(`   ✅ Found ${launchStages.length} launch stages:`);
        launchStages.forEach(stage => {
            console.log(`      - ${stage.name} (ID: ${stage.id}, Sort: ${stage.sort_order}, Duration: ${stage.duration_days || 'N/A'} days)`);
        });
    }
    
    // Check criteria statuses
    const { data: criteriaStatuses, error: criteriaError } = await supabase
        .from('epic_criterion_status')
        .select(`
            *,
            criterion:criterion_id (
                id,
                label,
                category,
                gate,
                rating_timing,
                tier_applicability,
                sort_order
            )
        `)
        .eq('epic_id', epic.id);
    
    // Sort by criterion sort_order in JavaScript
    if (criteriaStatuses && !criteriaError) {
        criteriaStatuses.sort((a, b) => {
            const aOrder = a.criterion?.sort_order || 0;
            const bOrder = b.criterion?.sort_order || 0;
            return aOrder - bOrder;
        });
    }
    
    console.log(`\n📊 Criteria Statuses:`);
    if (criteriaError) {
        console.log(`   ❌ Error loading criteria: ${criteriaError.message}`);
    } else if (!criteriaStatuses || criteriaStatuses.length === 0) {
        console.log(`   ⚠️  No criteria statuses found for this epic`);
    } else {
        console.log(`   ✅ Found ${criteriaStatuses.length} criteria statuses\n`);
        
        let hasStoredDueDates = 0;
        let hasRatingTiming = 0;
        let canCalculateDueDates = 0;
        
        criteriaStatuses.forEach((status, idx) => {
            const criterion = status.criterion;
            const storedDueDate = status.condition_due_date;
            const ratingTiming = criterion?.rating_timing;
            const hasTargetDate = !!epic.target_launch_date;
            const hasStages = launchStages && launchStages.length > 0;
            
            if (storedDueDate) hasStoredDueDates++;
            if (ratingTiming) hasRatingTiming++;
            if (ratingTiming && hasTargetDate && hasStages) canCalculateDueDates++;
            
            console.log(`   ${idx + 1}. ${criterion?.label || 'Unknown'}`);
            console.log(`      Status: ${status.status || 'NOT_SET'}`);
            console.log(`      Stored Due Date: ${storedDueDate || '❌ NOT SET'}`);
            console.log(`      Rating Timing ID: ${ratingTiming || '❌ NOT SET'}`);
            
            if (ratingTiming && launchStages) {
                const targetStage = launchStages.find(s => s.id === ratingTiming);
                if (targetStage) {
                    console.log(`      Target Stage: ${targetStage.name} (Sort: ${targetStage.sort_order})`);
                } else {
                    console.log(`      ⚠️  Rating timing ID ${ratingTiming} not found in launch stages`);
                }
            }
            
            // Calculate what the due date should be
            if (ratingTiming && hasTargetDate && hasStages) {
                const targetStage = launchStages.find(s => s.id === ratingTiming);
                if (targetStage) {
                    const stagesBeforeTarget = launchStages.filter(s => 
                        s.sort_order < targetStage.sort_order && s.duration_days !== null
                    );
                    const totalDaysBefore = stagesBeforeTarget.reduce((sum, s) => sum + (s.duration_days || 0), 0);
                    
                    const targetDate = new Date(epic.target_launch_date);
                    const calculatedDueDate = new Date(targetDate);
                    calculatedDueDate.setDate(calculatedDueDate.getDate() - totalDaysBefore);
                    
                    console.log(`      ✅ Calculated Due Date: ${calculatedDueDate.toISOString().split('T')[0]}`);
                    console.log(`         (${totalDaysBefore} days before launch)`);
                }
            } else {
                console.log(`      ❌ Cannot calculate - Missing:`);
                if (!ratingTiming) console.log(`         - Rating timing ID`);
                if (!hasTargetDate) console.log(`         - Target launch date`);
                if (!hasStages) console.log(`         - Launch stages`);
            }
            console.log('');
        });
        
        console.log(`\n📈 Summary:`);
        console.log(`   Criteria with stored due dates: ${hasStoredDueDates}/${criteriaStatuses.length}`);
        console.log(`   Criteria with rating_timing: ${hasRatingTiming}/${criteriaStatuses.length}`);
        console.log(`   Criteria that can calculate due dates: ${canCalculateDueDates}/${criteriaStatuses.length}`);
    }
    
    // Check release date from Aha fields
    if (epic.aha_fields) {
        const ahaFields = typeof epic.aha_fields === 'string' 
            ? JSON.parse(epic.aha_fields) 
            : epic.aha_fields;
        
        const releaseDate = ahaFields?.standard_fields?.release?.name || 
                           ahaFields?.custom_fields?.release_date ||
                           ahaFields?.standard_fields?.aha_release_name;
        
        if (releaseDate) {
            console.log(`\n📦 Aha Release Info:`);
            console.log(`   Release: ${releaseDate}`);
        }
    }
    
    console.log(`\n✅ Diagnosis complete!\n`);
}

// Get epic reference from command line or use default
const epicRef = process.argv[2] || 'APP-E-511';
diagnoseEpic(epicRef).catch(console.error);

