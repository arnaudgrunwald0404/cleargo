#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');
const slackHandle = process.argv[2] || 'U07MZT4S3DX';

const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!key || !url) {
  console.error('Missing SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('app_user')
    .select('id, email, first_name, last_name, name, slack_handle')
    .eq('slack_handle', slackHandle)
    .maybeSingle();

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  if (!data) {
    console.log('No app_user found with slack_handle =', slackHandle);
    process.exit(0);
  }
  console.log(JSON.stringify(data, null, 2));
}

run();
