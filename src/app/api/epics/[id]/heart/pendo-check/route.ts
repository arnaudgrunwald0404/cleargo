import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getPendoIntegration } from '@/lib/integrations/pendo/service';
import { PendoClient } from '@/lib/integrations/pendo/client';
import { getEpicHeartConfig, getEpicHeartMetrics } from '@/lib/heart/service';

/**
 * GET /api/epics/[id]/heart/pendo-check
 * Verify Pendo data for the metrics on this epic.
 * Returns recent counts per event id (track events + features).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
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

    const config = await getEpicHeartConfig(epicId);
    if (!config) {
      return NextResponse.json({ error: 'No HEART config found' }, { status: 404 });
    }

    const metrics = await getEpicHeartMetrics(config.id);
    if (metrics.length === 0) {
      return NextResponse.json({ error: 'No metrics configured' }, { status: 404 });
    }

    const integration = await getPendoIntegration();
    if (!integration) {
      return NextResponse.json({ error: 'Pendo integration not configured' }, { status: 500 });
    }

    const client = new PendoClient({
      apiKey: integration.api_key_encrypted,
      environment: integration.environment,
    });

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const startDate = start.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    const [trackEvents, features] = await Promise.all([
      client.getEvents().catch(() => []),
      client.getFeatures().catch(() => []),
    ]);

    const idToName: Record<string, string> = {};
    for (const e of trackEvents) {
      if (e.name) idToName[e.name] = e.name;
    }
    for (const f of features) {
      if (f.id && f.name) idToName[f.id] = f.name;
    }

    const metricChecks = await Promise.all(
      metrics.map(async (metric) => {
        const eventChecks = await Promise.all(
          metric.pendo_event_ids.map(async (eventId) => {
            const [count, uniqueUsers, uniqueCompanies] = await Promise.all([
              client.getEventCount({ eventId, startDate, endDate }),
              client.getUniqueVisitors({ eventId, startDate, endDate }),
              client.getUniqueAccounts({ eventId, startDate, endDate }),
            ]);

            return {
              eventId,
              name: idToName[eventId] || eventId,
              count,
              uniqueUsers,
              uniqueCompanies,
            };
          })
        );

        return {
          metricId: metric.id,
          heartCategory: metric.heart_category,
          name: metric.name,
          measurementType: metric.measurement_type,
          eventChecks,
        };
      })
    );

    console.log('[Pendo Check]', JSON.stringify({
      epicId,
      range: { startDate, endDate },
      metricChecks,
    }, null, 2));

    return NextResponse.json({
      epicId,
      range: { startDate, endDate },
      metricChecks,
    });
  } catch (error: any) {
    console.error('Pendo check error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
