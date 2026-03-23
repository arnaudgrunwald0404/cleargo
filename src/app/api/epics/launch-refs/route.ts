import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;

        const res = await fetch(
            `${supabaseUrl}/rest/v1/epic?select=launch_ref&launch_ref=not.is.null&order=launch_ref.asc`,
            {
                headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                },
            }
        );

        if (!res.ok) {
            return NextResponse.json({ refs: [] });
        }

        const rows: { launch_ref: string }[] = await res.json();
        const unique = [...new Set(rows.map((r) => r.launch_ref))];
        return NextResponse.json({ refs: unique });
    } catch {
        return NextResponse.json({ refs: [] });
    }
}
