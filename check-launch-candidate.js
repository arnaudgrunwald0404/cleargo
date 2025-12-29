#!/usr/bin/env node
// Check if launch_candidate exists as a custom field or tag
require('dotenv').config({ path: '.env' });

const AHA_DOMAIN = process.env.AHA_DOMAIN;
const AHA_API_TOKEN = process.env.AHA_API_TOKEN;
const BASE_URL = `https://${AHA_DOMAIN}/api/v1`;

async function checkLaunchCandidate() {
    // Fetch epics that might have LaunchConsole tag
    const fields = ['id', 'reference_num', 'name', 'custom_fields', 'tags'].join(',');
    const url = `${BASE_URL}/epics?per_page=10&fields=${encodeURIComponent(fields)}`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
    
    const data = await response.json();
    
    console.log('Checking epics for launch_candidate field or LaunchConsole tag...\n');
    
    data.epics.forEach(epic => {
        const hasLaunchConsoleTag = epic.tags?.includes('LaunchConsole');
        const launchCandidateField = Array.isArray(epic.custom_fields) 
            ? epic.custom_fields.find(f => f.key === 'launch_candidate')
            : null;
        
        if (hasLaunchConsoleTag || launchCandidateField) {
            console.log(`Epic: ${epic.name} (${epic.reference_num || epic.id})`);
            console.log(`  LaunchConsole tag: ${hasLaunchConsoleTag ? 'YES' : 'NO'}`);
            if (launchCandidateField) {
                console.log(`  launch_candidate field:`, JSON.stringify(launchCandidateField, null, 2));
            } else {
                console.log(`  launch_candidate field: NOT FOUND`);
            }
            console.log('');
        }
    });
}

checkLaunchCandidate().catch(console.error);













