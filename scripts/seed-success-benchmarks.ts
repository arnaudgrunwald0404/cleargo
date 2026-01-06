import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Seed script for default adoption benchmarks
 * Based on industry-standard SaaS benchmarks for feature launches
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment.');
  console.error('Looking for: SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const defaultBenchmarks = [
  // Tier 1 - High-Impact Features
  {
    name: 'Tier 1 - High-Impact Feature (Default)',
    launch_tier: 'TIER_1',
    feature_type: 'High-Impact',
    target_persona: 'All Users',
    horizon_days: [30, 60, 90],
    expected_activation: [35, 55, 65],
    expected_usage_depth: [3.5, 4.0, 4.5],
    expected_ttfv_days: 2,
    segment_modifiers: null,
    is_default: true,
    version: 1,
  },
  {
    name: 'Tier 1 - Core Product Feature',
    launch_tier: 'TIER_1',
    feature_type: 'Core Product',
    target_persona: 'All Users',
    horizon_days: [30, 60, 90],
    expected_activation: [40, 60, 70],
    expected_usage_depth: [4.0, 4.5, 5.0],
    expected_ttfv_days: 1,
    segment_modifiers: null,
    is_default: false,
    version: 1,
  },
  {
    name: 'Tier 1 - Power User Feature',
    launch_tier: 'TIER_1',
    feature_type: 'Power User',
    target_persona: 'Power Users',
    horizon_days: [30, 60, 90],
    expected_activation: [30, 50, 60],
    expected_usage_depth: [3.0, 3.5, 4.0],
    expected_ttfv_days: 3,
    segment_modifiers: null,
    is_default: false,
    version: 1,
  },
  // Tier 2 - Medium-Impact Features
  {
    name: 'Tier 2 - Medium-Impact Feature (Default)',
    launch_tier: 'TIER_2',
    feature_type: 'Medium-Impact',
    target_persona: 'All Users',
    horizon_days: [30, 60, 90],
    expected_activation: [25, 40, 50],
    expected_usage_depth: [2.5, 3.0, 3.5],
    expected_ttfv_days: 5,
    segment_modifiers: null,
    is_default: true,
    version: 1,
  },
  {
    name: 'Tier 2 - Workflow Enhancement',
    launch_tier: 'TIER_2',
    feature_type: 'Workflow Enhancement',
    target_persona: 'All Users',
    horizon_days: [30, 60, 90],
    expected_activation: [20, 35, 45],
    expected_usage_depth: [2.0, 2.5, 3.0],
    expected_ttfv_days: 7,
    segment_modifiers: null,
    is_default: false,
    version: 1,
  },
  {
    name: 'Tier 2 - Integration Feature',
    launch_tier: 'TIER_2',
    feature_type: 'Integration',
    target_persona: 'Technical Users',
    horizon_days: [30, 60, 90],
    expected_activation: [25, 40, 50],
    expected_usage_depth: [2.5, 3.0, 3.5],
    expected_ttfv_days: 5,
    segment_modifiers: null,
    is_default: false,
    version: 1,
  },
  // Tier 3 - Low-Impact/Niche Features
  {
    name: 'Tier 3 - Low-Impact Feature (Default)',
    launch_tier: 'TIER_3',
    feature_type: 'Low-Impact',
    target_persona: 'All Users',
    horizon_days: [30, 60, 90],
    expected_activation: [15, 25, 35],
    expected_usage_depth: [1.5, 2.0, 2.5],
    expected_ttfv_days: 10,
    segment_modifiers: null,
    is_default: true,
    version: 1,
  },
  {
    name: 'Tier 3 - Niche Feature',
    launch_tier: 'TIER_3',
    feature_type: 'Niche',
    target_persona: 'Specific User Segment',
    horizon_days: [30, 60, 90],
    expected_activation: [10, 20, 30],
    expected_usage_depth: [1.0, 1.5, 2.0],
    expected_ttfv_days: 14,
    segment_modifiers: null,
    is_default: false,
    version: 1,
  },
  {
    name: 'Tier 3 - Administrative Feature',
    launch_tier: 'TIER_3',
    feature_type: 'Administrative',
    target_persona: 'Administrators',
    horizon_days: [30, 60, 90],
    expected_activation: [15, 25, 35],
    expected_usage_depth: [1.5, 2.0, 2.5],
    expected_ttfv_days: 10,
    segment_modifiers: null,
    is_default: false,
    version: 1,
  },
];

async function seedBenchmarks() {
  console.log('Starting to seed default adoption benchmarks...');

  for (const benchmark of defaultBenchmarks) {
    // Check if benchmark already exists by name and tier
    const { data: existing } = await supabase
      .from('adoption_benchmarks')
      .select('id, name')
      .eq('name', benchmark.name)
      .eq('launch_tier', benchmark.launch_tier)
      .single();

    if (existing) {
      console.log(`✓ Benchmark "${benchmark.name}" already exists, skipping...`);
      continue;
    }

    const { data, error } = await supabase
      .from('adoption_benchmarks')
      .insert(benchmark)
      .select()
      .single();

    if (error) {
      console.error(`✗ Failed to insert benchmark "${benchmark.name}":`, error);
    } else {
      console.log(`✓ Inserted benchmark: ${benchmark.name} (${data.id})`);
    }
  }

  console.log('\n✅ Adoption benchmarks seeding completed!');
}

seedBenchmarks().catch((error) => {
  console.error('Error seeding benchmarks:', error);
  process.exit(1);
});

