import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { summarizeRovo } from '@/lib/rovo/client';
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
