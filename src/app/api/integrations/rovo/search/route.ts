import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchRovo } from '@/lib/rovo/client';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability check: settings.update
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) throw userError;

        const rules = await getEffectivePermissionRules();
        const canUpdate = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.update', rules);
        if (!canUpdate) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { query, contentType, limit } = body;

        if (!query || !query.trim()) {
            return NextResponse.json(
                { error: 'Query is required' },
                { status: 400 }
            );
        }

        const results = await searchRovo({
            query: query.trim(),
            contentType: contentType || 'both',
            limit: limit || 10,
        });

        return NextResponse.json({
            success: true,
            results,
            count: results.length,
        });
    } catch (error: any) {
        console.error('ROVO search error:', error);
        return NextResponse.json(
            { 
                error: 'Search failed',
                message: error.message || 'Failed to search ROVO',
            },
            { status: 500 }
        );
    }
}
