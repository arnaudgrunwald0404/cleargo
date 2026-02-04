import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import { getPendoIntegration } from '@/lib/integrations/pendo/service';
import { PendoClient } from '@/lib/integrations/pendo/client';

/**
 * GET /api/test/pendo
 * 
 * Test endpoint to verify Pendo integration is working.
 * Returns sample data from Pendo to prove the connection works.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Get Pendo integration
    const integration = await getPendoIntegration();
    if (!integration) {
      return NextResponse.json({ 
        success: false,
        error: 'Pendo integration not configured',
        hint: 'Go to Settings > Integrations > Pendo to set up your API key'
      }, { status: 200 });
    }

    const client = new PendoClient({
      apiKey: integration.api_key_encrypted, // TODO: decrypt in production
      environment: integration.environment,
    });

    const results: Record<string, any> = {
      connection: 'OK',
      timestamp: new Date().toISOString(),
    };

    // Test 1: Fetch events (track types)
    try {
      const events = await client.getEvents();
      results.trackEvents = {
        count: events.length,
        sample: events.slice(0, 5).map(e => ({
          name: e.name,
          id: e.id,
          description: e.description,
        })),
      };
    } catch (err: any) {
      results.trackEvents = { error: err.message };
    }

    // Test 2: Fetch features
    try {
      const features = await client.getFeatures();
      results.features = {
        count: features.length,
        sample: features.slice(0, 5).map(f => ({
          id: f.id,
          name: f.name,
          kind: f.kind,
        })),
      };
    } catch (err: any) {
      results.features = { error: err.message };
    }

    // Test 3: Fetch segments
    try {
      const segments = await client.getSegments();
      results.segments = {
        count: segments.length,
        sample: segments.slice(0, 5).map(s => ({
          id: s.id,
          name: s.name,
        })),
      };
    } catch (err: any) {
      results.segments = { error: err.message };
    }

    // Test 4: Try to get event count for a sample event (if we have any)
    if (results.trackEvents?.sample?.length > 0) {
      const sampleEventName = results.trackEvents.sample[0].name;
      try {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const count = await client.getEventCount({
          eventId: sampleEventName,
          startDate: weekAgo.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        });
        
        results.sampleEventCount = {
          eventName: sampleEventName,
          period: 'Last 7 days',
          count,
        };
      } catch (err: any) {
        results.sampleEventCount = { error: err.message };
      }
    }

    // Test 5: Try to get feature clicks for a sample feature (if we have any)
    if (results.features?.sample?.length > 0) {
      const sampleFeature = results.features.sample[0];
      try {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const count = await client.getEventCount({
          eventId: sampleFeature.id,
          startDate: weekAgo.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        });
        
        results.sampleFeatureCount = {
          featureId: sampleFeature.id,
          featureName: sampleFeature.name,
          period: 'Last 7 days',
          count,
        };
      } catch (err: any) {
        results.sampleFeatureCount = { error: err.message };
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('Pendo test error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
