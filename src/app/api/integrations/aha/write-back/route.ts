import { NextRequest, NextResponse } from 'next/server';
import { writeBackEpicReadiness } from '@/lib/aha/write-back';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const role = await resolveRole(user.email);
        if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Parse request
        const body = await req.json();
        const { launchId } = body;

        if (!launchId) {
            return NextResponse.json({ error: 'launchId is required' }, { status: 400 });
        }

        // Trigger write-back
        await writeBackEpicReadiness(launchId);

        return NextResponse.json({ message: 'Write-back completed successfully' }, { status: 200 });

    } catch (error) {
        console.error('Write-back error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: (error as Error).message },
            { status: 500 }
        );
    }
}
