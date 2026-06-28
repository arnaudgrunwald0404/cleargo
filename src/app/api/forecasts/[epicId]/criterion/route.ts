import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

const ScoreCriterionSchema = z.object({
    criterion_label: z.string().min(1),
    status: z.enum(['GO', 'NO_GO', 'CONDITIONAL_GO']).default('GO'),
    notes: z.string().optional(),
    report_url: z.string().url().optional(),
});

// PATCH /api/forecasts/[epicId]/criterion
// Scores a launch readiness criterion on an epic by partial label match.
// epicId = Aha reference_num, e.g. "APP-E-670"
//
// Body: { criterion_label, status?, notes?, report_url? }
//   criterion_label: partial match, e.g. "Revenue Forecast" matches "Revenue Forecast & Risk Analysis"
//   status: "GO" (default), "NO_GO", or "CONDITIONAL_GO"
//   notes: free-text comment attached to the score
//   report_url: if provided, appended to notes automatically
async function patchHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    if (!validateApiKey(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { epicId: epicAhaId } = await params;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = ScoreCriterionSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const { criterion_label, status, notes, report_url } = parsed.data;
    const adminSupabase = createAdminClient();

    // Look up epic by Aha reference number
    const { data: epic, error: epicError } = await adminSupabase
        .from('epic')
        .select('id')
        .eq('aha_id', epicAhaId)
        .maybeSingle();

    if (epicError) {
        return NextResponse.json({ error: 'Failed to fetch epic' }, { status: 500 });
    }
    if (!epic) {
        return NextResponse.json({ error: `Epic ${epicAhaId} not found` }, { status: 404 });
    }

    // Find the epic_criterion_status row whose criterion label partially matches
    const { data: statuses, error: statusError } = await adminSupabase
        .from('epic_criterion_status')
        .select('id, status, criterion:criterion_id(id, label)')
        .eq('epic_id', epic.id);

    if (statusError) {
        return NextResponse.json({ error: 'Failed to fetch criteria' }, { status: 500 });
    }

    const searchTerm = criterion_label.toLowerCase();
    const match = (statuses ?? []).find((row) => {
        const label = (row.criterion as { label?: string } | null)?.label ?? '';
        return label.toLowerCase().includes(searchTerm);
    });

    if (!match) {
        return NextResponse.json(
            {
                error: `No criterion found matching "${criterion_label}" on epic ${epicAhaId}`,
                available_criteria: (statuses ?? []).map(
                    (r) => (r.criterion as { label?: string } | null)?.label ?? '(unnamed)'
                ),
            },
            { status: 404 }
        );
    }

    const criterionLabel = (match.criterion as { label?: string } | null)?.label ?? criterion_label;

    // Build the notes string
    const fullNotes = [
        notes,
        report_url ? `Report: ${report_url}` : null,
    ]
        .filter(Boolean)
        .join(' — ') || null;

    const updatePayload: Record<string, unknown> = { status };
    if (fullNotes !== null) updatePayload.current_status_notes = fullNotes;

    const { data: updated, error: updateError } = await adminSupabase
        .from('epic_criterion_status')
        .update(updatePayload)
        .eq('id', match.id)
        .select('id, status, current_status_notes')
        .single();

    if (updateError) {
        return NextResponse.json({ error: 'Failed to update criterion' }, { status: 500 });
    }

    return NextResponse.json({
        updated: true,
        criterion_label: criterionLabel,
        lcs_id: match.id,
        status: updated.status,
        notes: updated.current_status_notes,
    });
}

export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
