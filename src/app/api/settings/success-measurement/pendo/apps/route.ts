import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import { getPendoIntegration } from '@/lib/integrations/pendo/service';
import { PendoClient } from '@/lib/integrations/pendo/client';

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

    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const integration = await getPendoIntegration();
    if (!integration) {
      return NextResponse.json(
        {
          error: 'Pendo integration not configured',
          apps: [],
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

      const apps = await client.getApps();

      // Load configurable app name overrides from app_settings, if available
      const { data: settingsRow } = await supabase
        .from('app_settings')
        .select('pendo_app_names')
        .eq('id', 1)
        .maybeSingle();

      const appNameOverrides =
        (settingsRow?.pendo_app_names as Record<string, string> | null) || {};

      const appsWithNames = apps.map((app) => ({
        ...app,
        name: appNameOverrides[app.id] || app.name,
      }));

      return NextResponse.json({
        apps: appsWithNames,
        count: appsWithNames.length,
      });
    } catch (error: any) {
      console.error('Error fetching Pendo apps:', error);
      return NextResponse.json(
        {
          apps: [],
          warning:
            'Failed to fetch apps from Pendo API. You can still configure metrics without app filters.',
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    console.error('Error in Pendo apps endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pendo apps', details: error.message },
      { status: 500 }
    );
  }
}

