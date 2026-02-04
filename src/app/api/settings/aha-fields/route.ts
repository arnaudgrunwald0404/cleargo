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

        // Always read config file directly (don't use cache) to ensure fresh data
        // This is important in dev mode where file changes should be reflected immediately
        const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
        const configData = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configData);
        
        // Clear cache after reading to keep it in sync
        clearAhaConfigCache();
        
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
        
        // Clear cache and reload config to ensure we have the latest
        clearAhaConfigCache();
        const config = loadAhaConfig();

        // Map custom fields by label (exact and normalized) and by Aha key for fallback
        const ahaCustomFields = customFieldsResponse.custom_field_definitions || customFieldsResponse.custom_fields || [];
        const fieldsByLabel = new Map<string, any>();
        const fieldsByLabelNormalized = new Map<string, any>();
        const fieldsByKey = new Map<string, any>();
        const normalize = (s: string) => (s || '').trim().toLowerCase();

        for (const field of ahaCustomFields) {
            if (field.name != null) fieldsByLabel.set(field.name, field);
            if (field.name != null) fieldsByLabelNormalized.set(normalize(field.name), field);
            if (field.key != null) fieldsByKey.set(field.key, field);
        }

        // Update config with discovered keys: try exact label, then normalized label, then alias as Aha key
        let updatedCount = 0;
        const updates: Array<{ alias: string; label: string; key: string }> = [];
        const notFound: Array<{ alias: string; label: string }> = [];

        for (const [alias, fieldConfig] of Object.entries(config.fields)) {
            const label = (fieldConfig as { label?: string }).label;
            let ahaField = (label != null ? fieldsByLabel.get(label) ?? fieldsByLabelNormalized.get(normalize(label)) : null)
                ?? (fieldConfig.key ? null : fieldsByKey.get(alias));
            if (ahaField) {
                const oldKey = fieldConfig.key;
                fieldConfig.key = ahaField.key ?? '';
                if (oldKey !== fieldConfig.key) {
                    updatedCount++;
                    updates.push({ alias, label: label ?? alias, key: fieldConfig.key });
                }
            } else {
                notFound.push({ alias, label: label ?? alias });
            }
        }

        // Add any Aha custom fields not yet in config (so "Refresh" surfaces all fields from Aha)
        const labelToAlias = new Map<string, string>();
        for (const [alias, fieldConfig] of Object.entries(config.fields)) {
            labelToAlias.set((fieldConfig as any).label, alias);
        }
        const slugFromName = (name: string) =>
            name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'field';
        for (const ahaField of ahaCustomFields) {
            const name = ahaField.name;
            if (!name || typeof name !== 'string') continue;
            if (labelToAlias.has(name)) continue;
            let alias = slugFromName(name);
            let suffix = 0;
            while ((config.fields as Record<string, unknown>)[alias]) {
                alias = `${slugFromName(name)}_${++suffix}`;
            }
            (config.fields as Record<string, { label: string; key: string }>)[alias] = {
                label: name,
                key: ahaField.key ?? '',
            };
            labelToAlias.set(name, alias);
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

