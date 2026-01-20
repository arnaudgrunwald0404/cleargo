import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@/lib/supabase/server';
import { getCustomFields } from '@/lib/aha/client';
import { loadAhaConfig, clearAhaConfigCache } from '@/lib/aha/mapping';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        // Check authentication
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
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

        // Clear cache to ensure we get fresh config
        clearAhaConfigCache();
        
        const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
        const configData = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configData);
        
        // Standard fields from AhaEpic
        const standardFields = [
            { alias: 'id', label: 'ID', key: null, type: 'standard' },
            { alias: 'reference_num', label: 'Reference Number', key: null, type: 'standard' },
            { alias: 'name', label: 'Name', key: null, type: 'standard' },
            { alias: 'url', label: 'URL', key: null, type: 'standard' },
            { alias: 'description', label: 'Description', key: null, type: 'standard' },
            { alias: 'workflow_status', label: 'Workflow Status', key: null, type: 'standard' },
            { alias: 'assigned_to_user', label: 'Assigned To User', key: null, type: 'standard' },
            { alias: 'tags', label: 'Tags', key: null, type: 'standard' },
            { alias: 'release', label: 'Release', key: null, type: 'standard' },
            { alias: 'integrations', label: 'Integrations', key: null, type: 'standard' },
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
        
        console.log(`Returning ${standardFields.length} standard fields and ${customFields.length} custom fields`);
        
        return NextResponse.json({ fields });
    } catch (error: any) {
        console.error('Error loading AHA fields config:', error);
        return NextResponse.json(
            { error: 'Failed to load AHA fields config', details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        // Check authentication
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: settings.ahaFields.read (same as GET for now, can be changed to a separate permission)
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

        // Fetch custom field definitions from Aha! API
        const customFieldsResponse = await getCustomFields();
        const config = loadAhaConfig();

        // Map custom fields by label
        // Aha! API returns custom_field_definitions array
        const fieldsByLabel = new Map<string, any>();
        const customFields = customFieldsResponse.custom_field_definitions || customFieldsResponse.custom_fields || [];
        
        for (const field of customFields) {
            fieldsByLabel.set(field.name, field);
        }

        // Update config with discovered keys
        let updatedCount = 0;
        const updates: Array<{ alias: string; label: string; key: string }> = [];
        const notFound: Array<{ alias: string; label: string }> = [];

        for (const [alias, fieldConfig] of Object.entries(config.fields)) {
            const ahaField = fieldsByLabel.get(fieldConfig.label);
            if (ahaField) {
                const oldKey = fieldConfig.key;
                fieldConfig.key = ahaField.key;
                if (oldKey !== ahaField.key) {
                    updatedCount++;
                    updates.push({ alias, label: fieldConfig.label, key: ahaField.key });
                }
            } else {
                notFound.push({ alias, label: fieldConfig.label });
            }
        }

        // Save updated config
        const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
        writeFileSync(configPath, JSON.stringify(config, null, 2));

        // Clear cache so next GET request loads fresh config
        clearAhaConfigCache();

        // Return refreshed fields list (same format as GET)
        const standardFields = [
            { alias: 'id', label: 'ID', key: null, type: 'standard' },
            { alias: 'reference_num', label: 'Reference Number', key: null, type: 'standard' },
            { alias: 'name', label: 'Name', key: null, type: 'standard' },
            { alias: 'url', label: 'URL', key: null, type: 'standard' },
            { alias: 'description', label: 'Description', key: null, type: 'standard' },
            { alias: 'workflow_status', label: 'Workflow Status', key: null, type: 'standard' },
            { alias: 'assigned_to_user', label: 'Assigned To User', key: null, type: 'standard' },
            { alias: 'tags', label: 'Tags', key: null, type: 'standard' },
            { alias: 'release', label: 'Release', key: null, type: 'standard' },
            { alias: 'integrations', label: 'Integrations', key: null, type: 'standard' },
        ];
        
        const customFields = Object.entries(config.fields).map(([alias, field]: [string, any]) => ({
            alias,
            label: field.label,
            key: field.key || null,
            type: 'custom',
        }));
        
        const fields = [...standardFields, ...customFields];

        return NextResponse.json({
            fields,
            refresh: {
                updated: updatedCount,
                updates,
                notFound: notFound.length > 0 ? notFound : undefined,
                totalCustomFields: customFields.length,
            },
        });
    } catch (error: any) {
        console.error('Error refreshing AHA fields:', error);
        return NextResponse.json(
            { error: 'Failed to refresh AHA fields', details: error.message },
            { status: 500 }
        );
    }
}

