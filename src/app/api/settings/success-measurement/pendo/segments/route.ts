import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import { getPendoIntegration } from '@/lib/integrations/pendo/service';
import { PendoClient } from '@/lib/integrations/pendo/client';

/**
 * Decrypt API key (placeholder - implement actual decryption)
 * TODO: Implement proper decryption using environment secrets
 */
function decryptApiKey(encryptedKey: string): string {
  // For now, return as-is
  // TODO: Implement decryption
  return encryptedKey;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mirror the same access pattern as the Pendo events endpoint (admin-only)
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const integration = await getPendoIntegration();
    if (!integration) {
      return NextResponse.json(
        {
          error: 'Pendo integration not configured',
          segments: [],
        },
        { status: 200 }
      );
    }

    // Optional query params for filtering
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const daysParam = Number(url.searchParams.get('days') || 3);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 3;

    try {
      const apiKey = decryptApiKey(integration.api_key_encrypted);
      const client = new PendoClient({
        apiKey,
        environment: integration.environment,
      });

      let segments = await client.getSegments();

      if (activeOnly) {
        const today = new Date();
        const start = new Date(today);
        start.setDate(start.getDate() - days);
        const startDate = start.toISOString().split('T')[0];
        const endDate = today.toISOString().split('T')[0];

        const checks = await Promise.all(
          segments.map(async (segment) => {
            const count = await client.getTotalUniqueVisitors({
              startDate,
              endDate,
              segmentId: segment.id,
            });
            return { segment, count };
          })
        );

        segments = checks.filter(c => c.count > 0).map(c => c.segment);
      }

      return NextResponse.json({
        segments,
        count: segments.length,
      });
    } catch (error: any) {
      console.error('Error fetching Pendo segments:', error);
      return NextResponse.json(
        {
          segments: [],
          warning:
            'Failed to fetch segments from Pendo API. You can still configure metrics without segment filters.',
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    console.error('Error in Pendo segments endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pendo segments', details: error.message },
      { status: 500 }
    );
  }
}

