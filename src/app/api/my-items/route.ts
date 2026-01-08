import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getAuthenticatedUserEmail, getAuthenticatedUserWithRoles } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        // Check for custom lr_session cookie (used by magic link)
        const session = await getSession();
        const sessionEmail = session?.email;
        
        // Use email from Supabase auth or from lr_session cookie
        const userEmail = user?.email || sessionEmail;

        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user with roles to check if they're a super admin/CPO
        const appUser = await getAuthenticatedUserWithRoles();
        const roles = (appUser?.roles as string[] | null) || [];
        const isSuperAdmin = roles.some(r => 
            r.toUpperCase() === 'SUPERADMIN' || 
            r.toUpperCase() === 'CPO' || 
            r.toUpperCase() === 'PRODUCT_OPS'
        );

        // Get query parameter for showing all items vs pending only
        const { searchParams } = new URL(req.url);
        const showAll = searchParams.get('showAll') === 'true';

        // If super admin/CPO, return all items from epic_criterion_status
        if (isSuperAdmin) {
            // Fetch all items with joins
            const { data: allItems, error: allError } = await supabase
                .from('epic_criterion_status')
                .select(`
                    id,
                    status,
                    condition,
                    condition_due_date,
                    last_updated_at,
                    decision_owner_id,
                    epic_id,
                    criterion_id
                `)
                .order('last_updated_at', { ascending: false });

            if (allError) throw allError;

            if (!allItems || allItems.length === 0) {
                return NextResponse.json([]);
            }

            // Fetch epics and criteria separately for better performance
            const epicIds = [...new Set(allItems.map((item: any) => item.epic_id).filter(Boolean))];
            const criterionIds = [...new Set(allItems.map((item: any) => item.criterion_id).filter(Boolean))];

            const [epicsResult, criteriaResult] = await Promise.all([
                epicIds.length > 0 ? supabase.from('epic').select('id, name, target_launch_date, tier, pod, aha_fields').in('id', epicIds) : { data: [] },
                criterionIds.length > 0 ? supabase.from('criterion').select('id, label, category, gate, decision_owner_email').in('id', criterionIds) : { data: [] }
            ]);

            const epicsMap = new Map((epicsResult.data || []).map((e: any) => [e.id, e]));
            const criteriaMap = new Map((criteriaResult.data || []).map((c: any) => [c.id, c]));

            // Transform to match my_items_for_user format
            const transformed = allItems.map((item: any) => {
                const epic = epicsMap.get(item.epic_id) || {};
                const criterion = criteriaMap.get(item.criterion_id) || {};
                
                return {
                    id: item.id,
                    status: item.status,
                    condition: item.condition,
                    condition_due_date: item.condition_due_date,
                    last_updated_at: item.last_updated_at,
                    launch: {
                        id: epic.id,
                        name: epic.name,
                        target_launch_date: epic.target_launch_date,
                        tier: epic.tier,
                        pod: epic.pod || (epic.aha_fields?.custom_fields?.dev_backlog_pod)
                    },
                    criterion: {
                        label: criterion.label,
                        category: criterion.category,
                        gate: criterion.gate
                    }
                };
            });

            // Filter by showAll if needed
            const filtered = showAll 
                ? transformed 
                : transformed.filter((item: any) => 
                    !item.status || item.status === 'NOT_SET' || item.status === 'CONDITIONAL'
                );

            return NextResponse.json(filtered);
        }

        // Regular users: use the RPC function
        const { data, error } = await supabase
            .rpc('my_items_for_user', { 
                p_email: userEmail,
                p_show_all: showAll
            });

        if (error) throw error;

        // data already contains launch and criterion JSON fragments per row
        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Error fetching my items:', error);
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
    }
}
