import { NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

// GET /api/me/api-key
// Returns the ClearGo AI API key for authenticated users.
// This key is used with the X-ClearGo-Key header to authenticate
// AI tool calls (MCP server, forecast write-backs, etc.).
async function getHandler() {
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const key = process.env.CLEARGO_AI_API_KEY;
    if (!key) {
        return NextResponse.json(
            { error: 'API key not configured — ask your admin to set CLEARGO_AI_API_KEY in Netlify.' },
            { status: 503 }
        );
    }

    return NextResponse.json({ key });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
