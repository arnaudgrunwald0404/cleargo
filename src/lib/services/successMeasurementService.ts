/**
 * Service layer for success measurement database operations
 * Handles adoption benchmarks and success metrics CRUD operations
 */
import { createClient } from '@/lib/supabase/server';
import type { 
  AdoptionBenchmark, 
  SuccessMetric, 
  CreateAdoptionBenchmarkDTO, 
  CreateSuccessMetricDTO,
  EpicSuccessConfig,
  EpicSuccessMetric,
  CreateEpicSuccessConfigDTO,
  CreateEpicSuccessMetricDTO,
  MetricThresholds,
  EpicScorecard,
  EpicRetro,
  SubmitEpicRetroDTO,
  MetricResult,
  BenchmarkComparison,
  ScorecardStatus,
  DayMarker
} from '@/lib/success/types';

// ============================================================================
// Adoption Benchmarks
// ============================================================================

export interface BenchmarkFilters {
  launch_tier?: 'TIER_1' | 'TIER_2' | 'TIER_3';
  feature_type?: string;
  is_default?: boolean;
}

export async function getBenchmarks(filters?: BenchmarkFilters): Promise<AdoptionBenchmark[]> {
  const supabase = createClient();
  let query = supabase
    .from('adoption_benchmarks')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.launch_tier) {
    query = query.eq('launch_tier', filters.launch_tier);
  }
  if (filters?.feature_type) {
    query = query.eq('feature_type', filters.feature_type);
  }
  if (filters?.is_default !== undefined) {
    query = query.eq('is_default', filters.is_default);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching benchmarks:', error);
    throw new Error(`Failed to fetch benchmarks: ${error.message}`);
  }

  return (data || []) as AdoptionBenchmark[];
}

export async function getBenchmarkById(id: string): Promise<AdoptionBenchmark | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('adoption_benchmarks')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching benchmark:', error);
    throw new Error(`Failed to fetch benchmark: ${error.message}`);
  }

  return data as AdoptionBenchmark;
}

export async function createBenchmark(data: CreateAdoptionBenchmarkDTO): Promise<AdoptionBenchmark> {
  const supabase = createClient();
  const { data: benchmark, error } = await supabase
    .from('adoption_benchmarks')
    .insert({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating benchmark:', error);
    throw new Error(`Failed to create benchmark: ${error.message}`);
  }

  return benchmark as AdoptionBenchmark;
}

export async function updateBenchmark(
  id: string, 
  data: Partial<CreateAdoptionBenchmarkDTO>
): Promise<AdoptionBenchmark> {
  const supabase = createClient();
  const { data: benchmark, error } = await supabase
    .from('adoption_benchmarks')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Benchmark not found');
    }
    console.error('Error updating benchmark:', error);
    throw new Error(`Failed to update benchmark: ${error.message}`);
  }

  return benchmark as AdoptionBenchmark;
}

export async function deleteBenchmark(id: string): Promise<boolean> {
  const supabase = createClient();
  
  // Check if benchmark is referenced by any epic_success_configs
  const { data: configs, error: checkError } = await supabase
    .from('epic_success_configs')
    .select('epic_id')
    .eq('benchmark_id', id)
    .limit(1);

  if (checkError) {
    console.error('Error checking benchmark references:', checkError);
    throw new Error(`Failed to check benchmark references: ${checkError.message}`);
  }

  if (configs && configs.length > 0) {
    throw new Error('Cannot delete benchmark: it is referenced by one or more epic success configs');
  }

  const { error } = await supabase
    .from('adoption_benchmarks')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === 'PGRST116') {
      return false; // Not found
    }
    console.error('Error deleting benchmark:', error);
    throw new Error(`Failed to delete benchmark: ${error.message}`);
  }

  return true;
}

// ============================================================================
// Success Metrics
// ============================================================================

export interface MetricFilters {
  category?: 'ADOPTION' | 'REVENUE' | 'RETENTION' | 'ENABLEMENT' | 'FRICTION';
  source?: 'PENDO' | 'SNOWFLAKE' | 'MANUAL';
  leading_or_lagging?: 'LEADING' | 'LAGGING';
}

export async function getMetrics(filters?: MetricFilters): Promise<SuccessMetric[]> {
  const supabase = createClient();
  let query = supabase
    .from('success_metrics')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.source) {
    query = query.eq('source', filters.source);
  }
  if (filters?.leading_or_lagging) {
    query = query.eq('leading_or_lagging', filters.leading_or_lagging);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching metrics:', error);
    throw new Error(`Failed to fetch metrics: ${error.message}`);
  }

  return (data || []) as SuccessMetric[];
}

