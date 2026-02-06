import { NextRequest, NextResponse } from 'next/server';
import { getRateLimitStats } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest) {
    try {
        // Check authentication
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        // Check admin permissions
        const supabase = createClient();
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
            .single();
        
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            return NextResponse.json({ error: 'Failed to fetch user profile', details: userError.message }, { status: 500 });
        }
        
        const rules = await getEffectivePermissionRules();
        const hasAdminAccess = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.read', rules);
        if (!hasAdminAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }
        
        const stats = getRateLimitStats();
        
        // Calculate aggregate statistics
        const totalRequests = stats.reduce((sum, stat) => sum + stat.count, 0);
        const totalRemaining = stats.reduce((sum, stat) => sum + stat.remaining, 0);
        const activeIdentifiers = stats.length;
        const rateLimitExceeded = stats.filter(stat => stat.remaining === 0).length;
        
        // Group by identifier prefix (api:, email, etc.)
        const byType: Record<string, number> = {};
        stats.forEach(stat => {
            const prefix = stat.identifier.split(':')[0] || 'unknown';
            byType[prefix] = (byType[prefix] || 0) + stat.count;
        });
        
        // Get top identifiers by request count
        const topIdentifiers = [...stats]
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)
            .map(stat => ({
                identifier: stat.identifier,
                count: stat.count,
                remaining: stat.remaining,
                resetTime: new Date(stat.resetTime).toISOString(),
                percentageUsed: Math.round((stat.count / stat.maxRequests) * 100)
            }));
        
        return NextResponse.json({
            summary: {
                totalRequests,
                totalRemaining,
                activeIdentifiers,
                rateLimitExceeded,
                timestamp: new Date().toISOString()
            },
            byType,
            topIdentifiers,
            allStats: stats.map(stat => ({
                identifier: stat.identifier,
                count: stat.count,
                remaining: stat.remaining,
                resetTime: new Date(stat.resetTime).toISOString(),
                maxRequests: stat.maxRequests,
                percentageUsed: Math.round((stat.count / stat.maxRequests) * 100)
            }))
        });
    } catch (error: any) {
        console.error('Error fetching performance stats:', error);
        
        // If it's a permission error, return 403
        if (error.message?.includes('Forbidden') || error.message?.includes('role')) {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            );
        }
        
        return NextResponse.json(
            { error: error.message || 'Failed to fetch performance stats' },
            { status: 500 }
        );
    }
}

export const GET = handler;
