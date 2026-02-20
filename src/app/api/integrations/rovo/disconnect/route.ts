import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { clearRovoTokens } from '@/lib/rovo/client';
import { resolveRole } from '@/lib/roles';

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user has admin permissions
        const role = await resolveRole(user.email);
        if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await clearRovoTokens();

        return NextResponse.json({
            success: true,
            message: 'ROVO disconnected successfully',
        });
    } catch (error: any) {
        console.error('ROVO disconnect error:', error);
        return NextResponse.json(
            { 
                error: 'Failed to disconnect',
                message: error.message || 'Failed to disconnect ROVO',
            },
            { status: 500 }
        );
    }
}