export async function getMetricById(id: string): Promise<SuccessMetric | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('success_metrics')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching metric:', error);
    throw new Error(`Failed to fetch metric: ${error.message}`);
  }

  return data as SuccessMetric;
}

export async function createMetric(data: CreateSuccessMetricDTO): Promise<SuccessMetric> {
  const supabase = createClient();
  const { data: metric, error } = await supabase
    .from('success_metrics')
    .insert({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating metric:', error);
    throw new Error(`Failed to create metric: ${error.message}`);
  }

  return metric as SuccessMetric;
}

export async function updateMetric(
  id: string, 
  data: Partial<CreateSuccessMetricDTO>
): Promise<SuccessMetric> {
  const supabase = createClient();
  const { data: metric, error } = await supabase
    .from('success_metrics')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Metric not found');
    }
    console.error('Error updating metric:', error);
    throw new Error(`Failed to update metric: ${error.message}`);
  }

  return metric as SuccessMetric;
}

export async function deleteMetric(id: string): Promise<boolean> {
  const supabase = createClient();
  
  // Check if metric is referenced by any epic_success_metrics
  const { data: mappings, error: checkError } = await supabase
    .from('epic_success_metrics')
    .select('epic_id')
    .eq('metric_id', id)
    .limit(1);

  if (checkError) {
    console.error('Error checking metric references:', checkError);
    throw new Error(`Failed to check metric references: ${checkError.message}`);
  }

  if (mappings && mappings.length > 0) {
    throw new Error('Cannot delete metric: it is referenced by one or more epic success metrics');
  }

  const { error } = await supabase
    .from('success_metrics')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === 'PGRST116') {
      return false; // Not found
    }
    console.error('Error deleting metric:', error);
    throw new Error(`Failed to delete metric: ${error.message}`);
  }

  return true;
}

// ============================================================================
// Epic Success Configuration
// ============================================================================

export interface EpicSuccessConfigWithDetails {
  epic_id: string;
  benchmark_id: string;
  post_launch_owner: string; // Keep the ID for compatibility
  locked: boolean;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  benchmark?: AdoptionBenchmark;
  post_launch_owner_details?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
}

export async function getEpicSuccessConfig(epicId: string): Promise<EpicSuccessConfigWithDetails | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('epic_success_configs')
    .select(`
      *,
      benchmark:adoption_benchmarks(*),
      post_launch_owner_details:app_user!post_launch_owner(id, email, first_name, last_name, avatar_url)
    `)
    .eq('epic_id', epicId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching epic success config:', error);
    throw new Error(`Failed to fetch epic success config: ${error.message}`);
  }

  return data as EpicSuccessConfigWithDetails;
}

export async function createEpicSuccessConfig(
  epicId: string,
  data: Omit<CreateEpicSuccessConfigDTO, 'epic_id'>
): Promise<EpicSuccessConfig> {
  const supabase = createClient();
  const { data: config, error } = await supabase
    .from('epic_success_configs')
    .insert({
      epic_id: epicId,
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating epic success config:', error);
    throw new Error(`Failed to create epic success config: ${error.message}`);
  }

  return config as EpicSuccessConfig;
}

export async function updateEpicSuccessConfig(
  epicId: string,
  data: Partial<Omit<CreateEpicSuccessConfigDTO, 'epic_id'>>
): Promise<EpicSuccessConfig> {
  const supabase = createClient();
  const { data: config, error } = await supabase
    .from('epic_success_configs')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('epic_id', epicId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Epic success config not found');
    }
    console.error('Error updating epic success config:', error);
    throw new Error(`Failed to update epic success config: ${error.message}`);
  }

  return config as EpicSuccessConfig;
}

