/**
 * Service layer for success measurement database operations
 * Handles success metrics, epic configs, scorecards, and retros
 */
import { createClient } from '@/lib/supabase/server';
import type { 
  SuccessMetric, 
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
  ScorecardStatus,
  DayMarker,
  EpicSuccessMetricHistory,
  MetricHistoryChangeType
} from '@/lib/success/types';

// ============================================================================
// Success Metrics
// ============================================================================

export interface MetricFilters {
  category?: 'ADOPTION' | 'REVENUE' | 'RETENTION' | 'ENABLEMENT' | 'FRICTION';
  source?: 'PENDO' | 'SNOWFLAKE' | 'MANUAL';
  leading_or_lagging?: 'LEADING' | 'LAGGING';
}

function normalizeThresholdsFromDb(thresholds: any): MetricThresholds | null {
  if (!thresholds) {
    return null;
  }

  // Backwards compatibility: collapse tiered thresholds to global using TIER_1
  if (thresholds.TIER_1 || thresholds.TIER_2 || thresholds.TIER_3) {
    const t1 = thresholds.TIER_1 || {};
    return {
      min: t1.min,
      max: t1.max,
      target: t1.target,
    };
  }

  return thresholds as MetricThresholds;
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
    // Handle table not existing gracefully (migration not applied)
    if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
      console.warn('Table success_metrics does not exist. Success Measurement migration may not have been applied.');
      return [];
    }
    console.error('Error fetching metrics:', error);
    throw new Error(`Failed to fetch metrics: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    ...row,
    thresholds: normalizeThresholdsFromDb(row.thresholds),
  })) as SuccessMetric[];
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

  if (!data) {
    return null;
  }

  return {
    ...data,
    thresholds: normalizeThresholdsFromDb((data as any).thresholds),
  } as SuccessMetric;
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
  post_launch_owner: string; // Keep the ID for compatibility
  delegated_post_launch_owner_id?: string | null;
  track_offline?: boolean;
  /** When set, success metrics are published and visible to all users; when null, draft. */
  success_metrics_published_at?: string | null;
  locked: boolean;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  post_launch_owner_details?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  delegated_post_launch_owner_details?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
}

/**
 * Resolve product manager user ID from epic
 * Priority: epic owner_id > epic owner_email (Aha) > pod mapping > AHA assigned_to_user > PM Foundation criteria
 */
export async function resolveProductManagerUserId(epicId: string): Promise<string | null> {
  const supabase = createClient();
  
  // Get epic with owner and AHA fields
  const { data: epic, error: epicError } = await supabase
    .from('epic')
    .select('owner_id, owner_email, pod, aha_fields')
    .eq('id', epicId)
    .single();

  if (epicError || !epic) {
    return null;
  }

  // Use epic owner_id when set (e.g. from Aha sync)
  if (epic.owner_id) {
    return epic.owner_id;
  }

  const { getSettings } = await import('../settings-db');
  const settings = await getSettings();
  const podMapping = settings.pod_product_manager_mapping || {};
  
  let pmEmail: string | null = null;

  // Epic owner_email from Aha (assigned_to_user) when owner_id not yet resolved
  if (epic.owner_email && typeof epic.owner_email === 'string' && epic.owner_email.trim()) {
    pmEmail = epic.owner_email.trim().toLowerCase();
  }

  const pod = epic.pod || (epic.aha_fields as any)?.custom_fields?.dev_backlog_pod || null;

  // Pod mapping (can override owner_email if pod is set)
  if (pod) {
    if (podMapping[pod]) {
      pmEmail = podMapping[pod];
    } else {
      // Try case-insensitive match
      const podLower = pod.toLowerCase();
      const matchingKey = Object.keys(podMapping).find(key => key.toLowerCase() === podLower);
      if (matchingKey && podMapping[matchingKey]) {
        pmEmail = podMapping[matchingKey];
      }
    }
  }

  // Second priority: assigned_to_user from AHA fields
  if (!pmEmail && epic.aha_fields) {
    const ahaFields = epic.aha_fields as any;
    if (ahaFields?.standard_fields?.assigned_to_user?.email) {
      pmEmail = ahaFields.standard_fields.assigned_to_user.email;
    }
  }

  // Third priority: Product Management & Documentation Foundation criteria
  if (!pmEmail) {
    const { data: pmCriteria } = await supabase
      .from('epic_criterion_status')
      .select(`
        decision_owner_id,
        criterion:criterion_id(category, decision_owner_email)
      `)
      .eq('epic_id', epicId);

    if (pmCriteria && pmCriteria.length > 0) {
      const pmFoundationItem = pmCriteria.find((item: any) => {
        // Handle both array and object cases for criterion
        const criterion = Array.isArray(item.criterion) ? item.criterion[0] : item.criterion;
        const category = criterion?.category;
        return category && 
               category.toLowerCase().includes('product management') && 
               category.toLowerCase().includes('documentation');
      });

      if (pmFoundationItem) {
        // Handle both array and object cases for criterion
        const criterion = Array.isArray(pmFoundationItem.criterion) 
          ? pmFoundationItem.criterion[0] 
          : pmFoundationItem.criterion;
        
        // If delegated, get from decision_owner_id
        if (pmFoundationItem.decision_owner_id) {
          const { data: delegatedUser } = await supabase
            .from('app_user')
            .select('email')
            .eq('id', pmFoundationItem.decision_owner_id)
            .single();
          if (delegatedUser?.email) {
            pmEmail = delegatedUser.email;
          }
        } else if (criterion?.decision_owner_email) {
          // Use criterion template email
          const criterionEmail = criterion.decision_owner_email;
          if (criterionEmail !== "[name of pod's product manager]" && !criterionEmail.toLowerCase().includes("pod")) {
            pmEmail = criterionEmail;
          } else if (pod) {
            // Resolve pod placeholder
            const { resolveDecisionOwnerEmail } = await import('../pod-resolver');
            pmEmail = await resolveDecisionOwnerEmail(criterionEmail, pod);
          }
        }
      }
    }
  }

  // Convert email to user ID
  if (pmEmail) {
    const { data: user } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', pmEmail.toLowerCase().trim())
      .single();

    return user?.id || null;
  }

  return null;
}

export async function getEpicSuccessConfig(epicId: string): Promise<EpicSuccessConfigWithDetails | null> {
  const supabase = createClient();
  
  try {
    // Try with relationship syntax first
    const { data, error } = await supabase
      .from('epic_success_configs')
      .select(`
        *,
        post_launch_owner_details:app_user!post_launch_owner(id, email, first_name, last_name, avatar_url),
        delegated_post_launch_owner_details:app_user!delegated_post_launch_owner_id(id, email, first_name, last_name, avatar_url)
      `)
      .eq('epic_id', epicId)
      .maybeSingle(); // Use maybeSingle instead of single to avoid PGRST116

    if (error) {
      console.error('Error fetching epic success config:', error);
      // If relationship error, fall back
      if (error.code === 'PGRST200' || error.message?.includes('relationship')) {
        return await getEpicSuccessConfigWithSeparateQueries(epicId);
      }
      return null;
    }

    return data as EpicSuccessConfigWithDetails;
  } catch (error: any) {
    console.warn('Catch block in getEpicSuccessConfig, trying fallback:', error.message);
    try {
      return await getEpicSuccessConfigWithSeparateQueries(epicId);
    } catch (fallbackError: any) {
      console.error('Fallback query also failed:', fallbackError);
      return null;
    }
  }
}

async function getEpicSuccessConfigWithSeparateQueries(epicId: string): Promise<EpicSuccessConfigWithDetails | null> {
  const supabase = createClient();
  
  try {
    // Fetch config without relationships
    const { data: config, error: configError } = await supabase
      .from('epic_success_configs')
      .select('*')
      .eq('epic_id', epicId)
      .single();

    if (configError) {
      if (configError.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to fetch epic success config: ${configError.message}`);
    }

    if (!config) {
      return null;
    }

    // Fetch post-launch owner details separately (non-blocking)
    let postLaunchOwnerDetails = null;
    if (config.post_launch_owner) {
      try {
        const { data: ownerData, error: ownerError } = await supabase
          .from('app_user')
          .select('id, email, first_name, last_name, avatar_url')
          .eq('id', config.post_launch_owner)
          .single();
        if (!ownerError && ownerData) {
          postLaunchOwnerDetails = ownerData;
        }
      } catch (e) {
        console.warn('Failed to fetch post-launch owner details:', e);
      }
    }

    // Fetch delegated post-launch owner details separately (non-blocking)
    let delegatedPostLaunchOwnerDetails = null;
    if (config.delegated_post_launch_owner_id) {
      try {
        const { data: delegatedOwnerData, error: delegatedOwnerError } = await supabase
          .from('app_user')
          .select('id, email, first_name, last_name, avatar_url')
          .eq('id', config.delegated_post_launch_owner_id)
          .single();
        if (!delegatedOwnerError && delegatedOwnerData) {
          delegatedPostLaunchOwnerDetails = delegatedOwnerData;
        }
      } catch (e) {
        console.warn('Failed to fetch delegated post-launch owner details:', e);
      }
    }

    return {
      ...config,
      post_launch_owner_details: postLaunchOwnerDetails || undefined,
      delegated_post_launch_owner_details: delegatedPostLaunchOwnerDetails || undefined,
    } as EpicSuccessConfigWithDetails;
  } catch (error: any) {
    console.error('Error in getEpicSuccessConfigWithSeparateQueries:', error);
    throw error;
  }
}

