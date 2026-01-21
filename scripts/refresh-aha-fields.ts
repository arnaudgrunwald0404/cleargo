#!/usr/bin/env tsx
/**
 * Script to refresh Aha! fields by discovering them from the API
 * This updates the config file with discovered field keys
 */

import * as dotenv from 'dotenv';
import { join } from 'path';
import { writeFileSync } from 'fs';

// Load environment variables BEFORE importing anything that needs them
dotenv.config({ path: join(process.cwd(), '.env.local') });

async function refreshFields() {
    console.log('🔄 Fetching custom field definitions from Aha! API...\n');

    try {
        // Dynamic import to ensure env vars are loaded first
        const { getCustomFields } = await import('../src/lib/aha/client');
        const { loadAhaConfig, clearAhaConfigCache } = await import('../src/lib/aha/mapping');
        
        const customFieldsResponse = await getCustomFields();
        const config = loadAhaConfig();

        // Map custom fields by label
        // Aha! API returns custom_field_definitions array
        const fieldsByLabel = new Map<string, any>();
        const customFields = customFieldsResponse.custom_field_definitions || customFieldsResponse.custom_fields || [];
        
        for (const field of customFields) {
            fieldsByLabel.set(field.name, field);
        }

        console.log(`📋 Found ${customFields.length} custom fields in Aha!\n`);

        // Update config with discovered keys
        let updatedCount = 0;
        const updates: Array<{ alias: string; label: string; oldKey?: string; newKey: string }> = [];
        const notFound: Array<{ alias: string; label: string }> = [];

        for (const [alias, fieldConfig] of Object.entries(config.fields)) {
            const ahaField = fieldsByLabel.get(fieldConfig.label);
            if (ahaField) {
                const oldKey = fieldConfig.key;
                if (oldKey !== ahaField.key) {
                    fieldConfig.key = ahaField.key;
                    updatedCount++;
                    updates.push({ 
                        alias, 
                        label: fieldConfig.label, 
                        oldKey: oldKey || undefined,
                        newKey: ahaField.key 
                    });
                    console.log(`✓ Updated "${fieldConfig.label}" (${alias}): ${oldKey || 'no key'} → ${ahaField.key}`);
                } else {
                    console.log(`✓ "${fieldConfig.label}" (${alias}): already up to date (${ahaField.key})`);
                }
            } else {
                notFound.push({ alias, label: fieldConfig.label });
                console.warn(`✗ No match found for "${fieldConfig.label}" (${alias})`);
            }
        }

        // Save updated config
        const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
        writeFileSync(configPath, JSON.stringify(config, null, 2));

        // Clear cache
        clearAhaConfigCache();

        console.log(`\n✅ Refresh complete!`);
        console.log(`   - Updated: ${updatedCount} field(s)`);
        console.log(`   - Not found: ${notFound.length} field(s)`);
        console.log(`   - Config saved to: ${configPath}\n`);

        if (updates.length > 0) {
            console.log('📝 Updated fields:');
            updates.forEach(u => {
                console.log(`   - ${u.label} (${u.alias}): ${u.oldKey || 'no key'} → ${u.newKey}`);
            });
            console.log('');
        }

        if (notFound.length > 0) {
            console.log('⚠️  Fields not found in Aha!:');
            notFound.forEach(nf => {
                console.log(`   - ${nf.label} (${nf.alias})`);
            });
            console.log('');
        }

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error refreshing fields:', error.message);
        console.error(error);
        process.exit(1);
    }
}

refreshFields();