export async function lockEpicSuccessConfig(epicId: string): Promise<EpicSuccessConfig> {
  const supabase = createClient();
  const { data: config, error } = await supabase
    .from('epic_success_configs')
    .update({
      locked: true,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('epic_id', epicId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Epic success config not found');
    }
    console.error('Error locking epic success config:', error);
    throw new Error(`Failed to lock epic success config: ${error.message}`);
  }

  return config as EpicSuccessConfig;
}

// ============================================================================
// Epic Success Metrics
// ============================================================================

export interface EpicSuccessMetricWithDetails extends EpicSuccessMetric {
  metric?: SuccessMetric;
}

export async function getEpicSuccessMetrics(epicId: string): Promise<EpicSuccessMetricWithDetails[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('epic_success_metrics')
    .select(`
      *,
      metric:success_metrics(*)
    `)
    .eq('epic_id', epicId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching epic success metrics:', error);
    throw new Error(`Failed to fetch epic success metrics: ${error.message}`);
  }

  return (data || []) as EpicSuccessMetricWithDetails[];
}

export async function addEpicSuccessMetric(
  epicId: string,
  data: Omit<CreateEpicSuccessMetricDTO, 'epic_id'>
): Promise<EpicSuccessMetric> {
  const supabase = createClient();
  
  // Check current count
  const { data: existing, error: countError } = await supabase
    .from('epic_success_metrics')
    .select('id')
    .eq('epic_id', epicId);

  if (countError) {
    console.error('Error checking metric count:', countError);
    throw new Error(`Failed to check metric count: ${countError.message}`);
  }

  if (existing && existing.length >= 7) {
    throw new Error('Epic already has the maximum of 7 metrics');
  }

  // Check if metric already exists for this epic
  const { data: existingMetric, error: checkError } = await supabase
    .from('epic_success_metrics')
    .select('id')
    .eq('epic_id', epicId)
    .eq('metric_id', data.metric_id)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('Error checking existing metric:', checkError);
    throw new Error(`Failed to check existing metric: ${checkError.message}`);
  }

  if (existingMetric) {
    throw new Error('Metric is already added to this epic');
  }

  const { data: mapping, error } = await supabase
    .from('epic_success_metrics')
    .insert({
      epic_id: epicId,
      metric_id: data.metric_id,
      threshold_override: data.threshold_override || null,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding epic success metric:', error);
    throw new Error(`Failed to add epic success metric: ${error.message}`);
  }

  return mapping as EpicSuccessMetric;
}

export async function removeEpicSuccessMetric(epicId: string, metricId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('epic_success_metrics')
    .delete()
    .eq('epic_id', epicId)
    .eq('metric_id', metricId);

  if (error) {
    console.error('Error removing epic success metric:', error);
    throw new Error(`Failed to remove epic success metric: ${error.message}`);
  }

  return true;
}

export async function updateEpicSuccessMetric(
  epicId: string,
  metricId: string,
  thresholdOverride: MetricThresholds | null
): Promise<EpicSuccessMetric> {
  const supabase = createClient();
  const { data: mapping, error } = await supabase
    .from('epic_success_metrics')
    .update({
      threshold_override: thresholdOverride,
    })
    .eq('epic_id', epicId)
    .eq('metric_id', metricId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Epic success metric mapping not found');
    }
    console.error('Error updating epic success metric:', error);
    throw new Error(`Failed to update epic success metric: ${error.message}`);
  }

  return mapping as EpicSuccessMetric;
}

// ============================================================================
// Epic Scorecards
// ============================================================================

export async function getEpicScorecards(epicId: string, limit?: number): Promise<EpicScorecard[]> {
  const supabase = createClient();
  let query = supabase
    .from('epic_scorecards')
    .select('*')
    .eq('epic_id', epicId)
    .order('snapshot_date', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching epic scorecards:', error);
    throw new Error(`Failed to fetch epic scorecards: ${error.message}`);
  }

  return (data || []) as EpicScorecard[];
}

export async function getEpicScorecardByDate(epicId: string, date: string): Promise<EpicScorecard | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('epic_scorecards')
    .select('*')
    .eq('epic_id', epicId)
    .eq('snapshot_date', date)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching epic scorecard:', error);
    throw new Error(`Failed to fetch epic scorecard: ${error.message}`);
  }

  return data as EpicScorecard;
}

