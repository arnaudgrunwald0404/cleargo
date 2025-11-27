import * as dotenv from 'dotenv';
import { join } from 'path';

// Load env vars before anything else
dotenv.config({ path: join(process.cwd(), '.env.local') });

async function main() {
    try {
        // Dynamic import to ensure env vars are loaded first
        const { getAhaClient } = await import('../src/lib/aha/client');

        const client = getAhaClient();
        console.log('Fetching custom fields...');
        const response = await client.getCustomFields();

        const fields = response.custom_field_definitions;

        if (fields) {
            console.log(`Found ${fields.length} custom fields.`);
            const launchFields = fields.filter((f: any) =>
                f.name.toLowerCase().includes('launch') ||
                f.key.toLowerCase().includes('launch')
            );

            console.log('\nPotential Launch-related fields:');
            launchFields.forEach((f: any) => {
                console.log(`- Name: ${f.name}, Key: ${f.key}, ID: ${f.id}, Type: ${f.custom_fieldable_type}`);
            });

            console.log('\nAll fields:');
            fields.forEach((f: any) => {
                console.log(`- Name: ${f.name}, Key: ${f.key}, ID: ${f.id}, Type: ${f.custom_fieldable_type}`);
            });
        } else {
            console.log('No custom fields found or unexpected response structure:', response);
        }
    } catch (error) {
        console.error('Error fetching custom fields:', error);
    }
}

main();
