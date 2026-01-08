const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkUser() {
  const email = 'agrunwald@clearcompany.com';
  
  console.log(`Checking user profile for: ${email}`);
  
  const { data: user, error } = await supabase
    .from('app_user')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      console.log('❌ User profile NOT FOUND in app_user table');
      console.log('This is likely the issue - the user needs a profile created.');
    } else {
      console.error('Error:', error);
    }
  } else {
    console.log('✅ User profile found:');
    console.log(JSON.stringify(user, null, 2));
  }
}

checkUser().catch(console.error);
