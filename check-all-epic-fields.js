#!/usr/bin/env node
// Check all custom fields across many epics to get comprehensive list
require('dotenv').config({ path: '.env' });

const AHA_DOMAIN = process.env.AHA_DOMAIN;
const AHA_API_TOKEN = process.env.AHA_API_TOKEN;
const BASE_URL = `https://${AHA_DOMAIN}/api/v1`;

async function getAllCustomFields() {
    // Fetch more epics to get comprehensive field list
    const fields = ['id', 'reference_num', 'name', 'custom_fields'].join(',');
    
    // Fetch multiple pages
    const allEpics = [];
    for (let page = 1; page <= 5; page++) {
        const url = `${BASE_URL}/epics?per_page=100&page=${page}&fields=${encodeURIComponent(fields)}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${AHA_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) break;
        
        const data = await response.json();
        if (!data.epics || data.epics.length === 0) break;
        
        allEpics.push(...data.epics);
        console.log(`Fetched page ${page}: ${data.epics.length} epics`);
        
        if (data.epics.length < 100) break; // Last page
    }
    
    console.log(`\nTotal epics fetched: ${allEpics.length}\n`);
    
    // Collect all unique custom field keys
    const fieldMap = new Map();
    
    allEpics.forEach(epic => {
        if (Array.isArray(epic.custom_fields)) {
            epic.custom_fields.forEach(field => {
                if (!fieldMap.has(field.key)) {
                    fieldMap.set(field.key, {
                        name: field.name,
                        type: field.type,
                        sampleValues: new Set(),
                        epics: new Set()
                    });
                }
                const fieldInfo = fieldMap.get(field.key);
                fieldInfo.sampleValues.add(JSON.stringify(field.value).substring(0, 50));
                fieldInfo.epics.add(epic.reference_num || epic.id);
            });
        }
    });
    
    console.log(`Found ${fieldMap.size} unique custom field keys:\n`);
    
    const sortedFields = Array.from(fieldMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    
    sortedFields.forEach(([key, info]) => {
        console.log(`${key.padEnd(50)} - ${info.name.padEnd(40)} (${info.type})`);
        console.log(`  Found in ${info.epics.size} epics`);
        if (info.sampleValues.size > 0) {
            const samples = Array.from(info.sampleValues).slice(0, 3);
            console.log(`  Sample values: ${samples.join(', ')}`);
        }
        console.log('');
    });
    
    return fieldMap;
}

getAllCustomFields().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});












