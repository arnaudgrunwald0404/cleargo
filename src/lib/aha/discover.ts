import { getCustomFields } from './client';
import { loadAhaConfig } from './mapping';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Utility to discover Aha custom field keys and populate aha-custom-fields.json
 * Run this as a one-time setup or when custom fields change in Aha
 */
export async function discoverCustomFields(): Promise<void> {
  console.log('Fetching custom field definitions from Aha...');

  const customFieldsResponse = await getCustomFields();
  const config = loadAhaConfig();

  // Map custom fields by label
  const fieldsByLabel = new Map<string, any>();

  if (customFieldsResponse.custom_fields) {
    for (const field of customFieldsResponse.custom_fields) {
      fieldsByLabel.set(field.name, field);
    }
  }

  // Update config with discovered keys
  let updatedCount = 0;
  for (const [_alias, fieldConfig] of Object.entries(config.fields)) {
    const ahaField = fieldsByLabel.get(fieldConfig.label);
    if (ahaField) {
      fieldConfig.key = ahaField.key;
      updatedCount++;
      console.log(`✓ Found key for "${fieldConfig.label}": ${ahaField.key}`);
    } else {
      console.warn(`✗ No match found for "${fieldConfig.label}"`);
    }
  }

  // Save updated config
  const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`\nDiscovery complete! Updated ${updatedCount} field keys.`);
  console.log(`Config saved to: ${configPath}`);
}

// CLI usage: node -r ts-node/register src/lib/aha/discover.ts
if (require.main === module) {
  discoverCustomFields()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Discovery failed:', error);
      process.exit(1);
    });
}
