import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { z } from 'zod';
import { PendoClient } from '@/lib/integrations/pendo/client';

const pendoConfigSchema = z.object({
  api_key_encrypted: z.string().min(1, 'API key is required'),
  environment: z.enum(['prod', 'dev', 'staging']).default('prod'),
});

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Encrypt API key (placeholder - implement actual encryption)
 * TODO: Implement proper encryption using environment secrets
 */
function encryptApiKey(apiKey: string): string {
  // For now, store as-is (in production, use proper encryption)
  // TODO: Implement encryption using Supabase Vault or similar
  return apiKey;
}

/**
 * Decrypt API key (placeholder - implement actual decryption)
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

    // Check permissions - Admin only
    const role = await resolveRole(user.email);
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';

    if (!isAdmin) {
      return forbid();
    }

    const { data, error } = await supabase
      .from('pendo_integrations')
      .select('id, environment, last_sync, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ integration: null });
      }
      throw error;
    }

    return NextResponse.json({
      integration: {
        ...data,
        // Don't return encrypted API key
      },
    });
  } catch (error: any) {
    console.error('Error fetching Pendo integration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pendo integration', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions - Admin only
    const role = await resolveRole(user.email);
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';

    if (!isAdmin) {
      return forbid();
    }

    // Validate request body
    const body = await req.json();
    const parsed = pendoConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Test connection
    const apiKey = decryptApiKey(parsed.data.api_key_encrypted);
    const client = new PendoClient({
      apiKey,
      environment: parsed.data.environment,
    });

    try {
      const connectionTest = await client.testConnection();
      if (!connectionTest) {
        return NextResponse.json(
          { error: 'Failed to connect to Pendo API. Please check your API key and ensure it has the correct permissions.' },
          { status: 400 }
        );
      }
    } catch (error: any) {
      console.error('Pendo connection test error:', error);
      // Provide more specific error messages based on HTTP status code
      let errorMessage = 'Failed to connect to Pendo API. ';
      const status = error.status || (error.message?.match(/\d{3}/)?.[0]);
      
      if (status === 401 || error.message?.includes('401')) {
        errorMessage += 'Authentication failed - please verify your API key is correct and matches your Pendo account.';
      } else if (status === 403 || error.message?.includes('403')) {
        errorMessage += 'Access forbidden - please check that your API key has the necessary permissions (read access required).';
      } else if (status === 404 || error.message?.includes('404')) {
        errorMessage += 'API endpoint not found - please verify your Pendo environment setting (prod/dev/staging).';
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage += 'Network error - please check your internet connection and firewall settings.';
      } else {
        // Extract the actual error message from Pendo API if available
        const pendoError = error.message?.replace('Pendo API error: ', '') || error.message || 'Unknown error';
        errorMessage += pendoError;
      }
      return NextResponse.json(
        { error: errorMessage, details: error.message },
        { status: 400 }
      );
    }

    // Encrypt and store
    const encryptedKey = encryptApiKey(parsed.data.api_key_encrypted);

    // Check if integration already exists
    const { data: existing } = await supabase
      .from('pendo_integrations')
      .select('id')
      .limit(1)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('pendo_integrations')
        .update({
          api_key_encrypted: encryptedKey,
          environment: parsed.data.environment,
          status: 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('pendo_integrations')
        .insert({
          api_key_encrypted: encryptedKey,
          environment: parsed.data.environment,
          status: 'connected',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({
      integration: {
        id: result.id,
        environment: result.environment,
        status: result.status,
        last_sync: result.last_sync,
        created_at: result.created_at,
        updated_at: result.updated_at,
      },
    }, { status: existing ? 200 : 201 });
  } catch (error: any) {
    console.error('Error configuring Pendo integration:', error);
    return NextResponse.json(
      { error: 'Failed to configure Pendo integration', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions - Admin only
    const role = await resolveRole(user.email);
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';

    if (!isAdmin) {
      return forbid();
    }

    const { error } = await supabase
      .from('pendo_integrations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting Pendo integration:', error);
    return NextResponse.json(
      { error: 'Failed to delete Pendo integration', details: error.message },
      { status: 500 }
    );
  }
}

