import { getCustomFields } from './client';
import { loadAhaConfig } from './mapping';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Utility to discover Aha custom field keys and populate aha-custom-fields.json
 * Run this as a one-time setup or when custom fields change in Aha
 */
export async function discoverCustomFields(): Promise<void> {
    console.log('Fetching custom field definitions from Aha...');

    const customFieldsResponse = await getCustomFields();
    const config = loadAhaConfig();

    // Map custom fields by label (exact and normalized) and by Aha key for fallback
    const customFields = customFieldsResponse.custom_field_definitions || customFieldsResponse.custom_fields || [];
    const fieldsByLabel = new Map<string, any>();
    const fieldsByLabelNormalized = new Map<string, any>();
    const fieldsByKey = new Map<string, any>();
    const normalize = (s: string) => (s || '').trim().toLowerCase();

    for (const field of customFields) {
        if (field.name != null) fieldsByLabel.set(field.name, field);
        if (field.name != null) fieldsByLabelNormalized.set(normalize(field.name), field);
        if (field.key != null) fieldsByKey.set(field.key, field);
    }

    // Update config with discovered keys: try exact label, then normalized label, then alias as Aha key
    let updatedCount = 0;
    for (const [alias, fieldConfig] of Object.entries(config.fields)) {
        const label = fieldConfig.label;
        let ahaField = fieldsByLabel.get(label)
            ?? fieldsByLabelNormalized.get(normalize(label))
            ?? (!fieldConfig.key ? fieldsByKey.get(alias) : null);
        if (ahaField) {
            fieldConfig.key = ahaField.key ?? '';
            updatedCount++;
            console.log(`✓ Found key for "${label}" (${alias}): ${fieldConfig.key}`);
        } else {
            console.warn(`✗ No match found for "${label}" (${alias})`);
        }
    }

    // Save updated config
    const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`\nDiscovery complete! Updated ${updatedCount} field keys.`);
    console.log(`Config saved to: ${configPath}`);
}

// CLI usage: npx tsx src/lib/aha/discover.ts
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    discoverCustomFields()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Discovery failed:', error);
            process.exit(1);
        });
}
