import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchRovo } from '@/lib/rovo/client';
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
