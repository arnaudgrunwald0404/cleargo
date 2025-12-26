import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        
        // Get user email from auth
        let userEmail: string | null = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            userEmail = user?.email || null;
        } catch {
            // Continue without user email
        }

        // Try epic table first, fallback to launch table
        let activeEpicsCount = 0;
        let highRiskEpicsCount = 0;
        let pendingItemsCount = 0;

        // Count active epics (not completed)
        try {
            const { count: activeCount, error: activeError } = await supabase
                .from('epic')
                .select('*', { count: 'exact', head: true })
                .not('readiness_status', 'eq', 'COMPLETED');
            
            if (!activeError && activeCount !== null) {
                activeEpicsCount = activeCount;
            } else if (activeError && (activeError.code === '42P01' || activeError.message?.includes('does not exist'))) {
                // Try launch table
                const { count: launchActiveCount } = await supabase
                    .from('epic')
                    .select('*', { count: 'exact', head: true })
                    .not('readiness_status', 'eq', 'COMPLETED');
                activeEpicsCount = launchActiveCount || 0;
            }
        } catch (error) {
            console.warn('Error counting active epics:', error);
        }

        // Count high risk epics
        try {
            const { count: highRiskCount, error: highRiskError } = await supabase
                .from('epic')
                .select('*', { count: 'exact', head: true })
                .eq('risk_level', 'HIGH');
            
            if (!highRiskError && highRiskCount !== null) {
                highRiskEpicsCount = highRiskCount;
            } else if (highRiskError && (highRiskError.code === '42P01' || highRiskError.message?.includes('does not exist'))) {
                // Try launch table
                const { count: launchHighRiskCount } = await supabase
                    .from('epic')
                    .select('*', { count: 'exact', head: true })
                    .eq('risk_level', 'HIGH');
                highRiskEpicsCount = launchHighRiskCount || 0;
            }
        } catch (error) {
            console.warn('Error counting high risk epics:', error);
        }

        // Count pending items for user
        if (userEmail) {
            try {
                const { data: myItems, error: itemsError } = await supabase
                    .rpc('my_items_for_user', { p_email: userEmail });
                
                if (!itemsError && myItems) {
                    // Count items that are NOT_SET or have status that indicates pending
                    pendingItemsCount = myItems.filter((item: any) => 
                        item.status === 'NOT_SET' || 
                        item.status === 'CONDITIONAL' ||
                        !item.status
                    ).length;
                }
            } catch (error) {
                console.warn('Error counting pending items:', error);
            }
        }

        return NextResponse.json({
            activeEpics: activeEpicsCount,
            highRiskEpics: highRiskEpicsCount,
            pendingItems: pendingItemsCount,
        });
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        return NextResponse.json({
            activeEpics: 0,
            highRiskEpics: 0,
            pendingItems: 0,
        });
    }
}
