import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
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

    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
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

      const appsWithNames = apps.map((app) => {
        // Ensure app.id is a string for consistent key matching
        const appIdKey = String(app.id);
        // Get override, trying both the string key and original key format
        const override = appNameOverrides[appIdKey] || appNameOverrides[app.id];
        // Use override if available, otherwise use the default name from Pendo client
        const displayName = override || app.name;
        return {
          ...app,
          name: displayName,
        };
      });

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

