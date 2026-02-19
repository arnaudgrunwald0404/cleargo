import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getPendoIntegration } from '@/lib/integrations/pendo/service';
import { PendoClient } from '@/lib/integrations/pendo/client';
import {
  buildCacheKey,
  getOrFetchPendo,
  PENDO_CACHE_TTL,
} from '@/lib/integrations/pendo/cache';

function decryptApiKey(encryptedKey: string): string {
  return encryptedKey;
}

/**
 * GET /api/settings/success-measurement/pendo/pages
 *
 * Fetches all tagged pages from Pendo.
 * Pages represent product screens / URL patterns instrumented in Pendo.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const integration = await getPendoIntegration();
    if (!integration) {
      return NextResponse.json({ error: 'Pendo integration not configured', pages: [] }, { status: 200 });
    }

    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    try {
      const apiKey = decryptApiKey(integration.api_key_encrypted);
      const client = new PendoClient({ apiKey, environment: integration.environment });

      const cacheKey = buildCacheKey('pages', {});

      const { data: pages, fromCache } = await getOrFetchPendo<
        Array<{ id: string; name: string; appId: string }>
      >({
        cacheKey,
        ttlSeconds: PENDO_CACHE_TTL.features,
        forceRefresh,
        fetchFn: async () => {
          const raw = await client.getPages();
          return raw.map(p => ({ id: p.id, name: p.name, appId: p.appId }));
        },
      });

      return NextResponse.json({
        pages,
        count: pages.length,
        cached: fromCache,
      });
    } catch (error: any) {
      console.error('Error fetching Pendo pages:', error);
      return NextResponse.json({ pages: [], warning: 'Failed to fetch pages from Pendo API.' });
    }
  } catch (error: any) {
    console.error('Error in Pendo pages endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pendo pages', details: error.message },
      { status: 500 }
    );
  }
}
