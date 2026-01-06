import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check authentication
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Capability: settings.ahaFields.read
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();

    // Handle case where user doesn't exist in app_user table
    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }

    const { canRolesPerform } = await import('@/lib/permissions');
    const ok = await canRolesPerform((me?.roles as string[]) || [], 'settings.ahaFields.read');
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
    const configData = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);

    // Standard fields from AhaEpic
    const standardFields = [
      { alias: 'id', label: 'ID', key: null, type: 'standard' },
      { alias: 'reference_num', label: 'Reference Number', key: null, type: 'standard' },
      { alias: 'name', label: 'Name', key: null, type: 'standard' },
      { alias: 'url', label: 'URL', key: null, type: 'standard' },
      { alias: 'workflow_status', label: 'Workflow Status', key: null, type: 'standard' },
      { alias: 'assigned_to_user', label: 'Assigned To User', key: null, type: 'standard' },
      { alias: 'tags', label: 'Tags', key: null, type: 'standard' },
      { alias: 'release', label: 'Release', key: null, type: 'standard' },
    ];

    // Custom fields from config
    const customFields = Object.entries(config.fields).map(([alias, field]: [string, any]) => ({
      alias,
      label: field.label,
      key: field.key || null,
      type: 'custom',
    }));

    // Combine standard and custom fields
    const fields = [...standardFields, ...customFields];

    console.log(
      `Returning ${standardFields.length} standard fields and ${customFields.length} custom fields`
    );

    return NextResponse.json({ fields });
  } catch (error: any) {
    console.error('Error loading AHA fields config:', error);
    return NextResponse.json(
      { error: 'Failed to load AHA fields config', details: error.message },
      { status: 500 }
    );
  }
}