export async function createEpicScorecard(
  epicId: string,
  snapshotDate: string,
  metricResults: MetricResult[],
  benchmarkComparison: BenchmarkComparison,
  overallStatus: ScorecardStatus
): Promise<EpicScorecard> {
  const supabase = createClient();
  const { data: scorecard, error } = await supabase
    .from('epic_scorecards')
    .insert({
      epic_id: epicId,
      snapshot_date: snapshotDate,
      metric_results: metricResults,
      benchmark_comparison: benchmarkComparison,
      overall_status: overallStatus,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating epic scorecard:', error);
    throw new Error(`Failed to create epic scorecard: ${error.message}`);
  }

  return scorecard as EpicScorecard;
}

// ============================================================================
// Epic Retros
// ============================================================================

export interface EpicRetroWithSubmitter extends EpicRetro {
  submitter?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
}

export async function getEpicRetros(epicId: string): Promise<EpicRetroWithSubmitter[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('epic_retros')
    .select(`
      *,
      submitter:app_user!submitted_by(id, email, first_name, last_name, avatar_url)
    `)
    .eq('epic_id', epicId)
    .order('day_marker', { ascending: true });

  if (error) {
    console.error('Error fetching epic retros:', error);
    throw new Error(`Failed to fetch epic retros: ${error.message}`);
  }

  return (data || []) as EpicRetroWithSubmitter[];
}

export async function getEpicRetroByDayMarker(epicId: string, dayMarker: DayMarker): Promise<EpicRetroWithSubmitter | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('epic_retros')
    .select(`
      *,
      submitter:app_user!submitted_by(id, email, first_name, last_name, avatar_url)
    `)
    .eq('epic_id', epicId)
    .eq('day_marker', dayMarker)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching epic retro:', error);
    throw new Error(`Failed to fetch epic retro: ${error.message}`);
  }

  return data as EpicRetroWithSubmitter;
}

export async function submitEpicRetro(
  epicId: string,
  dayMarker: DayMarker,
  data: SubmitEpicRetroDTO,
  userId: string
): Promise<EpicRetro> {
  const supabase = createClient();
  
  // Check if retro already exists
  const existing = await getEpicRetroByDayMarker(epicId, dayMarker);
  
  const retroData = {
    epic_id: epicId,
    day_marker: dayMarker,
    status: 'SUBMITTED' as const,
    outcome: data.outcome,
    blockers: data.blockers || null,
    assumptions_wrong: data.assumptions_wrong || null,
    repeat_next_time: data.repeat_next_time || null,
    change_next_time: data.change_next_time || null,
    action_items: data.action_items || null,
    submitted_by: userId,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing) {
    // Update existing
    const { data: retro, error } = await supabase
      .from('epic_retros')
      .update(retroData)
      .eq('epic_id', epicId)
      .eq('day_marker', dayMarker)
      .select()
      .single();

    if (error) {
      console.error('Error updating epic retro:', error);
      throw new Error(`Failed to update epic retro: ${error.message}`);
    }
    result = retro;
  } else {
    // Create new
    const { data: retro, error } = await supabase
      .from('epic_retros')
      .insert({
        ...retroData,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating epic retro:', error);
      throw new Error(`Failed to create epic retro: ${error.message}`);
    }
    result = retro;
  }

  return result as EpicRetro;
}

export async function updateEpicRetro(
  epicId: string,
  dayMarker: DayMarker,
  data: Partial<SubmitEpicRetroDTO>
): Promise<EpicRetro> {
  const supabase = createClient();
  
  // Check if retro exists and is PENDING
  const existing = await getEpicRetroByDayMarker(epicId, dayMarker);
  if (existing && existing.status !== 'PENDING') {
    throw new Error('Cannot update retro that has already been submitted');
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (data.outcome !== undefined) updateData.outcome = data.outcome;
  if (data.blockers !== undefined) updateData.blockers = data.blockers;
  if (data.assumptions_wrong !== undefined) updateData.assumptions_wrong = data.assumptions_wrong;
  if (data.repeat_next_time !== undefined) updateData.repeat_next_time = data.repeat_next_time;
  if (data.change_next_time !== undefined) updateData.change_next_time = data.change_next_time;
  if (data.action_items !== undefined) updateData.action_items = data.action_items;

  if (existing) {
    // Update existing
    const { data: retro, error } = await supabase
      .from('epic_retros')
      .update(updateData)
      .eq('epic_id', epicId)
      .eq('day_marker', dayMarker)
      .select()
      .single();

    if (error) {
      console.error('Error updating epic retro:', error);
      throw new Error(`Failed to update epic retro: ${error.message}`);
    }
    return retro as EpicRetro;
  } else {
    // Create new as PENDING
    const { data: retro, error } = await supabase
      .from('epic_retros')
      .insert({
        epic_id: epicId,
        day_marker: dayMarker,
        status: 'PENDING',
        ...updateData,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating epic retro:', error);
      throw new Error(`Failed to create epic retro: ${error.message}`);
    }
    return retro as EpicRetro;
  }
}