export async function createEpicSuccessConfig(
  epicId: string,
  data: Omit<CreateEpicSuccessConfigDTO, 'epic_id'>
): Promise<EpicSuccessConfig> {
  const supabase = createClient();
  
  // Default to product manager if post_launch_owner is not provided
  let postLaunchOwner: string | undefined = data.post_launch_owner;
  if (!postLaunchOwner) {
    const resolvedPmId = await resolveProductManagerUserId(epicId);
    if (resolvedPmId) {
      postLaunchOwner = resolvedPmId;
    } else {
      // Fallback: epic owner_id or owner_email (Aha assigned_to_user)
      const { data: epic, error: epicError } = await supabase
        .from('epic')
        .select('owner_id, owner_email')
        .eq('id', epicId)
        .single();
      
      if (epicError || !epic) {
        throw new Error('Post-launch owner is required and could not be resolved. Please set a product manager or epic owner.');
      }
      if (epic.owner_id) {
        postLaunchOwner = epic.owner_id;
      } else if (epic.owner_email && typeof epic.owner_email === 'string' && epic.owner_email.trim()) {
        const { data: user } = await supabase
          .from('app_user')
          .select('id')
          .eq('email', epic.owner_email.trim().toLowerCase())
          .single();
        if (user?.id) {
          postLaunchOwner = user.id;
        }
      }
      // Last resort: use same epic shape as API (owner expand + aha_fields) so we match what the UI shows
      if (!postLaunchOwner) {
        const { getEpic } = await import('@/lib/epics');
        const fullEpic = await getEpic(epicId);
        const anyEpic = fullEpic as any;
        if (fullEpic) {
          const owner = anyEpic.owner;
          if (owner?.id) {
            postLaunchOwner = owner.id;
          } else if (owner?.email && typeof owner.email === 'string') {
            const { data: u } = await supabase.from('app_user').select('id').eq('email', owner.email.trim().toLowerCase()).single();
            if (u?.id) postLaunchOwner = u.id;
          }
          if (!postLaunchOwner) {
            const aha = anyEpic.aha_fields;
            const std = aha?.standard_fields || aha?.standardFields;
            const assigned = std?.assigned_to_user || std?.assignedToUser;
            const email = assigned?.email;
            if (email && typeof email === 'string') {
              const { data: u } = await supabase.from('app_user').select('id').eq('email', email.trim().toLowerCase()).single();
              if (u?.id) postLaunchOwner = u.id;
            }
          }
        }
      }
      if (!postLaunchOwner) {
        throw new Error('Post-launch owner is required and could not be resolved. Please set a product manager or epic owner.');
      }
    }
  }
  
  const { data: config, error } = await supabase
    .from('epic_success_configs')
    .insert({
      epic_id: epicId,
      ...data,
      post_launch_owner: postLaunchOwner,
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

export async function updateDelegatedPostLaunchOwner(
  epicId: string,
  delegatedOwnerId: string | null
): Promise<EpicSuccessConfig> {
  const supabase = createClient();
  const { data: config, error } = await supabase
    .from('epic_success_configs')
    .update({
      delegated_post_launch_owner_id: delegatedOwnerId,
      updated_at: new Date().toISOString(),
    })
    .eq('epic_id', epicId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Epic success config not found');
    }
    console.error('Error updating delegated post-launch owner:', error);
    throw new Error(`Failed to update delegated post-launch owner: ${error.message}`);
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

/**
 * Set success metrics published state for an epic. When published, all users can see metrics; when draft, only users with Configure Success Metrics permission see them.
 */
export async function setEpicSuccessMetricsPublished(
  epicId: string,
  published: boolean
): Promise<EpicSuccessConfig> {
  const supabase = createClient();
  const { data: config, error } = await supabase
    .from('epic_success_configs')
    .update({
      success_metrics_published_at: published ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('epic_id', epicId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Epic success config not found');
    }
    console.error('Error setting success metrics published state:', error);
    throw new Error(`Failed to set success metrics published state: ${error.message}`);
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
  
  try {
    // Try the join query first with explicit foreign key syntax
    const { data, error } = await supabase
      .from('epic_success_metrics')
      .select(`
        *,
        metric:success_metrics!metric_id(*)
      `)
      .eq('epic_id', epicId)
      .order('created_at', { ascending: true });

    if (error) {
      // Check if table doesn't exist (migration not applied)
      if (error.message?.includes("Could not find the table") || 
          error.message?.includes("does not exist") ||
          error.code === '42P01') {
        console.warn('Table epic_success_metrics does not exist. Migration may not have been applied.');
        return []; // Return empty array gracefully
      }
      
      // If join fails, try fetching metrics separately as fallback
      console.warn('Join query failed, trying separate queries. Error:', error.message, 'Code:', error.code);
      
      // Fetch epic_success_metrics first
      const { data: metricsData, error: metricsError } = await supabase
        .from('epic_success_metrics')
        .select('*')
        .eq('epic_id', epicId)
        .order('created_at', { ascending: true });

      if (metricsError) {
        // Check if table doesn't exist (migration not applied)
        if (metricsError.message?.includes("Could not find the table") || 
            metricsError.message?.includes("does not exist") ||
            metricsError.code === '42P01') {
          console.warn('Table epic_success_metrics does not exist. Migration may not have been applied.');
          return []; // Return empty array gracefully
        }
        
        console.error('Error fetching epic success metrics:', metricsError);
        console.error('Error code:', metricsError.code);
        console.error('Error details:', metricsError.details);
        console.error('Error hint:', metricsError.hint);
        throw new Error(`Failed to fetch epic success metrics: ${metricsError.message}`);
      }

      if (!metricsData || metricsData.length === 0) {
        return [];
      }

      // Fetch success_metrics for each metric_id
      const metricIds = metricsData.map(m => m.metric_id);
      const { data: successMetricsData, error: successMetricsError } = await supabase
        .from('success_metrics')
        .select('*')
        .in('id', metricIds);

      if (successMetricsError) {
        console.error('Error fetching success metrics:', successMetricsError);
        // Return metrics without the joined data rather than failing completely
        return metricsData.map((item: any) => ({
          ...item,
          metric: null,
        })) as EpicSuccessMetricWithDetails[];
      }

      // Create a map of metric_id -> metric for quick lookup
      const metricsMap = new Map(
        (successMetricsData || []).map((m: any) => [
          m.id,
          {
            ...m,
            thresholds: normalizeThresholdsFromDb(m.thresholds),
          },
        ])
      );

      // Combine the data
      return metricsData.map((item: any) => ({
        ...item,
        threshold_override: normalizeThresholdsFromDb(item.threshold_override),
        metric: metricsMap.get(item.metric_id) || null,
      })) as EpicSuccessMetricWithDetails[];
    }

    // Transform the data to match the expected interface
    // Supabase returns the relationship under the alias name
    return (data || []).map((item: any) => ({
      ...item,
      threshold_override: normalizeThresholdsFromDb(item.threshold_override),
      metric: item.metric
        ? {
            ...item.metric,
            thresholds: normalizeThresholdsFromDb(item.metric.thresholds),
          }
        : null,
    })) as EpicSuccessMetricWithDetails[];
  } catch (err: any) {
    // Check if table doesn't exist (migration not applied)
    if (err?.message?.includes("Could not find the table") || 
        err?.message?.includes("does not exist") ||
        err?.code === '42P01' ||
        err?.message?.includes("epic_success_metrics")) {
      console.warn('Table epic_success_metrics does not exist. Migration may not have been applied.');
      return []; // Return empty array gracefully
    }
    
    console.error('Exception in getEpicSuccessMetrics:', err);
    console.error('Exception stack:', err.stack);
    throw err;
  }
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
    // Check if table doesn't exist (migration not applied)
    if (countError.message?.includes("Could not find the table") || 
        countError.message?.includes("does not exist") ||
        countError.code === '42P01') {
      throw new Error('Table epic_success_metrics does not exist. Please apply the migration: 20250104000000_success_measurement_schema.sql');
    }
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
      target: data.target !== undefined ? data.target : null,
      pendo_event_id: data.pendo_event_id || null,
      snowflake_query: data.snowflake_query || null,
      manual_label: data.manual_label || null,
      pendo_segment_ids: data.pendo_segment_ids ?? null,
      pendo_segment_names: data.pendo_segment_names ?? null,
      pendo_app_ids: data.pendo_app_ids ?? null,
      pendo_app_names: data.pendo_app_names ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    // Postgres undefined_column (42703) or error text like "column ... does not exist"
    const pgCode = (error as any)?.code;
    const msg = (error as any)?.message || '';
    if (pgCode === '42703' || (/does not exist/i.test(msg) && /column/i.test(msg))) {
      throw new Error('Database schema out of date—apply 20260122000000_add_epic_metric_config.sql');
    }
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
  data: Partial<Omit<CreateEpicSuccessMetricDTO, 'epic_id' | 'metric_id'>>
): Promise<EpicSuccessMetric> {
  const supabase = createClient();
  const updateData: any = {};
  
  if (data.threshold_override !== undefined) {
    updateData.threshold_override = data.threshold_override;
  }
  if (data.target !== undefined) {
    updateData.target = data.target;
  }
  if (data.pendo_event_id !== undefined) {
    updateData.pendo_event_id = data.pendo_event_id;
  }
  if (data.snowflake_query !== undefined) {
    updateData.snowflake_query = data.snowflake_query;
  }
  if (data.manual_label !== undefined) {
    updateData.manual_label = data.manual_label;
  }
  if (data.pendo_segment_ids !== undefined) {
    updateData.pendo_segment_ids = data.pendo_segment_ids;
  }
  if (data.pendo_segment_names !== undefined) {
    updateData.pendo_segment_names = data.pendo_segment_names;
  }
  if (data.pendo_app_ids !== undefined) {
    updateData.pendo_app_ids = data.pendo_app_ids;
  }
  if (data.pendo_app_names !== undefined) {
    updateData.pendo_app_names = data.pendo_app_names;
  }
  
  const { data: mapping, error } = await supabase
    .from('epic_success_metrics')
    .update(updateData)
    .eq('epic_id', epicId)
    .eq('metric_id', metricId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Epic success metric mapping not found');
    }
    // Handle undefined_column (42703) or similar text
    const pgCode = (error as any)?.code;
    const msg = (error as any)?.message || '';
    if (pgCode === '42703' || (/does not exist/i.test(msg) && /column/i.test(msg))) {
      throw new Error('Database schema out of date—apply 20260122000000_add_epic_metric_config.sql');
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
  overallStatus: ScorecardStatus
): Promise<EpicScorecard> {
  const supabase = createClient();
  const { data: scorecard, error } = await supabase
    .from('epic_scorecards')
    .insert({
      epic_id: epicId,
      snapshot_date: snapshotDate,
      metric_results: metricResults,
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

export interface GetEpicSuccessMetricHistoryOptions {
  metricId?: string;
  changeType?: 'METRIC_ADDED' | 'METRIC_REMOVED' | 'TARGET_SET' | 'TARGET_UPDATED' | 'EVENT_CONFIG_UPDATED';
}

export async function getEpicSuccessMetricHistory(
  epicId: string,
  options?: GetEpicSuccessMetricHistoryOptions
): Promise<EpicSuccessMetricHistory[]> {
  const supabase = createClient();
  
  let query = supabase
    .from('epic_success_metric_history')
    .select(`
      *,
      changed_by:app_user(
        id,
        email,
        first_name,
        last_name
      ),
      metric:success_metrics(
        id,
        name
      )
    `)
    .eq('epic_id', epicId)
    .order('changed_at', { ascending: false });

  if (options?.metricId) {
    query = query.eq('metric_id', options.metricId);
  }

  if (options?.changeType) {
    query = query.eq('change_type', options.changeType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching epic success metric history:', error);
    throw new Error(`Failed to fetch metric history: ${error.message}`);
  }

  // Transform the data to match the EpicSuccessMetricHistory interface
  return (data || []).map((item: any) => ({
    id: item.id,
    epic_success_metric_id: item.epic_success_metric_id,
    epic_id: item.epic_id,
    metric_id: item.metric_id,
    change_type: item.change_type,
    changed_by: item.changed_by ? {
      id: item.changed_by.id,
      email: item.changed_by.email,
      first_name: item.changed_by.first_name,
      last_name: item.changed_by.last_name,
    } : {
      id: '',
      email: 'Unknown',
      first_name: null,
      last_name: null,
    },
    old_value: item.old_value,
    new_value: item.new_value,
    changed_at: item.changed_at,
  })) as EpicSuccessMetricHistory[];
}

