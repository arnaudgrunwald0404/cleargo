// seed-ai-api-data.ts
// Idempotent seed script for the ClearGO AI chief-of-staff API.
// Inserts sample users, epics, blockers, and milestones using fixed UUIDs.
//
// Usage: npx tsx scripts/seed-ai-api-data.ts

try { require('dotenv').config({ path: '.env.local' }); } catch { /* dotenv optional */ }

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing required env vars.');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY  (or SUPABASE_SECRET_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const ARNAUD_EMAIL = 'agrunwald@clearcompany.com';

const product = {
  id: 'b1000000-0000-0000-0000-000000000001',
  name: 'ClearGO Platform',
  pillar: 'Core Platform',
  pod: 'Platform',
  owner_id: 'a1000000-0000-0000-0000-000000000002', // Eric Guba
};

const users = [
  {
    id: 'a1000000-0000-0000-0000-000000000001',
    name: 'Dan Pope',
    email: 'dpope@clearcompany.com',
    role: 'PM',
    slack_handle: 'dan.pope',
    is_active: true,
    reports_to_email: ARNAUD_EMAIL,
  },
  {
    id: 'a1000000-0000-0000-0000-000000000002',
    name: 'Eric Guba',
    email: 'eguba@clearcompany.com',
    role: 'ENG',
    slack_handle: 'eric.guba',
    is_active: true,
    reports_to_email: ARNAUD_EMAIL,
  },
  {
    id: 'a1000000-0000-0000-0000-000000000003',
    name: 'Marcelo Paiva',
    email: 'mpaiva@clearcompany.com',
    role: 'PMM',
    slack_handle: 'marcelo.paiva',
    is_active: true,
    reports_to_email: ARNAUD_EMAIL,
  },
];

const epics = [
  // Dan Pope's epics
  {
    id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Launch Readiness Dashboard v2',
    product_id: 'b1000000-0000-0000-0000-000000000001',
    tier: 'TIER_1',
    target_launch_date: '2026-05-15',
    status: 'IN_PROGRESS',
    readiness_score: 72,
    risk_level: 'medium',
    owner_id: 'a1000000-0000-0000-0000-000000000001',
  },
  {
    id: 'c1000000-0000-0000-0000-000000000002',
    name: 'AI Insights Module',
    product_id: 'b1000000-0000-0000-0000-000000000001',
    tier: 'TIER_2',
    target_launch_date: '2026-06-01',
    status: 'PLANNED',
    readiness_score: 45,
    risk_level: 'high',
    owner_id: 'a1000000-0000-0000-0000-000000000001',
  },
  {
    id: 'c1000000-0000-0000-0000-000000000003',
    name: 'Reporting Refresh',
    product_id: 'b1000000-0000-0000-0000-000000000001',
    tier: 'TIER_3',
    target_launch_date: '2026-04-30',
    status: 'LAUNCHED',
    readiness_score: 98,
    risk_level: 'low',
    owner_id: 'a1000000-0000-0000-0000-000000000001',
  },
  // Eric Guba's epics
  {
    id: 'c1000000-0000-0000-0000-000000000004',
    name: 'API Rate Limiting v2',
    product_id: 'b1000000-0000-0000-0000-000000000001',
    tier: 'TIER_2',
    target_launch_date: '2026-05-01',
    status: 'IN_PROGRESS',
    readiness_score: 85,
    risk_level: 'low',
    owner_id: 'a1000000-0000-0000-0000-000000000002',
  },
  {
    id: 'c1000000-0000-0000-0000-000000000005',
    name: 'Database Migration Pipeline',
    product_id: 'b1000000-0000-0000-0000-000000000001',
    tier: 'TIER_1',
    target_launch_date: '2026-05-20',
    status: 'IN_PROGRESS',
    readiness_score: 38,
    risk_level: 'critical',
    owner_id: 'a1000000-0000-0000-0000-000000000002',
  },
  // Marcelo Paiva's epics
  {
    id: 'c1000000-0000-0000-0000-000000000006',
    name: 'GTM Playbook Automation',
    product_id: 'b1000000-0000-0000-0000-000000000001',
    tier: 'TIER_2',
    target_launch_date: '2026-05-10',
    status: 'IN_PROGRESS',
    readiness_score: 60,
    risk_level: 'medium',
    owner_id: 'a1000000-0000-0000-0000-000000000003',
  },
  {
    id: 'c1000000-0000-0000-0000-000000000007',
    name: 'Competitive Positioning Update',
    product_id: 'b1000000-0000-0000-0000-000000000001',
    tier: 'TIER_3',
    target_launch_date: '2026-04-25',
    status: 'LAUNCHED',
    readiness_score: 100,
    risk_level: 'low',
    owner_id: 'a1000000-0000-0000-0000-000000000003',
  },
];

