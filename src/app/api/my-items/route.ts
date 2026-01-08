import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

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

        // Get query parameter for showing all items vs pending only
        const { searchParams } = new URL(req.url);
        const showAll = searchParams.get('showAll') === 'true';

        // Let the database filter items using pod->PM mapping and indexes
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
