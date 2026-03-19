import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { summarizeRovo } from '@/lib/rovo/client';
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
        const { contentId, contentType } = body;

        if (!contentId) {
            return NextResponse.json(
                { error: 'Content ID is required' },
                { status: 400 }
            );
        }

        if (!contentType || (contentType !== 'jira' && contentType !== 'confluence')) {
            return NextResponse.json(
                { error: 'Content type must be "jira" or "confluence"' },
                { status: 400 }
            );
        }

        const result = await summarizeRovo({
            contentId,
            contentType,
        });

        return NextResponse.json({
            success: true,
            result,
        });
    } catch (error: any) {
        console.error('ROVO summarize error:', error);
        return NextResponse.json(
            { 
                error: 'Summarization failed',
                message: error.message || 'Failed to summarize content',
            },
            { status: 500 }
        );
    }
}
