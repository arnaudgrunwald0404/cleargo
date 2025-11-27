import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // TODO: Add RBAC check here to ensure user is Admin/Product Ops

        const searchParams = req.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const entityType = searchParams.get('entity_type');

        const offset = (page - 1) * limit;

        let query = supabase
            .from('audit_log')
            .select(`
                *,
                actor:actor_id (
                    name,
                    email
                )
            `, { count: 'exact' });

        if (entityType) {
            query = query.eq('entity_type', entityType);
        }

        query = query
            .order('taken_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        return NextResponse.json({
            data,
            meta: {
                page,
                limit,
                total: count,
                totalPages: count ? Math.ceil(count / limit) : 0
            }
        });

    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
    }
}
