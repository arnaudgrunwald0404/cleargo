import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        // Get production URL from environment variable (server-side)
        let productionUrl = process.env.NEXT_PUBLIC_APP_URL || null;
        
        // If NEXT_PUBLIC_APP_URL is set to localhost, ignore it and try to compute from headers
        // (This handles the case where env var is set to localhost in development)
        if (productionUrl && (productionUrl.includes('localhost') || productionUrl.includes('127.0.0.1'))) {
            console.warn('NEXT_PUBLIC_APP_URL is set to localhost, ignoring and computing from request headers');
            productionUrl = null;
        }
        
        // If not set or was localhost, try to construct from request headers (for production deployments)
        const host = req.headers.get('host');
        const protocol = req.headers.get('x-forwarded-proto') || 
                        (host?.includes('localhost') ? 'http' : 'https');
        
        // Only use computed URL if it's not localhost
        const computedUrl = host && !host.includes('localhost') && !host.includes('127.0.0.1')
            ? `${protocol}://${host}` 
            : null;
        
        // Prefer NEXT_PUBLIC_APP_URL (if not localhost), fallback to computed URL
        const webhookUrl = productionUrl 
            ? `${productionUrl}/api/integrations/aha/webhook`
            : computedUrl 
                ? `${computedUrl}/api/integrations/aha/webhook`
                : null;
        
        return NextResponse.json({ 
            webhookUrl,
            source: productionUrl ? 'NEXT_PUBLIC_APP_URL' : (computedUrl ? 'computed' : 'none'),
            warning: productionUrl === null && computedUrl === null 
                ? 'NEXT_PUBLIC_APP_URL is not set or is set to localhost. Please set it to your production domain in environment variables.'
                : null
        });
    } catch (error: any) {
        console.error('Error getting webhook URL:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get webhook URL' },
            { status: 500 }
        );
    }
}
