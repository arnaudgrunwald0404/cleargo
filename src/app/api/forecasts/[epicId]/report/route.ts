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
// Accepts HTML content and stores it in Supabase Storage. Returns a stable public URL
// and creates an epic_forecast_link record.
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
    let userEmail: string | null = null;

    if (!apiKeyValid) {
        userEmail = await getAuthenticatedUserEmail();
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

        const publicUrl = urlData.publicUrl;

        // Look up the internal epic UUID (may not exist if Aha sync hasn't run yet)
        const { data: epicRow } = await adminSupabase
            .from('epic')
            .select('id')
            .eq('aha_id', epicAhaId)
            .maybeSingle();

        const { data: link, error: insertError } = await adminSupabase
            .from('epic_forecast_link')
            .insert({
                epic_id: epicRow?.id ?? null,
                epic_aha_id: epicAhaId,
                url: publicUrl,
                generation_date: new Date().toISOString().split('T')[0],
                scenario: 'base',
                storage_path: storagePath,
                created_by: userEmail ?? 'api-key',
            })
            .select()
            .single();

        if (insertError) {
            // Clean up the uploaded file to avoid orphans
            await adminSupabase.storage.from('forecast-reports').remove([storagePath]);
            console.error('DB insert error after upload:', insertError);
            return NextResponse.json({ error: 'Failed to create forecast link record' }, { status: 500 });
        }

        return NextResponse.json({ url: publicUrl, id: link.id }, { status: 201 });
    } catch (error: any) {
        console.error('Error in upload_html_report:', error);
        return NextResponse.json(
            { error: 'Failed to upload HTML report', details: error.message },
            { status: 500 }
        );
    }
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.heavy);
