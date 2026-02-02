/**
 * HEART Metrics Service
 * Database operations for HEART framework
 */

import { getAdminClient } from '@/lib/db';
import { runHeartAgent, generateMetricName } from './agent';
import { PendoClient } from '@/lib/integrations/pendo/client';

// Use admin client for HEART operations since these run in API routes
// and RLS policies may not have proper auth context
const getClient = () => getAdminClient();
import type {
  HeartCategory,
  HeartCategoryId,
  EpicHeartConfig,
  EpicHeartMetric,
  EpicHeartSnapshot,
  HeartSurvey,
  HeartSetupMethod,
  HeartConfigStatus,
  HeartMetricStatus,
  HeartMeasurementType,
  CreateEpicHeartConfigDTO,
  CreateEpicHeartMetricDTO,
  UpdateEpicHeartMetricDTO,
  CreateHeartSurveyDTO,
  HeartAgentRecommendation,
  EpicHeartDashboard,
  HeartMetricDisplay,
  EpicHeartListItem,
} from './types';

// ============================================================================
// Pendo Client Helper
// ============================================================================

/**
 * Get Pendo client if integration is configured
 */
async function getPendoClient(): Promise<PendoClient | null> {
  const supabase = getClient();
  
  const { data: integration } = await supabase
    .from('pendo_integrations')
    .select('*')
    .eq('status', 'connected')
    .single();
  
  if (!integration) {
    console.warn('[HeartService] No connected Pendo integration found');
    return null;
  }
  
  // TODO: Implement actual decryption
  const apiKey = integration.api_key_encrypted;
  
  return new PendoClient({
    apiKey,
    environment: integration.environment,
  });
}

// ============================================================================
// Live Pendo Data Fetching
// ============================================================================

interface LiveMetricValue {
  value: number | null;
  status: HeartMetricStatus;
  error?: string;
  /** Whether the epic is pre-launch (launch date in future or not set) */
  isPreLaunch?: boolean;
  /** Human-readable measurement period description */
  measurementPeriod?: string;
}

/**
 * Fetch live metric value from Pendo API
 * This queries Pendo in real-time instead of using stored snapshots
 */
