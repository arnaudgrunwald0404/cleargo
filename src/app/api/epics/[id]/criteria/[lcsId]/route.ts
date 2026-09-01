import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { scoreEpicCriterion } from '@/lib/services/criterionStatusService';

/**
 * Thin adapter. Everything this used to do inline -- the capability check, the
 * Not Applicable rules, the audit rows, the gate sign-off nudge and the
 * readiness recompute -- now lives in scoreEpicCriterion so the Slack modal and
 * the MCP tool run exactly the same path. See that module for why it returns
 * outcomes rather than throwing.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
    try {
        const { id, lcsId } = await params;
        const supabase = createClient();
        const userEmail = await getAuthenticatedUserEmail();

        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: appUser } = await supabase
            .from('app_user')
            .select('id, email, roles')
            .eq('email', userEmail)
            .maybeSingle();

        if (!appUser) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        const body = await req.json();
        const roles = Array.isArray(appUser.roles)
            ? (appUser.roles as string[])
            : appUser.roles
              ? [String(appUser.roles)]
              : [];

        const result = await scoreEpicCriterion(
            id,
            lcsId,
            {
                status: body.status,
                notes: body.notes,
                condition: body.condition,
                conditionDueDate: body.condition_due_date,
                dataSourceValues: body.data_source_values,
            },
            { id: appUser.id as string, email: appUser.email as string, roles },
            // The web app waits for readiness so the page it returns to is
            // already consistent. Slack and MCP cannot afford to.
            { supabase, readiness: 'await' }
        );

        switch (result.outcome) {
            case 'forbidden':
                return NextResponse.json({ error: result.reason }, { status: 403 });
            case 'not_found':
                return NextResponse.json({ error: result.reason }, { status: 404 });
            case 'rejected':
                return NextResponse.json({ error: result.reason }, { status: 400 });
            case 'updated':
                if (result.warnings.length > 0) {
                    console.warn(
                        `[PATCH /api/epics/${id}/criteria/${lcsId}]`,
                        result.warnings.join('; ')
                    );
                }
                return NextResponse.json(result.row);
        }
    } catch (error: any) {
        console.error('Error updating criterion status:', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to update status', details: error?.details || null },
            { status: 500 }
        );
    }
}