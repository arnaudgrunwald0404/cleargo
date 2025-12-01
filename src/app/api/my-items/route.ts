import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveDecisionOwnerEmail } from '@/lib/pod-resolver';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all launch_criterion_status records with launch and criterion info
        const { data: allItems, error: fetchError } = await supabase
            .from('launch_criterion_status')
            .select(`
                *,
                launch:launch_id (
                    id,
                    name,
                    target_launch_date,
                    tier,
                    pod,
                    aha_fields
                ),
                criterion:criterion_id (
                    id,
                    label,
                    category,
                    decision_owner_email
                )
            `)
            .order('last_updated_at', { ascending: false });

        if (fetchError) throw fetchError;

        if (!allItems || allItems.length === 0) {
            return NextResponse.json([]);
        }

        // Filter items where the resolved approver email matches the current user
        const myItems = [];
        for (const item of allItems) {
            const criterionEmail = item.criterion?.decision_owner_email;
            if (!criterionEmail) continue;

            // Get pod from launch
            const pod = item.launch?.pod || 
                       item.launch?.aha_fields?.custom_fields?.dev_backlog_pod || null;

            // Resolve the decision owner email using pod mapping
            const resolvedEmail = await resolveDecisionOwnerEmail(criterionEmail, pod);
            
            // Check if resolved email matches current user
            if (resolvedEmail && resolvedEmail.toLowerCase() === user.email.toLowerCase()) {
                myItems.push(item);
            }
        }

        return NextResponse.json(myItems);
    } catch (error) {
        console.error('Error fetching my items:', error);
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
    }
}
