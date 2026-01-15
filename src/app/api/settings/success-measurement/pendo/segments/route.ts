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

    try {
      const apiKey = decryptApiKey(integration.api_key_encrypted);
      const client = new PendoClient({
        apiKey,
        environment: integration.environment,
      });

      const segments = await client.getSegments();

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