const blockers = [
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    epic_id: 'c1000000-0000-0000-0000-000000000002', // AI Insights Module (Dan)
    title: 'Legal review pending for AI data usage policy',
    description: 'Legal team has not signed off on data processing agreement',
    severity: 'high',
    status: 'open',
    owner_id: 'a1000000-0000-0000-0000-000000000001',
    logged_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'd1000000-0000-0000-0000-000000000002',
    epic_id: 'c1000000-0000-0000-0000-000000000005', // DB Migration Pipeline (Eric)
    title: 'Snowflake connector performance issue',
    description: 'ETL jobs timing out on large datasets, needs infra investigation',
    severity: 'critical',
    status: 'open',
    owner_id: 'a1000000-0000-0000-0000-000000000002',
    logged_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 'd1000000-0000-0000-0000-000000000003',
    epic_id: 'c1000000-0000-0000-0000-000000000001', // Launch Readiness Dashboard (Dan)
    title: 'Design sign-off outstanding',
    description: 'UX review scheduled but not completed',
    severity: 'medium',
    status: 'open',
    owner_id: 'a1000000-0000-0000-0000-000000000001',
    logged_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'd1000000-0000-0000-0000-000000000004',
    epic_id: 'c1000000-0000-0000-0000-000000000006', // GTM Playbook (Marcelo)
    title: 'Missing sales enablement content for APAC',
    description: 'No localized materials for Asia-Pacific region',
    severity: 'high',
    status: 'open',
    owner_id: 'a1000000-0000-0000-0000-000000000003',
    logged_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

const milestones = [
  {
    id: 'e1000000-0000-0000-0000-000000000001',
    epic_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Design complete',
    due_date: '2026-04-28',
    status: 'completed',
    completed_at: new Date().toISOString(),
  },
  {
    id: 'e1000000-0000-0000-0000-000000000002',
    epic_id: 'c1000000-0000-0000-0000-000000000001',
    name: 'Engineering complete',
    due_date: '2026-05-10',
    status: 'in_progress',
    completed_at: null,
  },
  {
    id: 'e1000000-0000-0000-0000-000000000003',
    epic_id: 'c1000000-0000-0000-0000-000000000005',
    name: 'Performance testing',
    due_date: '2026-04-30',
    status: 'missed',
    completed_at: null,
  },
];

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function upsertProduct() {
  console.log('Upserting product...');
  const { error } = await supabase
    .from('product')
    .upsert(product, { onConflict: 'id' });
  if (error) {
    console.error('  ERROR upserting product:', error.message);
    throw error;
  }
  console.log('  OK: product', product.name);
}

async function upsertUsers() {
  console.log('Upserting users...');
  const { error } = await supabase
    .from('app_user')
    .upsert(users, { onConflict: 'email' });
  if (error) {
    console.error('  ERROR upserting users:', error.message);
    throw error;
  }
  for (const u of users) {
    console.log(`  OK: user ${u.name} (${u.email})`);
  }
}

async function upsertEpics() {
  console.log('Upserting epics...');
  const { error } = await supabase
    .from('epic')
    .upsert(epics, { onConflict: 'id' });
  if (error) {
    console.error('  ERROR upserting epics:', error.message);
    throw error;
  }
  for (const e of epics) {
    console.log(`  OK: epic "${e.name}" [${e.status}]`);
  }
}

async function upsertBlockers() {
  console.log('Upserting blockers...');
  const { error } = await supabase
    .from('blocker')
    .upsert(blockers, { onConflict: 'id' });
  if (error) {
    console.error('  ERROR upserting blockers:', error.message);
    throw error;
  }
  for (const b of blockers) {
    console.log(`  OK: blocker "${b.title}" [${b.severity}]`);
  }
}

async function upsertMilestones() {
  console.log('Upserting milestones...');
  const { error } = await supabase
    .from('epic_milestone')
    .upsert(milestones, { onConflict: 'id' });
  if (error) {
    console.error('  ERROR upserting milestones:', error.message);
    throw error;
  }
  for (const m of milestones) {
    console.log(`  OK: milestone "${m.name}" [${m.status}]`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log('=== seed-ai-api-data ===');
  try {
    await upsertProduct();
    await upsertUsers();
    await upsertEpics();
    await upsertBlockers();
    await upsertMilestones();
    console.log('\nDone. All seed data inserted successfully.');
  } catch (err) {
    console.error('\nSeed failed:', err);
    process.exit(1);
  }
})();
