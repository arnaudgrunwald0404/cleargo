import { createClient } from '@supabase/supabase-js';
import { recomputeEpicReadiness } from '../src/lib/readiness';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Mock environment variables if needed, or rely on .env.local loading
// Note: This script assumes .env.local is loaded or vars are present.

async function main() {
    console.log('Starting Integration Verification...');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials in environment.');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Create a Test Launch
    console.log('Creating Test Launch...');
    const { data: launch, error: createError } = await supabase
        .from('launch')
        .insert({
            name: 'Verification Launch ' + Date.now(),
            tier: 'TIER_1',
            status: 'PLANNED',
            target_launch_date: new Date(Date.now() + 86400000 * 20).toISOString(), // T+20 days
            aha_id: 'TEST-' + Date.now(),
            owner_email: 'agrunwald@clearcompany.com' // Use a real email if possible, or mock
        })
        .select()
        .single();

    if (createError) {
        console.error('Failed to create launch:', createError);
        process.exit(1);
    }
    console.log('Created Launch:', launch.id);

    // 2. Instantiate Criteria (manually or via service)
    // We'll just insert one criterion status to manipulate
    const { data: criterion } = await supabase
        .from('criterion')
        .select('id')
        .eq('gate', true) // Use a gate to trigger NO_GO
        .limit(1)
        .single();

    if (!criterion) {
        console.error('No gate criterion found.');
        process.exit(1);
    }

    await supabase.from('launch_criterion_status').insert({
        launch_id: launch.id,
        criterion_id: criterion.id,
        status: 'NOT_SET'
    });

    // 3. Trigger Readiness Recomputation (Initial)
    console.log('Triggering initial recomputation...');
    await recomputeEpicReadiness(launch.id);

    // 4. Update Status to NO_GO to trigger alerts
    console.log('Updating status to NO_GO...');
    const { data: lcs } = await supabase
        .from('launch_criterion_status')
        .select('id')
        .eq('launch_id', launch.id)
        .eq('criterion_id', criterion.id)
        .single();

    if (lcs) {
        await supabase
            .from('launch_criterion_status')
            .update({ status: 'NO_GO' })
            .eq('id', lcs.id);

        console.log('Triggering recomputation (should send alerts)...');
        await recomputeEpicReadiness(launch.id);
    }

    console.log('Verification script completed. Check logs for "Slack notification sent" and "Email sent".');
}

main().catch(console.error);
