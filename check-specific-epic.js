#!/usr/bin/env node
// Check a specific epic that should have pod value
require('dotenv').config({ path: '.env' });

const AHA_DOMAIN = process.env.AHA_DOMAIN;
const AHA_API_TOKEN = process.env.AHA_API_TOKEN;
const BASE_URL = `https://${AHA_DOMAIN}/api/v1`;

async function checkEpic(epicId) {
    try {
        const fields = ['id', 'reference_num', 'name', 'custom_fields'].join(',');
        const url = `${BASE_URL}/epics/${epicId}?fields=${encodeURIComponent(fields)}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${AHA_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            throw new Error(`AHA API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const epic = data.epic;
        
        console.log(`Epic: ${epic.name} (${epic.reference_num || epic.id})\n`);
        
        if (Array.isArray(epic.custom_fields)) {
            console.log(`Custom fields (${epic.custom_fields.length} items):\n`);
            
            // Find dev_backlog_pod
            const podField = epic.custom_fields.find(f => f.key === 'dev_backlog_pod');
            if (podField) {
                console.log('✓ Found dev_backlog_pod field:');
                console.log(JSON.stringify(podField, null, 2));
            } else {
                console.log('✗ dev_backlog_pod field NOT found');
                console.log('\nAvailable field keys:');
                epic.custom_fields.forEach(f => {
                    console.log(`  - ${f.key} (${f.name}): ${JSON.stringify(f.value)}`);
                });
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Check the epics from our launches
const epicIds = ['APP-E-511', 'APP-E-587', 'APP-E-88', 'APP-E-609'];

async function checkAll() {
    for (const epicId of epicIds) {
        console.log(`\n${'='.repeat(60)}\n`);
        await checkEpic(epicId);
    }
}

checkAll();



