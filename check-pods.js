#!/usr/bin/env node
// Script to check pod values in database and verify AHA field mapping
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPods() {
    try {
        console.log('Checking launches in database...\n');
        
        // Get all launches with their pod values
        const { data: launches, error } = await supabase
            .from('launch')
            .select('id, name, aha_id, pod, aha_fields')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            throw error;
        }

        console.log(`Found ${launches.length} launches (showing first 20):\n`);

        let launchesWithPods = 0;
        let launchesWithoutPods = 0;
        const podValues = new Set();

        launches.forEach((launch, index) => {
            const hasPod = launch.pod !== null && launch.pod !== '';
            const podInAhaFields = launch.aha_fields?.custom_fields?.dev_backlog_pod;
            
            console.log(`${index + 1}. ${launch.name}`);
            console.log(`   AHA ID: ${launch.aha_id}`);
            console.log(`   Pod (direct): ${launch.pod || 'NULL'}`);
            console.log(`   Pod (in aha_fields.custom_fields.dev_backlog_pod): ${podInAhaFields || 'NULL'}`);
            
            if (hasPod) {
                launchesWithPods++;
                podValues.add(launch.pod);
            } else {
                launchesWithoutPods++;
            }
            console.log('');
        });

        console.log('\n=== Summary ===');
        console.log(`Total launches checked: ${launches.length}`);
        console.log(`Launches with pod: ${launchesWithPods}`);
        console.log(`Launches without pod: ${launchesWithoutPods}`);
        console.log(`\nUnique pod values found: ${Array.from(podValues).join(', ') || 'NONE'}`);

        // Check distinct pods query
        const { data: podData, error: podError } = await supabase
            .from('launch')
            .select('pod')
            .neq('pod', null)
            .neq('pod', '');

        if (podError) {
            console.error('Error fetching pods:', podError);
        } else {
            const distinctPods = new Set();
            podData.forEach(row => {
                if (row.pod) distinctPods.add(row.pod);
            });
            console.log(`\nDistinct pods from database query: ${Array.from(distinctPods).join(', ') || 'NONE'}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkPods();