export async function fetchLiveMetricValue(
  metric: EpicHeartMetric,
  client: PendoClient,
  epicLaunchDate: Date | null,
  targetValue: number | null,
  targetTimeframeDays?: number | null
): Promise<LiveMetricValue> {
  const measurementType = metric.measurement_type as HeartMeasurementType;
  const eventIds = metric.pendo_event_ids;

  // No events configured - can't fetch data
  if (!eventIds || eventIds.length === 0) {
    return { value: null, status: 'PENDING', error: 'No events configured' };
  }

  // Determine if pre-launch
  const today = new Date();
  const isPreLaunch = !epicLaunchDate || epicLaunchDate > today;
  const daysSinceLaunch = epicLaunchDate 
    ? Math.floor((today.getTime() - epicLaunchDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Calculate date range
  const endDate = today.toISOString().split('T')[0];

  // Default to last 7 days
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - 7);
  let startDate = rangeStart.toISOString().split('T')[0];
  let measurementPeriod = 'Last 7 days';

  // For adoption metrics, use launch date if available and launched
  if (epicLaunchDate && !isPreLaunch && measurementType.includes('unique_users')) {
    startDate = epicLaunchDate.toISOString().split('T')[0];
    measurementPeriod = daysSinceLaunch !== null ? `Since launch (Day ${daysSinceLaunch})` : 'Since launch';
  }
  
  try {
    const primaryEventId = eventIds[0];
    let value: number | null = null;
    
    switch (measurementType) {
      case 'events_per_user':
      case 'events_per_user_per_week': {
        const [totalEvents, uniqueUsers] = await Promise.all([
          client.getEventCount({
            eventId: primaryEventId,
            startDate,
            endDate,
            filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
          }),
          client.getUniqueVisitors({
            eventId: primaryEventId,
            startDate,
            endDate,
            filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
          })
        ]);
        
        if (uniqueUsers > 0) {
          value = totalEvents / uniqueUsers;
          
          if (measurementType === 'events_per_user_per_week') {
            const days = (today.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
            const weeks = Math.max(1, days / 7);
            value = value / weeks;
          }
        } else {
          value = 0;
        }
        break;
      }
      
      case 'unique_users_percentage': {
        value = await client.getEventPercentage({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        break;
      }
      
      case 'unique_users_count': {
        value = await client.getUniqueVisitors({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        break;
      }
      
      case 'return_rate_7_days':
      case 'return_rate_14_days':
      case 'return_rate_30_days': {
        const retentionDays = measurementType === 'return_rate_7_days' ? 7 :
                             measurementType === 'return_rate_14_days' ? 14 : 30;
        
        const periodStart = new Date(today);
        periodStart.setDate(periodStart.getDate() - retentionDays * 2);
        
        const periodMid = new Date(today);
        periodMid.setDate(periodMid.getDate() - retentionDays);
        
        const firstPeriod = await client.getEventPercentage({
          eventId: primaryEventId,
          startDate: periodStart.toISOString().split('T')[0],
          endDate: periodMid.toISOString().split('T')[0],
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        const secondPeriod = await client.getEventPercentage({
          eventId: primaryEventId,
          startDate: periodMid.toISOString().split('T')[0],
          endDate: endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        if (firstPeriod > 0) {
          value = Math.min(100, (secondPeriod / firstPeriod) * 100);
        } else {
          value = 0;
        }
        break;
      }
      
      case 'completion_rate':
      case 'success_rate': {
        const startEventId = eventIds[0];
        const completeEventId = eventIds[1] || eventIds[0];
        
        const startCount = await client.getEventCount({
          eventId: startEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        const completeCount = await client.getEventCount({
          eventId: completeEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        
        if (startCount > 0) {
          value = (completeCount / startCount) * 100;
        } else {
          value = 0;
        }
        break;
      }
      
      case 'survey_score':
      case 'nps_score': {
        return { value: null, status: 'PENDING', error: 'Survey metrics require survey responses' };
      }
      
      default:
        return { value: null, status: 'PENDING', error: `Unknown measurement type: ${measurementType}` };
    }
    
    // Calculate status based on value vs target
    let status: HeartMetricStatus = 'PENDING';
    if (value !== null) {
      // Pre-launch: always PENDING, not MISSED (no expectation of usage yet)
      if (isPreLaunch) {
        status = 'PENDING';
      } else if (!targetValue) {
        status = 'ON_TRACK'; // No target = on track if we have data
      } else if (targetTimeframeDays && daysSinceLaunch !== null && daysSinceLaunch < targetTimeframeDays) {
        // Within target timeframe: use graduated thresholds based on progress
        const progress = daysSinceLaunch / targetTimeframeDays; // 0 to 1
        const expectedProgress = targetValue * progress; // Linear expectation
        if (value >= expectedProgress * 0.8) {
          status = 'ON_TRACK';
        } else if (value >= expectedProgress * 0.5) {
          status = 'AT_RISK';
        } else {
          status = 'AT_RISK'; // Not "MISSED" until timeframe expires
        }
      } else if (value >= targetValue * 0.9) {
        status = 'ON_TRACK';
      } else if (value >= targetValue * 0.7) {
        status = 'AT_RISK';
      } else {
        status = 'MISSED';
      }
    }

    return { value, status, isPreLaunch, measurementPeriod };
  } catch (error: any) {
    console.error(`[HeartService] Error fetching live metric ${metric.id}:`, error);
    return { value: null, status: 'PENDING', error: error.message, isPreLaunch, measurementPeriod };
  }
}

// ============================================================================
// HEART Categories
// ============================================================================

/**
 * Get all HEART categories
 */
export async function getHeartCategories(): Promise<HeartCategory[]> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('heart_categories')
    .select('*')
    .order('sort_order');
  
  if (error) {
    console.error('Error fetching HEART categories:', error);
    throw new Error(`Failed to fetch HEART categories: ${error.message}`);
  }
  
  return data || [];
}

// ============================================================================
// Epic HEART Config
// ============================================================================

/**
 * Get HEART config for an epic
 */
export async function getEpicHeartConfig(epicId: string): Promise<EpicHeartConfig | null> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('epic_heart_configs')
    .select('*')
    .eq('epic_id', epicId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching HEART config:', error);
    throw new Error(`Failed to fetch HEART config: ${error.message}`);
  }
  
  return data;
}

/**
 * Create HEART config for an epic
 */
export async function createEpicHeartConfig(
  dto: CreateEpicHeartConfigDTO,
  userId: string
): Promise<EpicHeartConfig> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('epic_heart_configs')
    .insert({
      epic_id: dto.epic_id,
      setup_method: dto.setup_method,
      status: dto.setup_method === 'auto' ? 'active' : 'draft',
      created_by: userId,
      approved_by: dto.setup_method === 'auto' ? userId : null,
      approved_at: dto.setup_method === 'auto' ? new Date().toISOString() : null,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating HEART config:', error);
    throw new Error(`Failed to create HEART config: ${error.message}`);
  }
  
  return data;
}

/**
 * Delete HEART config for an epic (cascades to metrics, snapshots, etc.)
 */
export async function deleteEpicHeartConfig(epicId: string): Promise<void> {
  const supabase = getClient();
  
  const { error } = await supabase
    .from('epic_heart_configs')
    .delete()
    .eq('epic_id', epicId);
  
  if (error) {
    console.error('Error deleting HEART config:', error);
    throw new Error(`Failed to delete HEART config: ${error.message}`);
  }
}

/**
 * Update HEART config status
 */
export async function updateEpicHeartConfigStatus(
  configId: string,
  status: HeartConfigStatus,
  userId?: string
): Promise<EpicHeartConfig> {
  const supabase = getClient();
  
  const updates: Record<string, any> = { status };
  
  if (status === 'active' && userId) {
    updates.approved_by = userId;
    updates.approved_at = new Date().toISOString();
  }
  
  const { data, error } = await supabase
    .from('epic_heart_configs')
    .update(updates)
    .eq('id', configId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating HEART config:', error);
    throw new Error(`Failed to update HEART config: ${error.message}`);
  }
  
  return data;
}

// ============================================================================
// Epic HEART Metrics
// ============================================================================

/**
 * Get all HEART metrics for an epic config
 */
export async function getEpicHeartMetrics(configId: string): Promise<EpicHeartMetric[]> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('epic_heart_metrics')
    .select('*')
    .eq('epic_heart_config_id', configId)
    .order('heart_category');
  
  if (error) {
    console.error('Error fetching HEART metrics:', error);
    throw new Error(`Failed to fetch HEART metrics: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Get HEART metrics by epic ID
 */
export async function getEpicHeartMetricsByEpicId(epicId: string): Promise<EpicHeartMetric[]> {
  const config = await getEpicHeartConfig(epicId);
  if (!config) return [];
  return getEpicHeartMetrics(config.id);
}

/**
 * Create a HEART metric
 */
export async function createEpicHeartMetric(
  dto: CreateEpicHeartMetricDTO
): Promise<EpicHeartMetric> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('epic_heart_metrics')
    .insert({
      epic_heart_config_id: dto.epic_heart_config_id,
      heart_category: dto.heart_category,
      name: dto.name,
      description: dto.description || null,
      measurement_type: dto.measurement_type,
      pendo_event_ids: dto.pendo_event_ids,
      pendo_segment_id: dto.pendo_segment_id || null,
      pendo_app_id: dto.pendo_app_id || null,
      target_value: dto.target_value || null,
      target_timeframe_days: dto.target_timeframe_days || null,
      ai_suggested: dto.ai_suggested || false,
      ai_rationale: dto.ai_rationale || null,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating HEART metric:', error);
    throw new Error(`Failed to create HEART metric: ${error.message}`);
  }
  
  return data;
}

/**
 * Update a HEART metric
 */
export async function updateEpicHeartMetric(
  metricId: string,
  dto: UpdateEpicHeartMetricDTO
): Promise<EpicHeartMetric> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('epic_heart_metrics')
    .update(dto)
    .eq('id', metricId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating HEART metric:', error);
    throw new Error(`Failed to update HEART metric: ${error.message}`);
  }
  
  return data;
}

/**
 * Delete a HEART metric
 */
export async function deleteEpicHeartMetric(metricId: string): Promise<void> {
  const supabase = getClient();
  
  const { error } = await supabase
    .from('epic_heart_metrics')
    .delete()
    .eq('id', metricId);
  
  if (error) {
    console.error('Error deleting HEART metric:', error);
    throw new Error(`Failed to delete HEART metric: ${error.message}`);
  }
}

// ============================================================================
// AI-Powered Setup
// ============================================================================

/**
 * Run AI agent and optionally auto-apply recommendations
 */
export async function setupHeartMetricsWithAI(
  epicId: string,
  userId: string,
  setupMethod: 'auto' | 'ai_assisted',
  options?: { userContext?: string }
): Promise<{
  config: EpicHeartConfig;
  metrics: EpicHeartMetric[];
  recommendations: HeartAgentRecommendation | null;
  error?: string;
  availableEventNames?: string[];
}> {
  // Run the AI agent
  const agentResult = await runHeartAgent(epicId, { userContext: options?.userContext });
  
  if (!agentResult.success || !agentResult.recommendations) {
    // AI failed completely - return error without creating config
    return {
      config: null as any,
      metrics: [],
      recommendations: null,
      error: agentResult.error || 'AI agent failed to analyze this epic. Try manual setup instead.',
    };
  }
  
  // Check if AI found any usable metrics (at least one non-happiness category)
  const hasUsableMetrics = agentResult.recommendations.engagement ||
    agentResult.recommendations.adoption ||
    agentResult.recommendations.retention ||
    agentResult.recommendations.taskSuccess;
  
  if (!hasUsableMetrics) {
    // AI couldn't find any relevant events - don't create config
    const availableEventNames = agentResult.context?.pendo.events
      ? agentResult.context.pendo.events.slice(0, 40).map((e) => e.name)
      : undefined;
    return {
      config: null as any,
      metrics: [],
      recommendations: agentResult.recommendations,
      error: 'AI could not find relevant Pendo events for this epic. The feature may not have enough usage data yet, or the product area may need to be configured. Try manual setup instead.',
      availableEventNames,
    };
  }
  
  // Create the config (only if we have usable metrics)
  const config = await createEpicHeartConfig({
    epic_id: epicId,
    setup_method: setupMethod,
  }, userId);
  
  // Update with AI model version
  const supabase = getClient();
  await supabase
    .from('epic_heart_configs')
    .update({ ai_model_version: agentResult.modelVersion })
    .eq('id', config.id);
  
  // For auto mode, apply recommendations immediately
  if (setupMethod === 'auto') {
    const metrics = await applyRecommendations(
      config.id,
      agentResult.recommendations,
      agentResult.context?.epic.name || 'Feature'
    );
    
    return {
      config: { ...config, ai_model_version: agentResult.modelVersion || null },
      metrics,
      recommendations: agentResult.recommendations,
    };
  }
  
  // For ai_assisted, just return recommendations for review
  return {
    config: { ...config, ai_model_version: agentResult.modelVersion || null },
    metrics: [],
    recommendations: agentResult.recommendations,
  };
}

/**
 * Apply AI recommendations to create metrics
 */
export async function applyRecommendations(
  configId: string,
  recommendations: HeartAgentRecommendation,
  epicName: string
): Promise<EpicHeartMetric[]> {
  const metrics: EpicHeartMetric[] = [];
  
  // Engagement
  if (recommendations.engagement) {
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'engagement',
      name: generateMetricName('engagement', recommendations.engagement.eventIds, epicName),
      measurement_type: recommendations.engagement.measurementType,
      pendo_event_ids: recommendations.engagement.eventIds,
      target_value: recommendations.engagement.targetValue,
      target_timeframe_days: recommendations.engagement.targetTimeframeDays,
      ai_suggested: true,
      ai_rationale: recommendations.engagement.rationale,
    });
    metrics.push(metric);
  }
  
  // Adoption
  if (recommendations.adoption) {
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'adoption',
      name: generateMetricName('adoption', recommendations.adoption.eventIds, epicName),
      measurement_type: recommendations.adoption.measurementType,
      pendo_event_ids: recommendations.adoption.eventIds,
      pendo_segment_id: recommendations.adoption.segmentId,
      target_value: recommendations.adoption.targetValue,
      target_timeframe_days: recommendations.adoption.targetTimeframeDays,
      ai_suggested: true,
      ai_rationale: recommendations.adoption.rationale,
    });
    metrics.push(metric);
  }
  
  // Retention
  if (recommendations.retention) {
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'retention',
      name: generateMetricName('retention', recommendations.retention.eventIds, epicName),
      measurement_type: recommendations.retention.measurementType,
      pendo_event_ids: recommendations.retention.eventIds,
      ai_suggested: true,
      ai_rationale: recommendations.retention.rationale,
    });
    metrics.push(metric);
  }
  
  // Task Success
  if (recommendations.taskSuccess) {
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'task_success',
      name: generateMetricName('task_success', recommendations.taskSuccess.eventIds, epicName),
      measurement_type: recommendations.taskSuccess.measurementType,
      pendo_event_ids: recommendations.taskSuccess.eventIds,
      ai_suggested: true,
      ai_rationale: recommendations.taskSuccess.rationale,
    });
    metrics.push(metric);
  }
  
  // Note: Happiness is not auto-created since it requires a survey
  // The recommendation is stored for the user to create a survey if desired
  
  return metrics;
}

// ============================================================================
// Snapshots
// ============================================================================

/**
 * Get latest snapshot for a metric
 */
export async function getLatestSnapshot(metricId: string): Promise<EpicHeartSnapshot | null> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('epic_heart_snapshots')
    .select('*')
    .eq('epic_heart_metric_id', metricId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching latest snapshot:', error);
    return null;
  }
  
  return data;
}

/**
 * Get snapshots for a metric within a date range
 */
export async function getSnapshots(
  metricId: string,
  startDate?: string,
  endDate?: string
): Promise<EpicHeartSnapshot[]> {
  const supabase = getClient();
  
  let query = supabase
    .from('epic_heart_snapshots')
    .select('*')
    .eq('epic_heart_metric_id', metricId)
    .order('snapshot_date', { ascending: true });
  
  if (startDate) {
    query = query.gte('snapshot_date', startDate);
  }
  if (endDate) {
    query = query.lte('snapshot_date', endDate);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching snapshots:', error);
    return [];
  }
  
  return data || [];
}

// ============================================================================
// Dashboard Data
// ============================================================================

/**
 * Get full HEART dashboard for an epic
 * Fetches LIVE data from Pendo API instead of stored snapshots
 */
export async function getEpicHeartDashboard(epicId: string): Promise<EpicHeartDashboard | null> {
  // Get config
  const config = await getEpicHeartConfig(epicId);
  if (!config) return null;
  
  // Get categories
  const categories = await getHeartCategories();
  
  // Get metrics
  const metrics = await getEpicHeartMetrics(config.id);
  
  // Get epic launch date for calculations
  const supabase = getClient();
  const { data: epic } = await supabase
    .from('epic')
    .select('target_launch_date')
    .eq('id', epicId)
    .single();
  
  const epicLaunchDate = epic?.target_launch_date ? new Date(epic.target_launch_date) : null;
  
  let daysSinceLaunch: number | null = null;
  if (epicLaunchDate) {
    const today = new Date();
    daysSinceLaunch = Math.floor((today.getTime() - epicLaunchDate.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  // Try to get Pendo client for live data
  const pendoClient = await getPendoClient();
  
  // Build metrics display with live data from Pendo
  const metricsWithLiveData: HeartMetricDisplay[] = [];
  
  for (const category of categories) {
    const metric = metrics.find(m => m.heart_category === category.id) || null;
    
    // Create a "live snapshot" object (not stored, just for display)
    let latestSnapshot: EpicHeartSnapshot | null = null;
    let trend: 'up' | 'down' | 'stable' | null = null;
    
    // Track context for display
    let isPreLaunch: boolean | undefined;
    let measurementPeriod: string | undefined;

    if (metric && pendoClient) {
      // Fetch LIVE data from Pendo
      const liveData = await fetchLiveMetricValue(
        metric, 
        pendoClient, 
        epicLaunchDate,
        metric.target_value,
        metric.target_timeframe_days
      );

      isPreLaunch = liveData.isPreLaunch;
      measurementPeriod = liveData.measurementPeriod;
      
      if (liveData.value !== null || !liveData.error) {
        // Create a virtual snapshot for display (not persisted)
        latestSnapshot = {
          id: `live-${metric.id}`,
          epic_heart_metric_id: metric.id,
          snapshot_date: new Date().toISOString().split('T')[0],
          value: liveData.value,
          target_at_snapshot: metric.target_value,
          status: liveData.status,
          pendo_raw_data: {},
          calculated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
      }
      
      // Calculate trend from historical snapshots (if any exist)
      const historicalSnapshots = await getSnapshots(metric.id);
      if (historicalSnapshots.length >= 1 && liveData.value !== null) {
        const lastHistorical = historicalSnapshots[historicalSnapshots.length - 1];
        if (lastHistorical.value !== null) {
          if (liveData.value > lastHistorical.value) trend = 'up';
          else if (liveData.value < lastHistorical.value) trend = 'down';
          else trend = 'stable';
        }
      }
    } else if (metric) {
      // No Pendo client - fall back to stored snapshots
      latestSnapshot = await getLatestSnapshot(metric.id);
      
      if (latestSnapshot) {
        const snapshots = await getSnapshots(metric.id);
        if (snapshots.length >= 2) {
          const prev = snapshots[snapshots.length - 2];
          const curr = snapshots[snapshots.length - 1];
          if (prev.value !== null && curr.value !== null) {
            if (curr.value > prev.value) trend = 'up';
            else if (curr.value < prev.value) trend = 'down';
            else trend = 'stable';
          }
        }
      }
    }
    
    // Get survey for happiness metric
    let survey: HeartSurvey | null = null;
    if (category.id === 'happiness' && metric) {
      const { data } = await supabase
        .from('heart_surveys')
        .select('*')
        .eq('epic_heart_metric_id', metric.id)
        .single();
      survey = data;
    }
    
    metricsWithLiveData.push({
      category,
      metric,
      latestSnapshot,
      survey,
      trend,
      isPreLaunch,
      measurementPeriod,
    });
  }

  // Add custom metrics (those with is_custom = true)
  const customMetrics = metrics.filter(m => m.is_custom === true);
  for (const metric of customMetrics) {
    // Create a synthetic category for display
    const customCategory: HeartCategory = {
      id: `custom_${metric.id}` as any,
      name: metric.custom_category_label || 'Custom',
      description: metric.description || 'Custom metric',
      icon: metric.custom_icon || '📊',
      sort_order: 100 + customMetrics.indexOf(metric),
      requires_survey: false,
      created_at: metric.created_at,
    };

    let latestSnapshot: EpicHeartSnapshot | null = null;
    let trend: 'up' | 'down' | 'stable' | null = null;
    let isPreLaunch: boolean | undefined;
    let measurementPeriod: string | undefined;

    if (pendoClient) {
      const liveData = await fetchLiveMetricValue(
        metric,
        pendoClient,
        epicLaunchDate,
        metric.target_value,
        metric.target_timeframe_days
      );

      isPreLaunch = liveData.isPreLaunch;
      measurementPeriod = liveData.measurementPeriod;

      if (liveData.value !== null || !liveData.error) {
        latestSnapshot = {
          id: `live-${metric.id}`,
          epic_heart_metric_id: metric.id,
          snapshot_date: new Date().toISOString().split('T')[0],
          value: liveData.value,
          target_at_snapshot: metric.target_value,
          status: liveData.status,
          pendo_raw_data: {},
          calculated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
      }

      // Calculate trend from historical snapshots
      const historicalSnapshots = await getSnapshots(metric.id);
      if (historicalSnapshots.length >= 1 && liveData.value !== null) {
        const lastHistorical = historicalSnapshots[historicalSnapshots.length - 1];
        if (lastHistorical.value !== null) {
          if (liveData.value > lastHistorical.value) trend = 'up';
          else if (liveData.value < lastHistorical.value) trend = 'down';
          else trend = 'stable';
        }
      }
    }

    metricsWithLiveData.push({
      category: customCategory,
      metric,
      latestSnapshot,
      survey: null,
      trend,
      isPreLaunch,
      measurementPeriod,
    });
  }
  
  // Calculate overall status from live data
  const statuses = metricsWithLiveData
    .filter(m => m.latestSnapshot)
    .map(m => m.latestSnapshot!.status);
  
  let overallStatus: HeartMetricStatus = 'PENDING';
  if (statuses.length > 0) {
    if (statuses.includes('MISSED')) overallStatus = 'MISSED';
    else if (statuses.includes('AT_RISK')) overallStatus = 'AT_RISK';
    else if (statuses.every(s => s === 'ON_TRACK')) overallStatus = 'ON_TRACK';
  }

  // Build id -> display name map so UI can show names instead of Pendo IDs (especially for features)
  let pendoEventIdToName: Record<string, string> = {};
  if (pendoClient) {
    try {
      const [events, features] = await Promise.all([
        pendoClient.getEvents().catch(() => []),
        pendoClient.getFeatures().catch(() => []),
      ]);
      for (const e of events) {
        if (e.name) pendoEventIdToName[e.name] = e.name;
      }
      for (const f of features) {
        if (f.id && f.name) pendoEventIdToName[f.id] = f.name;
      }
    } catch {
      // Non-fatal; UI will fall back to showing IDs
    }
  }
  
  return {
    config,
    metrics: metricsWithLiveData,
    overallStatus,
    daysSinceLaunch,
    launchDate: epic?.target_launch_date || null,
    pendoEventIdToName,
  };
}

/**
 * Get HEART status for multiple epics (for list view)
 */
export async function getEpicsHeartList(
  epicIds?: string[]
): Promise<EpicHeartListItem[]> {
  const supabase = getClient();
  
  // Get epics with HEART configs
  let query = supabase
    .from('epic')
    .select(`
      id,
      name,
      target_launch_date,
      tier,
      epic_heart_configs (
        id,
        setup_method,
        status
      )
    `);
  
  if (epicIds && epicIds.length > 0) {
    query = query.in('id', epicIds);
  }
  
  const { data: epics, error } = await query;
  
  if (error) {
    console.error('Error fetching epics for HEART list:', error);
    return [];
  }
  
  const results: EpicHeartListItem[] = [];
  
  for (const epic of epics || []) {
    const heartConfig = (epic as any).epic_heart_configs?.[0] || null;
    
    let categoryStatuses: EpicHeartListItem['categoryStatuses'] = {
      happiness: null,
      engagement: null,
      adoption: null,
      retention: null,
      task_success: null,
    };
    
    let overallStatus: HeartMetricStatus | null = null;
    
    if (heartConfig) {
      // Get metrics and latest snapshots
      const metrics = await getEpicHeartMetrics(heartConfig.id);
      
      for (const metric of metrics) {
        const snapshot = await getLatestSnapshot(metric.id);
        categoryStatuses[metric.heart_category as HeartCategoryId] = snapshot?.status || null;
      }
      
      // Calculate overall status
      const statuses = Object.values(categoryStatuses).filter(Boolean) as HeartMetricStatus[];
      if (statuses.length > 0) {
        if (statuses.includes('MISSED')) overallStatus = 'MISSED';
        else if (statuses.includes('AT_RISK')) overallStatus = 'AT_RISK';
        else if (statuses.every(s => s === 'ON_TRACK')) overallStatus = 'ON_TRACK';
        else overallStatus = 'PENDING';
      }
    }
    
    results.push({
      epicId: epic.id,
      epicName: epic.name,
      launchDate: epic.target_launch_date,
      tier: epic.tier,
      heartConfigId: heartConfig?.id || null,
      setupMethod: heartConfig?.setup_method || null,
      overallStatus,
      categoryStatuses,
    });
  }
  
  return results;
}

// ============================================================================
// Surveys (Coming Soon placeholders)
// ============================================================================

/**
 * Create a survey draft
 */
export async function createHeartSurvey(
  dto: CreateHeartSurveyDTO,
  userId: string
): Promise<HeartSurvey> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('heart_surveys')
    .insert({
      epic_heart_metric_id: dto.epic_heart_metric_id,
      survey_type: dto.survey_type,
      question: dto.question,
      target_event_ids: dto.target_event_ids || null,
      target_segment_id: dto.target_segment_id || null,
      min_uses_before_survey: dto.min_uses_before_survey || 1,
      days_after_first_use: dto.days_after_first_use || 14,
      status: 'draft',
      created_by: userId,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating HEART survey:', error);
    throw new Error(`Failed to create HEART survey: ${error.message}`);
  }
  
  return data;
}

/**
 * Get survey for a metric
 */
export async function getHeartSurvey(metricId: string): Promise<HeartSurvey | null> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('heart_surveys')
    .select('*')
    .eq('epic_heart_metric_id', metricId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching HEART survey:', error);
    return null;
  }
  
  return data;
}

// ============================================================================
// Snapshot Creation (for historical tracking)
// ============================================================================

/**
 * Create an initial snapshot for all metrics of an epic
 * Called after HEART setup to establish baseline
 */
export async function createInitialSnapshots(epicId: string): Promise<{
  created: number;
  errors: string[];
}> {
  const pendoClient = await getPendoClient();
  if (!pendoClient) {
    return { created: 0, errors: ['No Pendo integration configured'] };
  }
  
  const config = await getEpicHeartConfig(epicId);
  if (!config) {
    return { created: 0, errors: ['No HEART config found'] };
  }
  
  const metrics = await getEpicHeartMetrics(config.id);
  if (metrics.length === 0) {
    return { created: 0, errors: ['No metrics configured'] };
  }
  
  // Get epic launch date
  const supabase = getClient();
  const { data: epic } = await supabase
    .from('epic')
    .select('target_launch_date')
    .eq('id', epicId)
    .single();
  
  const epicLaunchDate = epic?.target_launch_date ? new Date(epic.target_launch_date) : null;
  const today = new Date();
  const snapshotDate = today.toISOString().split('T')[0];
  
  const errors: string[] = [];
  let created = 0;
  
  for (const metric of metrics) {
    try {
      // Fetch live data
      const liveData = await fetchLiveMetricValue(
        metric,
        pendoClient,
        epicLaunchDate,
        metric.target_value,
        metric.target_timeframe_days
      );
      
      if (liveData.error) {
        errors.push(`Metric ${metric.id}: ${liveData.error}`);
        continue;
      }
      
      // Insert snapshot
      const { error } = await supabase
        .from('epic_heart_snapshots')
        .upsert({
          epic_heart_metric_id: metric.id,
          snapshot_date: snapshotDate,
          value: liveData.value,
          target_at_snapshot: metric.target_value,
          status: liveData.status,
          pendo_raw_data: {},
          calculated_at: today.toISOString(),
        }, {
          onConflict: 'epic_heart_metric_id,snapshot_date',
        });
      
      if (error) {
        errors.push(`Metric ${metric.id}: ${error.message}`);
      } else {
        created++;
      }
    } catch (err: any) {
      errors.push(`Metric ${metric.id}: ${err.message}`);
    }
  }
  
  console.log(`[HeartService] Created ${created} initial snapshots for epic ${epicId}`);
  if (errors.length > 0) {
    console.warn(`[HeartService] Snapshot errors:`, errors);
  }
  
  return { created, errors };
}

/**
 * Create daily snapshots for all active HEART configs
 * Called by scheduled job (cron)
 */
export async function createDailySnapshots(): Promise<{
  epicsProcessed: number;
  snapshotsCreated: number;
  errors: string[];
}> {
  const supabase = getClient();
  
  // Get all active configs
  const { data: configs, error } = await supabase
    .from('epic_heart_configs')
    .select('epic_id')
    .eq('status', 'active');
  
  if (error || !configs) {
    console.error('[HeartService] Failed to fetch active configs:', error);
    return { epicsProcessed: 0, snapshotsCreated: 0, errors: [error?.message || 'Unknown error'] };
  }
  
  const allErrors: string[] = [];
  let totalSnapshots = 0;
  
  for (const config of configs) {
    const result = await createInitialSnapshots(config.epic_id);
    totalSnapshots += result.created;
    allErrors.push(...result.errors.map(e => `Epic ${config.epic_id}: ${e}`));
  }
  
  console.log(`[HeartService] Daily snapshots: ${configs.length} epics, ${totalSnapshots} snapshots created`);
  
  return {
    epicsProcessed: configs.length,
    snapshotsCreated: totalSnapshots,
    errors: allErrors,
  };
}
