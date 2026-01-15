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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get Pendo integration
    const integration = await getPendoIntegration();
    if (!integration) {
      // Check if there's any Pendo integration with different status for better error messaging
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
          events: [] 
        }, { status: 200 });
      }
      
      console.log('No Pendo integration found in database');
      return NextResponse.json({ 
        error: 'Pendo integration not configured',
        events: [] 
      }, { status: 200 }); // Return empty array instead of error
    }

    try {
      const apiKey = decryptApiKey(integration.api_key_encrypted);
      const client = new PendoClient({
        apiKey,
        environment: integration.environment,
      });

      const events = await client.getEvents();
      
      console.log(`Returning ${events.length} Pendo events to client`);
      
      return NextResponse.json({ 
        events,
        count: events.length,
      });
    } catch (error: any) {
      console.error('Error fetching Pendo events:', error);
      // Return empty array if API call fails
      // This allows the form to still work with manual entry
      return NextResponse.json({ 
        events: [],
        warning: 'Failed to fetch events from Pendo API. You can still enter event names manually.'
      });
    }
  } catch (error: any) {
    console.error('Error in Pendo events endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pendo events', details: error.message },
      { status: 500 }
    );
  }
}
