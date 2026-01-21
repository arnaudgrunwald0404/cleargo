#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: join(process.cwd(), '.env.local') });

async function deleteTestEpics() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials');
        process.exit(1);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Find epics with the name "Test Epic from Webhook Test"
    const { data: epics, error: fetchError } = await supabase
        .from('epic')
        .select('id, name')
        .eq('name', 'Test Epic from Webhook Test');
    
    if (fetchError) {
        console.error('Error fetching epics:', fetchError);
        process.exit(1);
    }
    
    if (!epics || epics.length === 0) {
        console.log('No epics found with name "Test Epic from Webhook Test"');
        process.exit(0);
    }
    
    console.log(`Found ${epics.length} epic(s) to delete:`);
    epics.forEach(epic => {
        console.log(`  - ${epic.name} (ID: ${epic.id})`);
    });
    
    // Delete each epic
    for (const epic of epics) {
        console.log(`\nDeleting epic: ${epic.name} (${epic.id})...`);
        
        // First, clean up storage files for attachments
        const { data: criterionStatuses } = await supabase
            .from('epic_criterion_status')
            .select('id')
            .eq('epic_id', epic.id);
        
        if (criterionStatuses && criterionStatuses.length > 0) {
            const statusIds = criterionStatuses.map(cs => cs.id);
            const allStoragePaths: string[] = [];
            
            // Get attachments linked directly to criterion statuses
            const { data: statusAttachments } = await supabase
                .from('criterion_attachment')
                .select('storage_path')
                .in('launch_criterion_status_id', statusIds);
            
            if (statusAttachments) {
                statusAttachments.forEach(a => {
                    if (a.storage_path) allStoragePaths.push(a.storage_path);
                });
            }
            
            // Get comment IDs for these criterion statuses
            const { data: comments } = await supabase
                .from('criterion_comment')
                .select('id')
                .in('launch_criterion_status_id', statusIds);
            
            if (comments && comments.length > 0) {
                const commentIds = comments.map(c => c.id);
                
                // Get attachments linked to comments
                const { data: commentAttachments } = await supabase
                    .from('criterion_attachment')
                    .select('storage_path')
                    .in('comment_id', commentIds);
                
                if (commentAttachments) {
                    commentAttachments.forEach(a => {
                        if (a.storage_path) allStoragePaths.push(a.storage_path);
                    });
                }
            }
            
            // Delete all attachment files from storage
            if (allStoragePaths.length > 0) {
                const { error: storageError } = await supabase.storage
                    .from('criterion-attachments')
                    .remove(allStoragePaths);
                
                if (storageError) {
                    console.warn('  Warning: Failed to delete some attachment files:', storageError);
                } else {
                    console.log(`  Deleted ${allStoragePaths.length} attachment file(s) from storage`);
                }
            }
        }
        
        // Delete the epic (cascade will handle related records)
        const { error: deleteError } = await supabase
            .from('epic')
            .delete()
            .eq('id', epic.id);
        
        if (deleteError) {
            console.error(`  Error deleting epic:`, deleteError);
        } else {
            console.log(`  ✓ Successfully deleted epic: ${epic.name}`);
        }
    }
    
    console.log(`\n✅ Deletion complete! Deleted ${epics.length} epic(s).`);
}

deleteTestEpics().catch(console.error);
