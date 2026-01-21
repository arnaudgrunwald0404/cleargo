import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env.local') });

async function checkField() {
    const { getCustomFields } = await import('../src/lib/aha/client');
    const response = await getCustomFields();
    const fields = response.custom_field_definitions || [];
    
    // Search for multiple fields
    const field1 = fields.find((f: any) => 
        f.key === 'feature_walkthrough_demo' || 
        (f.name.toLowerCase().includes('feature') && f.name.toLowerCase().includes('walkthrough')) ||
        (f.name.toLowerCase().includes('walkthrough') && f.name.toLowerCase().includes('demo'))
    );
    
    const field2 = fields.find((f: any) => 
        f.key === 'setup_or_migration_process' || 
        (f.name.toLowerCase().includes('setup') && f.name.toLowerCase().includes('migration')) ||
        (f.name.toLowerCase().includes('setup') && f.name.toLowerCase().includes('process')) ||
        (f.name.toLowerCase().includes('migration') && f.name.toLowerCase().includes('process'))
    );
    
    if (field1) {
        console.log('✅ Found feature_walkthrough_demo:');
        console.log(JSON.stringify(field1, null, 2));
        console.log('');
    } else {
        console.log('❌ feature_walkthrough_demo not found');
        const walkthroughFields = fields.filter((f: any) => 
            f.name.toLowerCase().includes('walkthrough') || 
            f.key.toLowerCase().includes('walkthrough')
        );
        if (walkthroughFields.length > 0) {
            console.log('   Similar fields:');
            walkthroughFields.forEach((f: any) => {
                console.log(`     - ${f.name} (key: ${f.key})`);
            });
        }
        console.log('');
    }
    
    if (field2) {
        console.log('✅ Found setup_or_migration_process:');
        console.log(JSON.stringify(field2, null, 2));
    } else {
        console.log('❌ setup_or_migration_process not found');
        const setupFields = fields.filter((f: any) => 
            (f.name.toLowerCase().includes('setup') || f.key.toLowerCase().includes('setup')) ||
            (f.name.toLowerCase().includes('migration') || f.key.toLowerCase().includes('migration'))
        );
        if (setupFields.length > 0) {
            console.log('   Similar fields:');
            setupFields.forEach((f: any) => {
                console.log(`     - ${f.name} (key: ${f.key})`);
            });
        }
    }
}

checkField().catch(console.error);
