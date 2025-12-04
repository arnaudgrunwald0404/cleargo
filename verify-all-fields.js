#!/usr/bin/env node
// Script to verify all custom field keys match what AHA API returns
require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');

const AHA_DOMAIN = process.env.AHA_DOMAIN;
const AHA_API_TOKEN = process.env.AHA_API_TOKEN;
const BASE_URL = `https://${AHA_DOMAIN}/api/v1`;

async function fetchEpicsWithAllFields() {
    try {
        // Fetch multiple epics to get a comprehensive list of custom fields
        const fields = ['id', 'reference_num', 'name', 'custom_fields'].join(',');
        const url = `${BASE_URL}/epics?per_page=20&fields=${encodeURIComponent(fields)}`;
        
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
        return data.epics || [];
    } catch (error) {
        console.error('Error fetching epics:', error.message);
        throw error;
    }
}

function loadConfig() {
    const configPath = path.join(process.cwd(), 'config', 'aha-custom-fields.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
}

async function verifyFields() {
    console.log('Fetching epics from AHA to discover all custom field keys...\n');
    
    const epics = await fetchEpicsWithAllFields();
    console.log(`Fetched ${epics.length} epics\n`);
    
    // Collect all unique custom field keys from AHA
    const ahaFieldKeys = new Map(); // key -> { name, sampleValue, sampleEpic }
    
    epics.forEach(epic => {
        if (Array.isArray(epic.custom_fields)) {
            epic.custom_fields.forEach(field => {
                if (!ahaFieldKeys.has(field.key)) {
                    ahaFieldKeys.set(field.key, {
                        name: field.name,
                        sampleValue: field.value,
                        sampleEpic: epic.reference_num || epic.id,
                        type: field.type
                    });
                }
            });
        }
    });
    
    console.log(`Found ${ahaFieldKeys.size} unique custom field keys in AHA:\n`);
    Array.from(ahaFieldKeys.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, info]) => {
            console.log(`  ${key.padEnd(40)} - ${info.name} (type: ${info.type})`);
        });
    
    // Load config
    const config = loadConfig();
    console.log(`\n\nChecking config file (${Object.keys(config.fields).length} fields)...\n`);
    
    const issues = [];
    const matches = [];
    
    Object.entries(config.fields).forEach(([alias, fieldConfig]) => {
        const expectedKey = fieldConfig.key;
        const label = fieldConfig.label;
        
        if (!expectedKey || expectedKey === '') {
            // Empty key is OK for write-only fields
            matches.push({ alias, label, key: expectedKey, status: 'OK (write-only)' });
            return;
        }
        
        if (ahaFieldKeys.has(expectedKey)) {
            const ahaInfo = ahaFieldKeys.get(expectedKey);
            matches.push({ 
                alias, 
                label, 
                key: expectedKey, 
                status: '✓ MATCH',
                ahaName: ahaInfo.name 
            });
        } else {
            // Key not found - check if there's a similar key
            const similarKeys = Array.from(ahaFieldKeys.keys()).filter(k => 
                k.toLowerCase().includes(expectedKey.toLowerCase().substring(0, 5)) ||
                expectedKey.toLowerCase().includes(k.toLowerCase().substring(0, 5))
            );
            
            issues.push({
                alias,
                label,
                expectedKey,
                similarKeys: similarKeys.length > 0 ? similarKeys : null
            });
        }
    });
    
    console.log('\n=== VERIFICATION RESULTS ===\n');
    
    if (issues.length > 0) {
        console.log(`❌ ISSUES FOUND (${issues.length}):\n`);
        issues.forEach(issue => {
            console.log(`  Field: ${issue.alias}`);
            console.log(`    Label: ${issue.label}`);
            console.log(`    Expected key: "${issue.expectedKey}"`);
            if (issue.similarKeys && issue.similarKeys.length > 0) {
                console.log(`    ⚠️  Similar keys found: ${issue.similarKeys.join(', ')}`);
                issue.similarKeys.forEach(similarKey => {
                    const info = ahaFieldKeys.get(similarKey);
                    console.log(`       - "${similarKey}": ${info.name}`);
                });
            } else {
                console.log(`    ❌ Key not found in AHA API`);
            }
            console.log('');
        });
    } else {
        console.log('✅ All field keys match!\n');
    }
    
    console.log(`\n✓ Verified fields (${matches.length}):`);
    matches.forEach(m => {
        if (m.status === '✓ MATCH') {
            console.log(`  ✓ ${m.alias.padEnd(30)} -> ${m.key.padEnd(30)} (${m.ahaName})`);
        } else {
            console.log(`  ${m.status.padEnd(30)} ${m.alias}`);
        }
    });
    
    // Also check for fields in AHA that aren't in config
    const configKeys = new Set(Object.values(config.fields).map(f => f.key).filter(k => k));
    const missingInConfig = Array.from(ahaFieldKeys.keys()).filter(k => !configKeys.has(k));
    
    if (missingInConfig.length > 0) {
        console.log(`\n\n⚠️  Fields in AHA but not in config (${missingInConfig.length}):`);
        missingInConfig.forEach(key => {
            const info = ahaFieldKeys.get(key);
            console.log(`  - ${key.padEnd(40)} - ${info.name}`);
        });
    }
    
    return { issues, matches, ahaFieldKeys };
}

verifyFields().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});




