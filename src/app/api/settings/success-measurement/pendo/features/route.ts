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

/**
 * Decrypt API key (placeholder - implement actual decryption)
 * TODO: Implement proper decryption using environment secrets
 */
function decryptApiKey(encryptedKey: string): string {
  // For now, return as-is
  // TODO: Implement decryption
  return encryptedKey;
}

/**
 * GET /api/settings/success-measurement/pendo/features
 * 
 * Fetches all feature tags from Pendo.
 * Feature tags are UI elements tagged in Pendo's Visual Design Studio.
 * They can be used to track clicks/engagement on specific UI elements.
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

    // Get Pendo integration
    const integration = await getPendoIntegration();
    if (!integration) {
      const supabaseClient = createClient();
      const { data: integrations } = await supabaseClient
        .from('pendo_integrations')
        .select('id, status')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (integrations && integrations.length > 0) {
        const existingIntegration = integrations[0];
        console.log(`Pendo integration exists but status is '${existingIntegration.status}', not 'connected'`);
        return NextResponse.json({ 
          error: `Pendo integration exists but is not connected (status: ${existingIntegration.status}). Please configure it in Settings.`,
          features: [] 
        }, { status: 200 });
      }
      
      console.log('No Pendo integration found in database');
      return NextResponse.json({ 
        error: 'Pendo integration not configured',
        features: [] 
      }, { status: 200 });
    }

    // Optional query params for filtering
    const url = new URL(req.url);
    const appId = url.searchParams.get('appId');
    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const daysParam = Number(url.searchParams.get('days') || 3);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 3;
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    try {
      const apiKey = decryptApiKey(integration.api_key_encrypted);
      const client = new PendoClient({
        apiKey,
        environment: integration.environment,
      });

      // Build cache key from all params that affect the result
      const cacheKey = buildCacheKey('features', {
        appId,
        activeOnly: String(activeOnly),
        days: String(days),
      });

      const { data: simplifiedFeatures, fromCache } = await getOrFetchPendo<
        Array<{
          id: string;
          name: string;
          appId: string;
          kind: string;
          group: string | null;
          createdAt: string | null;
          hasSelectors: boolean;
        }>
      >({
        cacheKey,
        ttlSeconds: PENDO_CACHE_TTL.features,
        forceRefresh,
        fetchFn: async () => {
          let features = await client.getFeatures();
          
          // Filter by app if specified
          if (appId) {
            features = features.filter(f => f.appId === appId);
          }

          if (activeOnly) {
            const today = new Date();
            const start = new Date(today);
            start.setDate(start.getDate() - days);
            const startDate = start.toISOString().split('T')[0];
            const endDate = today.toISOString().split('T')[0];

            const checks = await Promise.all(
              features.map(async (feature) => {
                const count = await client.getEventCount({
                  eventId: feature.id,
                  startDate,
                  endDate,
                });
                return { feature, count };
              })
            );

            features = checks.filter(c => c.count > 0).map(c => c.feature);
          }

          // Transform to a simpler format for the UI
          return features.map(f => ({
            id: f.id,
            name: f.name,
            appId: f.appId,
            kind: f.kind,
            group: f.group,
            createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : null,
            hasSelectors: f.elementPathRules.length > 0 || f.eventPropertyConfigurations.length > 0,
          }));
        },
      });
      
      console.log(`Returning ${simplifiedFeatures.length} Pendo features to client (fromCache: ${fromCache})`);
      
      return NextResponse.json({ 
        features: simplifiedFeatures,
        count: simplifiedFeatures.length,
        cached: fromCache,
      });
    } catch (error: any) {
      console.error('Error fetching Pendo features:', error);
      return NextResponse.json({ 
        features: [],
        warning: 'Failed to fetch features from Pendo API.'
      });
    }
  } catch (error: any) {
    console.error('Error in Pendo features endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pendo features', details: error.message },
      { status: 500 }
    );
  }
}
