#!/usr/bin/env tsx

/**
 * Standalone script to recalculate readiness for a specific epic
 * Usage: tsx recalc-epic-standalone.ts <epic-id>
 * 
 * This script replicates the recomputeEpicReadiness logic without Next.js dependencies
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { 
    computeLaunchReadiness, 
    isSignoffCriterion, 
    normalizeStatus,
    type CriterionInput 
} from './src/lib/readiness-scoring';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function recalculateEpic(epicId: string) {
    console.log(`\n🔄 Recalculating readiness for epic: ${epicId}\n`);
    
    try {
        // 1. Fetch epic data
        const { data: epic, error: epicError } = await supabase
            .from('epic')
            .select('id, name, tier, target_launch_date, readiness_status, risk_level, console_url, owner_email, readiness_score, updated_at')
            .eq('id', epicId)
            .single();

        if (epicError) {
            throw new Error(`Failed to fetch epic: ${epicError.message}`);
        }

        if (!epic) {
            throw new Error(`Epic not found: ${epicId}`);
        }

        console.log(`📋 Epic: ${epic.name}`);
        console.log(`   Current Score: ${epic.readiness_score !== null && epic.readiness_score !== undefined ? `${Math.round(epic.readiness_score * 100)}%` : 'NOT SET'} (exact: ${epic.readiness_score})`);
        console.log(`   Current Status: ${epic.readiness_status || 'NOT SET'}`);
        console.log(`   Updated At: ${epic.updated_at || 'NOT SET'}\n`);

        // 2. Fetch criteria statuses
        const { data: statuses, error: statusError } = await supabase
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

        if (statusError) {
            throw new Error(`Failed to fetch criteria: ${statusError.message}`);
        }

        if (!statuses || statuses.length === 0) {
            console.log('⚠️  No criteria found. Setting to NOT_EVALUATED.');
            const { error: updateError } = await supabase
                .from('epic')
                .update({
                    readiness_score: null,
                    readiness_status: 'NOT_EVALUATED',
                    risk_level: epic.risk_level || 'LOW',
                    updated_at: new Date().toISOString()
                })
                .eq('id', epicId);

            if (updateError) {
                throw new Error(`Failed to update epic: ${updateError.message}`);
            }

            console.log('✅ Updated epic to NOT_EVALUATED');
            return;
        }

        console.log(`📊 Found ${statuses.length} criteria statuses`);

        // 3. Determine applicability by tier
        const applies = (app: 'ALL'|'TIER_1_ONLY'|'TIER_1_AND_2', tier: 'TIER_1'|'TIER_2'|'TIER_3') =>
            app === 'ALL' ||
            (app === 'TIER_1_ONLY' && tier === 'TIER_1') ||
            (app === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2'));

        const tier = (epic?.tier as any) || 'TIER_3';

        // 4. Convert statuses to CriterionInput format
        const criteriaInputs: CriterionInput[] = [];
        
        for (const s of statuses) {
            const applicability = s.criterion?.tier_applicability as any;
            if (applicability && !applies(applicability, tier)) {
                continue;
            }

            const criterion = s.criterion;
            if (!criterion) continue;

            const label = criterion.label as string | null | undefined;
            const category = criterion.category as string | null | undefined;
            const isGate = criterion.gate as boolean | null | undefined;

            criteriaInputs.push({
                id: s.id || criterion.id,
                categoryId: category || 'OTHER',
                isSignoff: isSignoffCriterion(label),
                status: normalizeStatus(s.status),
                isGating: isGate || false,
                weight: 1,
            });
        }

        console.log(`📊 Processing ${criteriaInputs.length} applicable criteria\n`);

        // 5. Calculate readiness
        const scoringResult = computeLaunchReadiness(criteriaInputs);
        const readinessScore = scoringResult.readiness;

        console.log(`📊 Calculated Readiness:`);
        console.log(`   Score: ${Math.round(readinessScore * 100)}% (exact: ${readinessScore})`);
        console.log(`   Verdict: ${scoringResult.verdict}`);
        console.log(`   Categories: ${scoringResult.categoryScores.length}\n`);

        // 6. Map verdict to database status
        let readinessStatus: string;
        switch (scoringResult.verdict) {
            case 'GO':
                readinessStatus = 'GO';
                break;
            case 'CONDITIONAL_GO':
                readinessStatus = 'CONDITIONAL_GO';
                break;
            case 'NO_GO_BLOCKED_BY_GATING':
                readinessStatus = 'NO_GO';
                break;
            case 'AT_RISK':
                readinessStatus = 'NO_GO';
                break;
            case 'NOT_EVALUATED':
            default:
                readinessStatus = 'NOT_EVALUATED';
                break;
        }

        // 7. Compute Risk
        let riskLevel = 'LOW';
        if (epic?.target_launch_date) {
            const daysToLaunch = Math.ceil((new Date(epic.target_launch_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            if (daysToLaunch < 14) {
                if (readinessStatus === 'NO_GO' || readinessStatus === 'CONDITIONAL_GO') {
                    riskLevel = 'HIGH';
                } else if (readinessScore < 0.95) {
                    riskLevel = 'MEDIUM';
                }
            } else if (daysToLaunch < 30) {
                if (readinessStatus === 'NO_GO') riskLevel = 'MEDIUM';
            }
        }

        // 8. Update Epic with retry logic
        const maxRetries = 3;
        let updatedEpic: any = null;
        let lastError: any = null;
        
        console.log('💾 Updating epic in database...\n');
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const { data, error: updateError } = await supabase
                .from('epic')
                .update({
                    readiness_score: readinessScore,
                    readiness_status: readinessStatus,
                    risk_level: riskLevel,
                    updated_at: new Date().toISOString()
                })
                .eq('id', epicId)
                .select('readiness_score, readiness_status, risk_level, updated_at')
                .single();

            if (updateError) {
                lastError = updateError;
                console.error(`   Attempt ${attempt}/${maxRetries} failed: ${updateError.message}`);
                
                if (attempt < maxRetries && (
                    updateError.message?.includes('timeout') ||
                    updateError.message?.includes('network') ||
                    updateError.code === 'PGRST116'
                )) {
                    await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                    continue;
                }
                
                throw new Error(`Failed to update epic readiness after ${attempt} attempt(s): ${updateError.message}`);
            }

            if (!data) {
                lastError = new Error('Update returned no data');
                console.error(`   Attempt ${attempt}/${maxRetries} returned no data`);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                    continue;
                }
                
                throw new Error(`Failed to update epic readiness: Update returned no data after ${attempt} attempt(s)`);
            }

            updatedEpic = data;
            break;
        }

        if (!updatedEpic) {
            throw lastError || new Error(`Failed to update epic readiness: Unknown error`);
        }

        // 9. Validate the stored score
        const storedScore = updatedEpic.readiness_score;
        const scoreDiff = Math.abs((storedScore ?? 0) - readinessScore);
        
        console.log('✅ Update completed!');
        console.log(`📊 Updated Epic Readiness:`);
        console.log(`   Score: ${storedScore !== null && storedScore !== undefined ? `${Math.round(storedScore * 100)}%` : 'NOT SET'} (exact: ${storedScore})`);
        console.log(`   Status: ${updatedEpic.readiness_status || 'NOT SET'}`);
        console.log(`   Risk Level: ${updatedEpic.risk_level || 'NOT SET'}`);
        console.log(`   Updated At: ${updatedEpic.updated_at || 'NOT SET'}\n`);

        if (scoreDiff > 0.001) {
            console.log(`⚠️  Score mismatch detected:`);
            console.log(`   Calculated: ${readinessScore} (${Math.round(readinessScore * 100)}%)`);
            console.log(`   Stored: ${storedScore} (${storedScore !== null && storedScore !== undefined ? Math.round(storedScore * 100) : 'null'}%)`);
            console.log(`   Difference: ${scoreDiff} (${Math.round(scoreDiff * 100)}%)\n`);
        } else {
            console.log(`✅ Score matches calculated value!\n`);
        }

    } catch (error: any) {
        console.error(`\n❌ Error during recalculation:`, error);
        console.error(`   Message: ${error.message}`);
        if (error.stack) {
            console.error(`   Stack: ${error.stack}`);
        }
        process.exit(1);
    }
}

const epicId = process.argv[2] || 'c5060478-7afa-4f4e-82fb-9ae0df525cb6';
recalculateEpic(epicId).catch(console.error);
