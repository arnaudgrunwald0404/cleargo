import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

// POST /api/forecasts/[epicId]/report
// Accepts HTML content, stores it in Supabase Storage, and returns the stable public URL.
// Does NOT create an epic_forecast_link record — that is the responsibility of the caller
// (Step 12 of the /forecast skill via POST /link), which adds full metadata including
// arr_upside_3yr. Separating upload from link creation avoids duplicate records.
//
// Body (JSON):  { html_content: string }
// Body (form):  file field containing an HTML file
//
// epicId = Aha reference_num, e.g. "APP-E-1210"
async function postHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    const apiKeyValid = validateApiKey(req);
    if (!apiKeyValid) {
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { epicId: epicAhaId } = await params;

    try {
        let htmlContent: string;
        const contentType = req.headers.get('content-type') ?? '';

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const file = formData.get('file') as File | null;
            if (!file) {
                return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
            }
            htmlContent = await file.text();
        } else {
            const body = await req.json();
            htmlContent = body.html_content;
        }

        if (!htmlContent || typeof htmlContent !== 'string') {
            return NextResponse.json({ error: 'html_content is required' }, { status: 400 });
        }

        if (htmlContent.length > 10 * 1024 * 1024) {
            return NextResponse.json(
                { error: 'HTML content exceeds 10MB limit' },
                { status: 413 }
            );
        }

        const adminSupabase = createAdminClient();
        const storagePath = `${epicAhaId}/${Date.now()}.html`;

        const { error: uploadError } = await adminSupabase.storage
            .from('forecast-reports')
            .upload(storagePath, new Blob([htmlContent], { type: 'text/html' }), {
                contentType: 'text/html',
                upsert: false,
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            return NextResponse.json({ error: 'Failed to upload HTML report' }, { status: 500 });
        }

        const { data: urlData } = adminSupabase.storage
            .from('forecast-reports')
            .getPublicUrl(storagePath);

        return NextResponse.json({ url: urlData.publicUrl }, { status: 201 });
    } catch (error: any) {
        console.error('Error in upload_html_report:', error);
        return NextResponse.json(
            { error: 'Failed to upload HTML report', details: error.message },
            { status: 500 }
        );
    }
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.heavy);
