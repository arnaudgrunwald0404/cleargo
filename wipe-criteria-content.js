#!/usr/bin/env node
// One-time script to wipe all current_status_notes from epic_criterion_status
// Criteria with data sources will automatically repopulate on next API sync
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use new secret key, fallback to legacy service_role key for backward compatibility
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function wipeCriteriaContent(dryRun = false) {
    try {
        console.log('\n=== Criteria Content Cleanup Script ===\n');
        
        if (dryRun) {
            console.log('🔍 DRY RUN MODE - No changes will be made\n');
        }

        // Count total records
        const { count: totalCount, error: countError } = await supabase
            .from('epic_criterion_status')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            throw new Error(`Failed to count records: ${countError.message}`);
        }

        console.log(`Total epic_criterion_status records: ${totalCount || 0}`);

        // Count records with non-empty notes
        const { data: recordsWithNotes, error: notesError } = await supabase
            .from('epic_criterion_status')
            .select('id, current_status_notes, epic_id, criterion_id')
            .not('current_status_notes', 'is', null)
            .neq('current_status_notes', '');

        if (notesError) {
            throw new Error(`Failed to query records with notes: ${notesError.message}`);
        }

        const notesCount = recordsWithNotes?.length || 0;
        console.log(`Records with non-empty notes: ${notesCount}`);

        if (notesCount === 0) {
            console.log('\n✓ No records to update. All notes are already empty or null.');
            rl.close();
            return;
        }

        // Show sample of what will be wiped (first 5 records)
        if (recordsWithNotes && recordsWithNotes.length > 0) {
            console.log('\nSample of records that will be wiped (first 5):');
            recordsWithNotes.slice(0, 5).forEach((record, idx) => {
                const notePreview = record.current_status_notes 
                    ? record.current_status_notes.substring(0, 100) + (record.current_status_notes.length > 100 ? '...' : '')
                    : '(empty)';
                console.log(`  ${idx + 1}. Epic: ${record.epic_id}, Criterion: ${record.criterion_id}`);
                console.log(`     Note preview: ${notePreview}`);
            });
            if (recordsWithNotes.length > 5) {
                console.log(`  ... and ${recordsWithNotes.length - 5} more`);
            }
        }

        if (dryRun) {
            console.log('\n🔍 DRY RUN: Would wipe notes from', notesCount, 'records');
            console.log('Run without --dry-run to perform the actual update.');
            rl.close();
            return;
        }

        // Perform the update
        console.log('\n⚠️  WARNING: This will permanently delete all current_status_notes!');
        console.log('Criteria with data sources will repopulate automatically on next API sync.\n');

        const { data: updateData, error: updateError } = await supabase
            .from('epic_criterion_status')
            .update({ current_status_notes: null })
            .not('current_status_notes', 'is', null)
            .neq('current_status_notes', '')
            .select('id');

        if (updateError) {
            throw new Error(`Failed to update records: ${updateError.message}`);
        }

        const updatedCount = updateData?.length || 0;
        console.log(`\n✓ Successfully wiped notes from ${updatedCount} records`);

        // Verify the update
        const { count: remainingCount, error: verifyError } = await supabase
            .from('epic_criterion_status')
            .select('*', { count: 'exact', head: true })
            .not('current_status_notes', 'is', null)
            .neq('current_status_notes', '');

        if (verifyError) {
            console.warn('Warning: Could not verify update:', verifyError.message);
        } else {
            const remaining = remainingCount || 0;
            if (remaining === 0) {
                console.log('✓ Verification: All notes have been cleared');
            } else {
                console.warn(`⚠️  Warning: ${remaining} records still have notes (may be due to concurrent updates)`);
            }
        }

        console.log('\n✓ Cleanup completed successfully!');
        console.log('Note: Criteria with data sources will repopulate on next API sync.');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Main execution
(async () => {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');

    if (!dryRun) {
        console.log('⚠️  WARNING: This script will permanently delete all current_status_notes from epic_criterion_status.');
        console.log('This is a destructive operation. All user-entered notes will be lost.');
        console.log('Criteria with data sources will automatically repopulate on next API sync.\n');
        
        const answer = await askQuestion('Are you sure you want to proceed? (yes/no): ');
        
        if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
            console.log('Operation cancelled.');
            rl.close();
            process.exit(0);
        }
    }

    await wipeCriteriaContent(dryRun);
})();
