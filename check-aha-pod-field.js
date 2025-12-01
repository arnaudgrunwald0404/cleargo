#!/usr/bin/env node
// Script to check AHA epic custom fields structure to verify pod field key
require('dotenv').config({ path: '.env' });

const AHA_DOMAIN = process.env.AHA_DOMAIN;
const AHA_API_TOKEN = process.env.AHA_API_TOKEN;
const BASE_URL = `https://${AHA_DOMAIN}/api/v1`;

async function checkAhaPodField() {
    try {
        if (!AHA_DOMAIN || !AHA_API_TOKEN) {
            throw new Error('AHA_DOMAIN and AHA_API_TOKEN must be set');
        }
        
        // Get a few epics to check their custom fields structure
        console.log('Fetching epics from AHA...\n');
        const fields = ['id', 'reference_num', 'name', 'custom_fields'].join(',');
        const url = `${BASE_URL}/epics?per_page=5&fields=${encodeURIComponent(fields)}`;
        
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
        
        if (!data || !data.epics || data.epics.length === 0) {
            console.log('No epics found');
            return;
        }

        console.log(`Found ${data.epics.length} epics. Checking custom fields structure...\n`);

        data.epics.forEach((epic, index) => {
            console.log(`${index + 1}. Epic: ${epic.name} (${epic.reference_num || epic.id})`);
            
            if (!epic.custom_fields) {
                console.log(`   No custom_fields`);
                console.log('');
                return;
            }
            
            // Check if it's an array or object
            if (Array.isArray(epic.custom_fields)) {
                console.log(`   Custom fields is an ARRAY with ${epic.custom_fields.length} items`);
                
                // Show first few items structure
                if (epic.custom_fields.length > 0) {
                    console.log(`   First item structure:`, JSON.stringify(epic.custom_fields[0], null, 2));
                }
                
                // Look for pod-related fields
                const podFields = epic.custom_fields.filter(field => {
                    const fieldStr = JSON.stringify(field).toLowerCase();
                    return fieldStr.includes('pod') || fieldStr.includes('backlog') || fieldStr.includes('dev');
                });
                
                if (podFields.length > 0) {
                    console.log(`   Pod-related fields found:`);
                    podFields.forEach(field => {
                        console.log(`      -`, JSON.stringify(field, null, 2));
                    });
                } else {
                    console.log(`   No pod-related fields found in array`);
                }
                
                // Check for dev_backlog_pod specifically
                const devBacklogPod = epic.custom_fields.find(field => field?.key === 'dev_backlog_pod');
                if (devBacklogPod) {
                    console.log(`   ✓ dev_backlog_pod found:`, JSON.stringify(devBacklogPod, null, 2));
                }
            } else {
                console.log(`   Custom fields is an OBJECT`);
                console.log(`   Keys: ${Object.keys(epic.custom_fields).join(', ')}`);
                
                // Check for pod-related fields
                const podKeys = Object.keys(epic.custom_fields).filter(key => 
                    key.toLowerCase().includes('pod') || 
                    key.toLowerCase().includes('backlog') ||
                    key.toLowerCase().includes('dev')
                );
                
                if (podKeys.length > 0) {
                    podKeys.forEach(key => {
                        console.log(`      - ${key}:`, JSON.stringify(epic.custom_fields[key], null, 2));
                    });
                }
            }
            
            console.log('');
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

checkAhaPodField();

