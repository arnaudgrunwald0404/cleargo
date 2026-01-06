import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Seed script for default success metrics
 * Based on industry-standard SaaS metrics for software launches
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment.');
  console.error('Looking for: SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const defaultMetrics = [
  // ADOPTION Metrics
  {
    name: 'Feature Activation Rate',
    category: 'ADOPTION',
    description: 'Percentage of users who activate/use a new feature within a given time period',
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LEADING',
    thresholds: {
      TIER_1: { target: 60 },
      TIER_2: { target: 45 },
      TIER_3: { target: 25 },
    },
  },
  {
    name: 'Time to First Value (TTFV)',
    category: 'ADOPTION',
    description: 'Days until user achieves first meaningful outcome with the feature',
    measurement_type: 'DURATION',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LEADING',
    thresholds: {
      TIER_1: { max: 3 },
      TIER_2: { max: 7 },
      TIER_3: { max: 14 },
    },
  },
  {
    name: 'Daily Active Users / Monthly Active Users (DAU/MAU)',
    category: 'ADOPTION',
    description: 'Engagement frequency ratio - percentage of monthly users who are daily active',
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LEADING',
    thresholds: {
      TIER_1: { target: 40 },
      TIER_2: { target: 30 },
      TIER_3: { target: 20 },
    },
  },
  // REVENUE Metrics
  {
    name: 'Monthly Recurring Revenue (MRR) Growth',
    category: 'REVENUE',
    description: 'Month-over-month revenue growth percentage',
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LAGGING',
    thresholds: {
      TIER_1: { target: 10 },
      TIER_2: { target: 5 },
      TIER_3: { target: 3 },
    },
  },
  {
    name: 'Net Revenue Retention (NRR)',
    category: 'REVENUE',
    description: 'Revenue retained from existing customers, accounting for upgrades, downgrades, and churn',
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LAGGING',
    thresholds: {
      TIER_1: { target: 125 },
      TIER_2: { target: 115 },
      TIER_3: { target: 110 },
    },
  },
  {
    name: 'Average Revenue Per User (ARPU)',
    category: 'REVENUE',
    description: 'Average revenue generated per user or account',
    measurement_type: 'COUNT',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LAGGING',
    thresholds: {
      TIER_1: { min: 100 },
      TIER_2: { min: 50 },
      TIER_3: { min: 25 },
    },
  },
  // RETENTION Metrics
  {
    name: 'Customer Churn Rate',
    category: 'RETENTION',
    description: 'Percentage of customers who cancel their subscriptions within a specific period',
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LAGGING',
    thresholds: {
      TIER_1: { max: 4 },
      TIER_2: { max: 6 },
      TIER_3: { max: 7 },
    },
  },
  {
    name: 'Feature Stickiness',
    category: 'RETENTION',
    description: 'Percentage of users who use the feature multiple times within a week',
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LEADING',
    thresholds: {
      TIER_1: { target: 50 },
      TIER_2: { target: 40 },
      TIER_3: { target: 30 },
    },
  },
  // ENABLEMENT Metrics
  {
    name: 'Onboarding Completion Rate',
    category: 'ENABLEMENT',
    description: 'Percentage of users completing setup/onboarding flow',
    measurement_type: 'PERCENTAGE',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LEADING',
    thresholds: {
      TIER_1: { target: 80 },
      TIER_2: { target: 70 },
      TIER_3: { target: 60 },
    },
  },
  {
    name: 'Support Ticket Volume',
    category: 'ENABLEMENT',
    description: 'Number of support requests per user per month',
    measurement_type: 'COUNT',
    source: 'MANUAL',
    pendo_event_id: null,
    leading_or_lagging: 'LEADING',
    thresholds: {
      TIER_1: { max: 0.05 },
      TIER_2: { max: 0.1 },
      TIER_3: { max: 0.2 },
    },
  },
];

async function seedMetrics() {
  console.log('Starting to seed default success metrics...');

  for (const metric of defaultMetrics) {
    // Check if metric already exists by name
    const { data: existing } = await supabase
      .from('success_metrics')
      .select('id, name')
      .eq('name', metric.name)
      .single();

    if (existing) {
      console.log(`✓ Metric "${metric.name}" already exists, skipping...`);
      continue;
    }

    const { data, error } = await supabase
      .from('success_metrics')
      .insert(metric)
      .select()
      .single();

    if (error) {
      console.error(`✗ Failed to insert metric "${metric.name}":`, error);
    } else {
      console.log(`✓ Inserted metric: ${metric.name} (${data.id})`);
    }
  }

  console.log('\n✅ Success metrics seeding completed!');
}

seedMetrics().catch((error) => {
  console.error('Error seeding metrics:', error);
  process.exit(1);
});

