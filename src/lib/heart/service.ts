/**
 * HEART Metrics Service
 * Database operations for HEART framework
 */

import { getAdminClient } from '@/lib/db';
import { runHeartAgent, generateMetricName } from './agent';
import { PendoClient } from '@/lib/integrations/pendo/client';
import {
  DEFAULT_HAPPINESS_COMPOSITE_CONFIG,
  normalizeSurveyScore,
  calculateFrustrationHealth,
  calculateHappinessCompositeScore,
} from './happiness-composite';
import { createEpicSnapshots } from './snapshot-calculator';
import { getWindowDateRange, type HeartTrackerWindow } from './window';

// Use admin client for HEART operations since these run in API routes
// and RLS policies may not have proper auth context
const getClient = () => getAdminClient();
import type {
  HeartCategory,
  HeartCategoryId,
  HeartCategoryDefault,
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
  HeartMetricMilestone,
  MilestoneProgress,
  DefaultMilestone,
  HeartHappinessCompositeConfig,
  MetricContext,
  EpicHeartReleaseView,
  HeartReleaseViewMonth,
} from './types';

const HEART_SYSTEM_DEFAULTS: Record<HeartCategoryId, { targetValue: number; targetTimeframeDays: number }> = {
  happiness: { targetValue: 80, targetTimeframeDays: 30 },
  engagement: { targetValue: 3, targetTimeframeDays: 14 },
  adoption: { targetValue: 75, targetTimeframeDays: 30 },
  retention: { targetValue: 60, targetTimeframeDays: 30 },
  task_success: { targetValue: 85, targetTimeframeDays: 14 },
};

/** Human-readable label for measurement type (for chart details) */
const MEASUREMENT_TYPE_LABELS: Record<string, string> = {
  events_per_user: 'Events per user',
  events_per_user_per_week: 'Events per user per week',
  unique_users_percentage: 'Unique users %',
  unique_users_count: 'Unique users count',
  unique_companies_count: 'Unique companies count',
  return_rate_7_days: '7-day return rate',
  return_rate_14_days: '14-day return rate',
  return_rate_30_days: '30-day return rate',
  completion_rate: 'Completion rate',
  success_rate: 'Success rate',
  survey_score: 'Survey score',
  nps_score: 'NPS score',
  happiness_composite_score: 'Happiness composite',
  manual_numeric: 'Manual (numeric)',
  manual_percentage: 'Manual (%)',
};

function getMeasurementTypeLabel(measurementType: string): string {
  return MEASUREMENT_TYPE_LABELS[measurementType] ?? measurementType.replace(/_/g, ' ');
}

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
  rawData?: Record<string, any>;
  /** Whether the epic is pre-launch (launch date in future or not set) */
  isPreLaunch?: boolean;
  /** Human-readable measurement period description */
  measurementPeriod?: string;
  /** Context explaining what the metric measures */
  metricContext?: MetricContext;
}

async function getNormalizedSurveyScore(
  metricId: string,
  startDate: string,
  endDate: string
): Promise<{ score: number | null; responseCount: number; surveyType: string | null }> {
  const supabase = getClient();
  const { data: survey } = await supabase
    .from('heart_surveys')
    .select('id, survey_type')
    .eq('epic_heart_metric_id', metricId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!survey?.id) {
    return { score: null, responseCount: 0, surveyType: null };
  }

  const { data: responses } = await supabase
    .from('heart_survey_responses')
    .select('response_value')
    .eq('heart_survey_id', survey.id)
    .gte('responded_at', `${startDate}T00:00:00.000Z`)
    .lte('responded_at', `${endDate}T23:59:59.999Z`);

  const values = (responses || [])
    .map((r: any) => Number(r.response_value))
    .filter((n: number) => Number.isFinite(n));

  if (values.length === 0) {
    return { score: null, responseCount: 0, surveyType: survey.survey_type };
  }

  const avg = values.reduce((sum: number, n: number) => sum + n, 0) / values.length;
  return {
    score: normalizeSurveyScore(avg, survey.survey_type),
    responseCount: values.length,
    surveyType: survey.survey_type,
  };
}

async function getFrustrationHealthScore(
  client: PendoClient,
  config: HeartHappinessCompositeConfig,
  fallbackEventIds: string[],
  fallbackSegmentId: string | null | undefined,
  startDate: string,
  endDate: string
): Promise<{ health: number; penalty: number; totalEvents: number; uniqueUsers: number; per100Users: number; usedFallback: boolean }> {
  const segmentId = config.frustrationSegmentId ?? fallbackSegmentId ?? null;
  const eventIds = config.frustrationEventIds?.length ? config.frustrationEventIds : fallbackEventIds;
  const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);

  let totalEvents: number;
  let uniqueUsers: number;

  let usedFallback = false;
  if (eventIds.length > 0) {
    // Prefer scoped: native frustration and visitors for the configured pages only.
    const [frustrationSeries, scopedVisitors] = await Promise.all([
      client.getFrustrationTimeSeries({ days, pageIds: eventIds }),
      client.getUniqueVisitorsForPageIds({
        pageIds: eventIds,
        startDate,
        endDate,
        segmentId: segmentId ?? undefined,
      }),
    ]);
    totalEvents = frustrationSeries.reduce((sum, d) => sum + d.count, 0);
    uniqueUsers = scopedVisitors;
    // Fallback to app-wide when scoped has no data so we don't show "0 frustration signals across 0 visitors".
    if (totalEvents === 0 && uniqueUsers === 0) {
      usedFallback = true;
      const [appFrustration, appVisitors] = await Promise.all([
        client.getFrustrationTimeSeries({ days }),
        client.getTotalUniqueVisitors({ startDate, endDate, segmentId: segmentId ?? undefined }),
      ]);
      totalEvents = appFrustration.reduce((sum, d) => sum + d.count, 0);
      uniqueUsers = appVisitors;
    }
  } else {
    const [frustrationSeries, appVisitors] = await Promise.all([
      client.getFrustrationTimeSeries({ days }),
      client.getTotalUniqueVisitors({ startDate, endDate, segmentId: segmentId ?? undefined }),
    ]);
    totalEvents = frustrationSeries.reduce((sum, d) => sum + d.count, 0);
    uniqueUsers = appVisitors;
  }

  const { penalty, health, eventsPer100Users } = calculateFrustrationHealth(
    totalEvents,
    uniqueUsers,
    config.frustrationEventsPer100UsersAtMaxPenalty
  );

  return { health, penalty, totalEvents, uniqueUsers, per100Users: eventsPer100Users, usedFallback };
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
  targetTimeframeDays?: number | null,
  dateRangeOverride?: { startDate: string; endDate: string }
): Promise<LiveMetricValue> {
  const measurementType = metric.measurement_type as HeartMeasurementType;
  const eventIds = metric.pendo_event_ids;

  // Most non-survey metrics require event IDs (manual types use entered / external data, not Pendo)
  if (
    (!eventIds || eventIds.length === 0) &&
    measurementType !== 'happiness_composite_score' &&
    measurementType !== 'survey_score' &&
    measurementType !== 'nps_score' &&
    measurementType !== 'manual_numeric' &&
    measurementType !== 'manual_percentage'
  ) {
    return { value: null, status: 'PENDING', error: 'No events configured' };
  }

  // Determine if pre-release
  const today = new Date();
  const isPreLaunch = !epicLaunchDate || epicLaunchDate > today;
  const daysSinceLaunch = epicLaunchDate 
    ? Math.floor((today.getTime() - epicLaunchDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Calculate date range — when chart window is provided, use it for all metrics so card and chart match
  let endDate = today.toISOString().split('T')[0];
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - 30);
  let startDate = rangeStart.toISOString().split('T')[0];
  let measurementPeriod = 'Last 30 days';

  if (dateRangeOverride) {
    startDate = dateRangeOverride.startDate;
    endDate = dateRangeOverride.endDate;
    let days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
    measurementPeriod = days <= 7 ? 'Last 7 days' : days <= 31 ? 'Last 30 days' : days <= 93 ? 'Last 3 months' : days <= 186 ? 'Last 6 months' : days <= 366 ? 'Last year' : 'Selected period';
    // Pendo feature-event queries can return 0 for long ranges; cap at 30 days for live card so adoption/retention show a value.
    if (days > 30) {
      const end = new Date(endDate);
      const startTrimmed = new Date(end);
      startTrimmed.setDate(startTrimmed.getDate() - 30);
      startDate = startTrimmed.toISOString().split('T')[0]!;
      days = 30;
      measurementPeriod = 'Last 30 days';
    }
  } else {
    if (measurementType === 'return_rate_7_days') {
      measurementPeriod = 'Last 14 days';
    } else if (measurementType === 'return_rate_14_days') {
      measurementPeriod = 'Last 28 days';
    } else if (measurementType === 'return_rate_30_days') {
      measurementPeriod = 'Last 60 days';
    } else if (measurementType === 'happiness_composite_score') {
      measurementPeriod = 'Last 30 days';
    }
    // Use "Since release" for adoption only when launch is old enough that the Pendo window has data.
    // For the first 90 days use "Last 30 days" so adoption shows a stable, comparable number (and matches Pendo).
    if (epicLaunchDate && !isPreLaunch && measurementType.includes('unique_users') && daysSinceLaunch !== null && daysSinceLaunch > 90) {
      startDate = epicLaunchDate.toISOString().split('T')[0];
      measurementPeriod = `Since release (Day ${daysSinceLaunch})`;
    }
  }

  try {
    const primaryEventId = eventIds[0];
    let value: number | null = null;
    const rawData: Record<string, any> = {};
    const eventNames = eventIds.map(id => {
      const parts = id.split('.');
      return parts.length > 2 ? parts.slice(-2).join('.') : id;
    });
    let metricContext: MetricContext | undefined;

    let resolvedSegmentName: string | null = null;
    if (metric.pendo_segment_id) {
      try {
        const segments = await client.getSegments();
        const match = segments.find(s => s.id === metric.pendo_segment_id);
        resolvedSegmentName = match?.name ?? `Segment ${metric.pendo_segment_id.slice(0, 8)}...`;
      } catch {
        resolvedSegmentName = `Segment ${metric.pendo_segment_id.slice(0, 8)}...`;
      }
    }

    switch (measurementType) {
      case 'manual_numeric':
      case 'manual_percentage': {
        return {
          value: null,
          status: 'PENDING',
          measurementPeriod: 'Manual / external',
          metricContext: {
            description:
              measurementType === 'manual_percentage'
                ? 'Percentage is entered manually or synced from outside Pendo (e.g. spreadsheet, data warehouse).'
                : 'Value is entered manually or synced from outside Pendo (e.g. spreadsheet, data warehouse).',
            trackingEvents: [],
            measurementTypeLabel: getMeasurementTypeLabel(measurementType),
          },
        };
      }

      case 'events_per_user':
      case 'events_per_user_per_week': {
        // When multiple event IDs are configured (e.g. engagement = 3 tabs), aggregate across all so the metric
        // reflects activity on any of them. Using only the first ID would show 0 if that specific feature has no data.
        const eventIdsToUse = eventIds.length > 1 ? eventIds : [primaryEventId];
        const countPromises = eventIdsToUse.map((eid) =>
          Promise.all([
            client.getEventCount({
              eventId: eid,
              startDate,
              endDate,
              filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
            }),
            client.getUniqueVisitors({
              eventId: eid,
              startDate,
              endDate,
              filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
            }),
          ])
        );
        const perEvent = await Promise.all(countPromises);
        const totalEvents = perEvent.reduce((sum, [ev]) => sum + ev, 0);
        // Union of users across events is not available from API. Use sum of per-event unique visitors
        // as denominator (conservative: may overcount users who did multiple events, so rate is a lower bound).
        const uniqueUsers = perEvent.reduce((sum, [, u]) => sum + u, 0);

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
        const rateExplanation = measurementType === 'events_per_user_per_week'
          ? ' Card value is the rate: events per user per week for the selected period (not a user count).'
          : ' Card value is events per user in the period (not a user count).';
        metricContext = {
          description: `${totalEvents.toLocaleString()} events across ${uniqueUsers.toLocaleString()} users (who triggered ${eventIdsToUse.length > 1 ? 'these events' : 'this event'}).${rateExplanation}`,
          trackingEvents: eventNames,
          segmentName: resolvedSegmentName,
          descriptionScope: measurementPeriod,
          raw: { totalEvents, uniqueVisitors: uniqueUsers },
        };
        break;
      }
      
      case 'unique_users_percentage': {
        const [uniqueVis, totalVis] = await Promise.all([
          client.getUniqueVisitors({
            eventId: primaryEventId,
            startDate,
            endDate,
            filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
          }),
          client.getTotalUniqueVisitors({
            startDate,
            endDate,
            segmentId: metric.pendo_segment_id ?? undefined,
          }),
        ]);
        value = totalVis > 0 ? (uniqueVis / totalVis) * 100 : 0;
        const periodPct = totalVis > 0 ? ((uniqueVis / totalVis) * 100).toFixed(1) : '0';
        const inSegmentPhrase = resolvedSegmentName ? ` in this segment` : '';
        metricContext = {
          description: `${uniqueVis.toLocaleString()} unique visitors (this feature) out of ${totalVis.toLocaleString()} total app visitors${inSegmentPhrase} in this period. Adoption = ${periodPct}% (${uniqueVis.toLocaleString()} ÷ ${totalVis.toLocaleString()}).`,
          trackingEvents: eventNames,
          segmentName: resolvedSegmentName,
          descriptionScope: measurementPeriod,
          raw: { uniqueVisitors: uniqueVis, totalAppVisitors: totalVis },
        };
        break;
      }
      
      case 'unique_users_count': {
        value = await client.getUniqueVisitors({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        metricContext = {
          description: `${(value ?? 0).toLocaleString()} unique users triggered this event`,
          trackingEvents: eventNames,
          segmentName: resolvedSegmentName,
          descriptionScope: measurementPeriod,
          raw: { uniqueVisitors: value ?? 0 },
        };
        break;
      }

      case 'unique_companies_count': {
        value = await client.getUniqueAccounts({
          eventId: primaryEventId,
          startDate,
          endDate,
          filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
        });
        metricContext = {
          description: `${(value ?? 0).toLocaleString()} unique accounts triggered this event`,
          trackingEvents: eventNames,
          segmentName: resolvedSegmentName,
          descriptionScope: measurementPeriod,
          raw: {},
        };
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
        
        const [firstPeriod, secondPeriod, uniqueVis] = await Promise.all([
          client.getEventPercentage({
            eventId: primaryEventId,
            startDate: periodStart.toISOString().split('T')[0],
            endDate: periodMid.toISOString().split('T')[0],
            filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
          }),
          client.getEventPercentage({
            eventId: primaryEventId,
            startDate: periodMid.toISOString().split('T')[0],
            endDate: endDate,
            filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
          }),
          client.getUniqueVisitors({
            eventId: primaryEventId,
            startDate,
            endDate,
            filters: metric.pendo_segment_id ? { segmentId: metric.pendo_segment_id } : undefined,
          }),
        ]);
        
        if (firstPeriod > 0) {
          value = Math.min(100, (secondPeriod / firstPeriod) * 100);
        } else {
          value = 0;
        }
        metricContext = {
          description: `${uniqueVis.toLocaleString()} users returned within ${retentionDays} days (period-over-period comparison)`,
          trackingEvents: eventNames,
          segmentName: resolvedSegmentName,
          descriptionScope: measurementPeriod,
          raw: { uniqueVisitors: uniqueVis, returningVisitors: uniqueVis },
        };
        break;
      }
      
      case 'completion_rate':
      case 'success_rate': {
        const seriesParams = startDate && endDate
          ? { startDate, endDate }
          : { days: 30 as number };
        if (eventIds.length >= 2) {
          const startEventId = eventIds[0];
          const completeEventId = eventIds[1];

          const [startSeries, completeSeries] = await Promise.all([
            client.getDailyMetricTimeSeries({ eventId: startEventId, ...seriesParams }),
            client.getDailyMetricTimeSeries({ eventId: completeEventId, ...seriesParams }),
          ]);
          const startCount = startSeries.reduce((s, d) => s + d.events, 0);
          const completeCount = completeSeries.reduce((s, d) => s + d.events, 0);

          if (startCount > 0) {
            value = (completeCount / startCount) * 100;
          } else {
            value = 0;
          }
          const totalEvents = startCount + completeCount;
          let description: string;
          if (completeCount > startCount) {
            description = `First event (start): ${startCount.toLocaleString()} · Second event (complete): ${completeCount.toLocaleString()} · Total: ${totalEvents.toLocaleString()}. Complete exceeds start—swap the two in metric config, or use two Track events (Edit Metrics → Task Success → Track Events tab, e.g. Started → Completed) for a clear funnel.`;
          } else {
            description = `${completeCount.toLocaleString()} completions out of ${startCount.toLocaleString()} starts. This is the ratio of event counts in the period (how often the second action fired vs the first), not necessarily the % of users who completed the task—e.g. if users trigger "start" many times per session, the ratio can be low even when most users eventually complete.`;
          }
          metricContext = {
            description,
            trackingEvents: eventNames,
            segmentName: resolvedSegmentName,
            descriptionScope: measurementPeriod,
            raw: { totalEvents: startCount, completionCount: completeCount },
          };
        } else {
          const completeSeries = await client.getDailyMetricTimeSeries({ eventId: eventIds[0], ...seriesParams });
          const completionCount = completeSeries.reduce((s, d) => s + d.events, 0);
          value = completionCount;
          measurementPeriod = measurementPeriod ? `${measurementPeriod} (completions)` : 'Completions';
          metricContext = {
            description: `${completionCount.toLocaleString()} total completions (single event tracked)`,
            trackingEvents: eventNames,
            segmentName: resolvedSegmentName,
            descriptionScope: measurementPeriod,
            raw: { completionCount },
          };
        }
        break;
      }
      
      case 'survey_score':
      case 'nps_score': {
        return { value: null, status: 'PENDING', error: 'Survey metrics require survey responses' };
      }

      case 'happiness_composite_score': {
        const config: HeartHappinessCompositeConfig = {
          ...DEFAULT_HAPPINESS_COMPOSITE_CONFIG,
          ...(metric.composite_config?.happiness || {}),
        };

        const survey = await getNormalizedSurveyScore(metric.id, startDate, endDate);
        const frustration = await getFrustrationHealthScore(
          client,
          config,
          eventIds,
          metric.pendo_segment_id,
          startDate,
          endDate
        );

        const composite = calculateHappinessCompositeScore(survey.score, frustration.health, config);
        value = composite.score;
        rawData.happinessComposite = {
          surveyScoreNormalized: survey.score,
          surveyResponseCount: survey.responseCount,
          surveyType: survey.surveyType,
          surveyUsed: composite.surveyUsed,
          surveySource: composite.surveySource,
          frustrationPenaltyNormalized: frustration.penalty,
          frustrationHealth: frustration.health,
          frustrationEventsPer100Users: frustration.per100Users,
          frustrationTotalEvents: frustration.totalEvents,
          frustrationUniqueUsers: frustration.uniqueUsers,
          weights: {
            surveyWeight: config.surveyWeight,
            frustrationWeight: config.frustrationWeight,
          },
          lookback: { startDate, endDate },
        };
        const hasSurvey = survey.score !== null;
        const descParts: string[] = [];
        if (hasSurvey) {
          descParts.push(`Survey: ${survey.responseCount} responses (${survey.surveyType})`);
        }
        descParts.push(`${frustration.totalEvents.toLocaleString()} frustration signals across ${frustration.uniqueUsers.toLocaleString()} visitors`);
        if (frustration.usedFallback) {
          descParts.push('Visitor count is app-wide (no data on selected pages)');
        }
        if (!hasSurvey) {
          descParts.push('No survey configured — score based on frustration health only');
        }
        descParts.push('Happiness = inverse of frustration (0 frustration = 100). Survey weight will be added later.');
        metricContext = {
          description: descParts.join(' · '),
          trackingEvents: eventNames.length > 0 ? eventNames : ['All pages (native frustration)'],
          segmentName: resolvedSegmentName,
          descriptionScope: measurementPeriod,
          usedAppWideFallback: frustration.usedFallback,
          raw: { frustrationSignals: frustration.totalEvents, uniqueVisitors: frustration.uniqueUsers },
        };
        break;
      }
      
      default:
        return { value: null, status: 'PENDING', error: `Unknown measurement type: ${measurementType}` };
    }
    
    // Calculate status based on value vs target
    let status: HeartMetricStatus = 'PENDING';
    if (value !== null) {
      // Pre-release: always PENDING, not MISSED (no expectation of usage yet)
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

    return { value, status, rawData, isPreLaunch, measurementPeriod, metricContext };
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

/**
 * Get HEART category defaults mapped by category
 */
export async function getHeartCategoryDefaults(): Promise<Record<HeartCategoryId, HeartCategoryDefault>> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('heart_category_defaults')
    .select('*');

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
      console.warn('Table heart_category_defaults does not exist. Defaults unavailable.');
      return {} as Record<HeartCategoryId, HeartCategoryDefault>;
    }
    console.error('Error fetching HEART category defaults:', error);
    return {} as Record<HeartCategoryId, HeartCategoryDefault>;
  }

  const mapped: Record<HeartCategoryId, HeartCategoryDefault> = {} as Record<HeartCategoryId, HeartCategoryDefault>;
  for (const item of data || []) {
    mapped[item.heart_category as HeartCategoryId] = item as HeartCategoryDefault;
  }
  return mapped;
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
      composite_config: dto.composite_config || null,
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
  
  // Check if AI found any usable metrics
  const hasUsableMetrics = agentResult.recommendations.engagement ||
    agentResult.recommendations.adoption ||
    agentResult.recommendations.retention ||
    agentResult.recommendations.taskSuccess ||
    agentResult.recommendations.happiness;
  
  if (!hasUsableMetrics) {
    // AI couldn't find any relevant events/features/pages - don't create config.
    // Surface events, features, AND pages so the user sees we considered all (e.g. AI Notetaker is in Features).
    const pendo = agentResult.context?.pendo;
    const availableEventNames: string[] = [];
    if (pendo) {
      const eventNames = (pendo.events || []).slice(0, 25).map((e) => e.name);
      const featureNames = (pendo.features || []).slice(0, 25).map((f) => `${f.name}`);
      const pageNames = (pendo.pages || []).slice(0, 10).map((p) => `${p.name}`);
      availableEventNames.push(...eventNames, ...featureNames, ...pageNames);
    }
    return {
      config: null as any,
      metrics: [],
      recommendations: agentResult.recommendations,
      error: 'AI could not find relevant Pendo events, features, or pages for this epic. Many product features (e.g. AI Notetaker) are tracked as Pendo Features (tagged UI elements), not track events. Try manual setup and pick from Features, or add product-area context and retry.',
      availableEventNames: availableEventNames.length > 0 ? availableEventNames : undefined,
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
  const defaultsByCategory = await getHeartCategoryDefaults();
  const buildMilestones = (
    defaultMilestones: DefaultMilestone[] | null | undefined,
    fallbackTarget?: number | null,
    fallbackDays?: number | null,
    useDefaultMilestones?: boolean
  ) => {
    if (useDefaultMilestones && defaultMilestones && defaultMilestones.length > 0) {
      return defaultMilestones.map((m) => ({
        days_after_launch: m.days,
        target_value: m.target,
        label: m.label,
      }));
    }
    if (fallbackTarget && fallbackDays) {
      return [{
        days_after_launch: fallbackDays,
        target_value: fallbackTarget,
        label: fallbackDays <= 30 ? '1 Month' :
          fallbackDays <= 60 ? '2 Months' :
          fallbackDays <= 90 ? '3 Months' :
          fallbackDays <= 180 ? '6 Months' :
          `${fallbackDays} Days`,
      }];
    }
    return [];
  };
  
  // Engagement
  if (recommendations.engagement) {
    const defaults = defaultsByCategory['engagement'];
    const targetValue = defaults?.default_target_value ?? HEART_SYSTEM_DEFAULTS.engagement.targetValue;
    const targetTimeframeDays = defaults?.default_target_timeframe_days ?? HEART_SYSTEM_DEFAULTS.engagement.targetTimeframeDays;
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'engagement',
      name: generateMetricName('engagement', recommendations.engagement.eventIds, epicName),
      measurement_type: recommendations.engagement.measurementType,
      pendo_event_ids: recommendations.engagement.eventIds,
      target_value: targetValue,
      target_timeframe_days: targetTimeframeDays,
      ai_suggested: true,
      ai_rationale: recommendations.engagement.rationale,
    });
    const milestones = buildMilestones(
      defaults?.default_milestones,
      targetValue,
      targetTimeframeDays,
      recommendations.engagement.targetValue == null && recommendations.engagement.targetTimeframeDays == null
    );
    if (milestones.length > 0) {
      await createMetricMilestones(metric.id, milestones);
    }
    metrics.push(metric);
  }
  
  // Adoption
  if (recommendations.adoption) {
    const defaults = defaultsByCategory['adoption'];
    const targetValue = defaults?.default_target_value ?? HEART_SYSTEM_DEFAULTS.adoption.targetValue;
    const targetTimeframeDays = defaults?.default_target_timeframe_days ?? HEART_SYSTEM_DEFAULTS.adoption.targetTimeframeDays;
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'adoption',
      name: generateMetricName('adoption', recommendations.adoption.eventIds, epicName),
      measurement_type: recommendations.adoption.measurementType,
      pendo_event_ids: recommendations.adoption.eventIds,
      pendo_segment_id: recommendations.adoption.segmentId,
      target_value: targetValue,
      target_timeframe_days: targetTimeframeDays,
      ai_suggested: true,
      ai_rationale: recommendations.adoption.rationale,
    });
    const milestones = buildMilestones(
      defaults?.default_milestones,
      targetValue,
      targetTimeframeDays,
      recommendations.adoption.targetValue == null && recommendations.adoption.targetTimeframeDays == null
    );
    if (milestones.length > 0) {
      await createMetricMilestones(metric.id, milestones);
    }
    metrics.push(metric);
  }
  
  // Retention (recommendation has no targetValue/targetTimeframeDays; use defaults only)
  if (recommendations.retention) {
    const defaults = defaultsByCategory['retention'];
    const targetValue = defaults?.default_target_value ?? HEART_SYSTEM_DEFAULTS.retention.targetValue;
    const targetTimeframeDays = defaults?.default_target_timeframe_days ?? HEART_SYSTEM_DEFAULTS.retention.targetTimeframeDays;
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'retention',
      name: generateMetricName('retention', recommendations.retention.eventIds, epicName),
      measurement_type: recommendations.retention.measurementType,
      pendo_event_ids: recommendations.retention.eventIds,
      target_value: targetValue,
      target_timeframe_days: targetTimeframeDays,
      ai_suggested: true,
      ai_rationale: recommendations.retention.rationale,
    });
    const milestones = buildMilestones(
      defaults?.default_milestones,
      targetValue,
      targetTimeframeDays,
      true
    );
    if (milestones.length > 0) {
      await createMetricMilestones(metric.id, milestones);
    }
    metrics.push(metric);
  }
  
  // Task Success (recommendation has no targetValue/targetTimeframeDays; use defaults only)
  if (recommendations.taskSuccess) {
    const defaults = defaultsByCategory['task_success'];
    const targetValue = defaults?.default_target_value ?? HEART_SYSTEM_DEFAULTS.task_success.targetValue;
    const targetTimeframeDays = defaults?.default_target_timeframe_days ?? HEART_SYSTEM_DEFAULTS.task_success.targetTimeframeDays;
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'task_success',
      name: generateMetricName('task_success', recommendations.taskSuccess.eventIds, epicName),
      measurement_type: recommendations.taskSuccess.measurementType,
      pendo_event_ids: recommendations.taskSuccess.eventIds,
      target_value: targetValue,
      target_timeframe_days: targetTimeframeDays,
      ai_suggested: true,
      ai_rationale: recommendations.taskSuccess.rationale,
    });
    const milestones = buildMilestones(
      defaults?.default_milestones,
      targetValue,
      targetTimeframeDays,
      true
    );
    if (milestones.length > 0) {
      await createMetricMilestones(metric.id, milestones);
    }
    metrics.push(metric);
  }
  
  // Happiness (survey + frustration composite)
  if (recommendations.happiness) {
    const defaults = defaultsByCategory['happiness'];
    const metric = await createEpicHeartMetric({
      epic_heart_config_id: configId,
      heart_category: 'happiness',
      name: `Happiness - ${epicName}`,
      measurement_type: 'happiness_composite_score',
      pendo_event_ids: recommendations.happiness.frustrationEventIds,
      pendo_segment_id: recommendations.happiness.frustrationSegmentId,
      target_value: defaults?.default_target_value ?? HEART_SYSTEM_DEFAULTS.happiness.targetValue,
      target_timeframe_days: defaults?.default_target_timeframe_days ?? HEART_SYSTEM_DEFAULTS.happiness.targetTimeframeDays,
      ai_suggested: true,
      ai_rationale: recommendations.happiness.rationale,
      composite_config: {
        happiness: {
          surveyWeight: 0.7,
          frustrationWeight: 0.3,
          optimisticSurveyBaseline: 80,
          frustrationEventIds: recommendations.happiness.frustrationEventIds,
          frustrationSegmentId: recommendations.happiness.frustrationSegmentId ?? null,
          frustrationEventsPer100UsersAtMaxPenalty: 30,
        },
      },
    });
    const milestones = buildMilestones(
      defaults?.default_milestones,
      metric.target_value,
      metric.target_timeframe_days,
      true
    );
    if (milestones.length > 0) {
      await createMetricMilestones(metric.id, milestones);
    }
    metrics.push(metric);
  }
  
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

/**
 * Get latest snapshot for a metric on or before a given date (for as-of view).
 */
export async function getLatestSnapshotAsOf(
  metricId: string,
  asOfDate: string
): Promise<EpicHeartSnapshot | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('epic_heart_snapshots')
    .select('*')
    .eq('epic_heart_metric_id', metricId)
    .lte('snapshot_date', asOfDate)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Error fetching latest snapshot as of:', error);
    return null;
  }
  return data;
}

/**
 * Get release-centric view: baseline (pre-release 30d) and Month 1, 2, ... from stored snapshots.
 * Used for "How did this release impact users?" view. No Pendo calls.
 */
export async function getEpicHeartReleaseView(epicId: string): Promise<EpicHeartReleaseView> {
  const supabase = getClient();
  const config = await getEpicHeartConfig(epicId);
  if (!config) {
    return { releaseDate: null, baseline: {}, months: [] };
  }
  const metrics = await getEpicHeartMetrics(config.id);
  if (!metrics.length) {
    return { releaseDate: null, baseline: {}, months: [] };
  }

  const { data: epic } = await supabase
    .from('epic')
    .select('target_launch_date, aha_fields')
    .eq('id', epicId)
    .single();

  const isValidDateStr = (s: string | null | undefined): boolean => {
    if (!s) return false;
    return !isNaN(new Date(s).getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s);
  };
  let rawLaunchDate: string | null = null;
  if (isValidDateStr(epic?.target_launch_date)) {
    rawLaunchDate = epic!.target_launch_date;
  } else {
    const ahaFields = (epic?.aha_fields as any) || {};
    const sf = ahaFields?.standard_fields;
    const releaseName = sf?.aha_release_name || sf?.release?.name || null;
    if (releaseName) {
      const { data: schedule } = await supabase
        .from('release_schedule')
        .select('launch_date')
        .eq('release_name', releaseName)
        .maybeSingle();
      if (isValidDateStr(schedule?.launch_date)) {
        rawLaunchDate = schedule!.launch_date;
      }
    }
  }
  if (!rawLaunchDate) {
    return { releaseDate: null, baseline: {}, months: [] };
  }

  const releaseDate = new Date(rawLaunchDate);
  const releaseKey = rawLaunchDate.split('T')[0]!;
  const metricIdToCategory = new Map<string, HeartCategoryId>();
  for (const m of metrics) {
    if (m.heart_category) {
      metricIdToCategory.set(m.id, m.heart_category as HeartCategoryId);
    }
  }

  const baselineStart = new Date(releaseDate);
  baselineStart.setDate(baselineStart.getDate() - 30);
  const baselineEnd = new Date(releaseDate);
  baselineEnd.setDate(baselineEnd.getDate() - 1);
  const baselineStartKey = baselineStart.toISOString().split('T')[0]!;
  const baselineEndKey = baselineEnd.toISOString().split('T')[0]!;

  const metricIds = metrics.map((m) => m.id);
  const { data: baselineSnapshots } = await supabase
    .from('epic_heart_snapshots')
    .select('epic_heart_metric_id, value')
    .in('epic_heart_metric_id', metricIds)
    .gte('snapshot_date', baselineStartKey)
    .lte('snapshot_date', baselineEndKey);

  const baseline: Partial<Record<HeartCategoryId, number | null>> = {};
  if (baselineSnapshots?.length) {
    const byMetric = new Map<string, number[]>();
    for (const row of baselineSnapshots) {
      if (row.value != null && typeof row.value === 'number') {
        const arr = byMetric.get(row.epic_heart_metric_id) ?? [];
        arr.push(row.value);
        byMetric.set(row.epic_heart_metric_id, arr);
      }
    }
    for (const [metricId, values] of byMetric) {
      const cat = metricIdToCategory.get(metricId);
      if (cat) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        baseline[cat] = Math.round(avg * 100) / 100;
      }
    }
  }

  const months: HeartReleaseViewMonth[] = [];
  const numMonths = 6;
  for (let i = 1; i <= numMonths; i++) {
    const monthStart = new Date(releaseDate);
    monthStart.setDate(monthStart.getDate() + (i - 1) * 30);
    const monthEnd = new Date(releaseDate);
    monthEnd.setDate(monthEnd.getDate() + i * 30 - 1);
    const startKey = monthStart.toISOString().split('T')[0]!;
    const endKey = monthEnd.toISOString().split('T')[0]!;

    const { data: monthSnapshots } = await supabase
      .from('epic_heart_snapshots')
      .select('epic_heart_metric_id, value')
      .in('epic_heart_metric_id', metricIds)
      .gte('snapshot_date', startKey)
      .lte('snapshot_date', endKey);

    const metricsByCat: Partial<Record<HeartCategoryId, number | null>> = {};
    if (monthSnapshots?.length) {
      const byMetric = new Map<string, number[]>();
      for (const row of monthSnapshots) {
        if (row.value != null && typeof row.value === 'number') {
          const arr = byMetric.get(row.epic_heart_metric_id) ?? [];
          arr.push(row.value);
          byMetric.set(row.epic_heart_metric_id, arr);
        }
      }
      for (const [metricId, values] of byMetric) {
        const cat = metricIdToCategory.get(metricId);
        if (cat) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          metricsByCat[cat] = Math.round(avg * 100) / 100;
        }
      }
    }
    months.push({
      monthIndex: i,
      label: `Month ${i}`,
      startDate: startKey,
      endDate: endKey,
      metrics: metricsByCat,
    });
  }

  return {
    releaseDate: releaseKey,
    baseline,
    months,
  };
}

// ============================================================================
// Milestone Functions
// ============================================================================

/**
 * Get milestones for a metric
 */
export async function getMetricMilestones(metricId: string): Promise<HeartMetricMilestone[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('heart_metric_milestones')
    .select('*')
    .eq('epic_heart_metric_id', metricId)
    .order('days_after_launch', { ascending: true });
  
  if (error) {
    console.error('Error fetching milestones:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Create milestones for a metric
 */
export async function createMetricMilestones(
  metricId: string,
  milestones: Array<{ days_after_launch: number; target_value: number; label?: string }>
): Promise<HeartMetricMilestone[]> {
  const supabase = getClient();
  
  const insertData = milestones.map(m => ({
    epic_heart_metric_id: metricId,
    days_after_launch: m.days_after_launch,
    target_value: m.target_value,
    label: m.label || null,
  }));
  
  const { data, error } = await supabase
    .from('heart_metric_milestones')
    .insert(insertData)
    .select();
  
  if (error) {
    console.error('Error creating milestones:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Update milestones for a metric (replaces all existing)
 */
export async function updateMetricMilestones(
  metricId: string,
  milestones: Array<{ days_after_launch: number; target_value: number; label?: string }>
): Promise<HeartMetricMilestone[]> {
  const supabase = getClient();
  
  // Delete existing milestones
  await supabase
    .from('heart_metric_milestones')
    .delete()
    .eq('epic_heart_metric_id', metricId);
  
  // Insert new milestones
  if (milestones.length === 0) return [];
  
  return createMetricMilestones(metricId, milestones);
}

/**
 * Calculate milestone progress for a metric
 */
export function calculateMilestoneProgress(
  milestones: HeartMetricMilestone[],
  currentValue: number | null,
  daysSinceLaunch: number | null
): MilestoneProgress[] {
  if (milestones.length === 0 || daysSinceLaunch === null) {
    return [];
  }
  
  return milestones.map(milestone => {
    const daysRemaining = milestone.days_after_launch - daysSinceLaunch;
    const isComplete = daysSinceLaunch >= milestone.days_after_launch;
    const isPast = daysRemaining < 0;
    
    // Calculate percent complete toward this milestone
    let percentComplete = 0;
    if (currentValue !== null && milestone.target_value > 0) {
      percentComplete = Math.min(100, (currentValue / milestone.target_value) * 100);
    }
    
    // Determine status
    let status: HeartMetricStatus = 'PENDING';
    if (currentValue === null) {
      status = 'PENDING';
    } else if (currentValue >= milestone.target_value) {
      status = 'ON_TRACK'; // Hit the target
    } else if (isPast) {
      status = 'MISSED'; // Past the deadline and didn't hit target
    } else {
      // Still have time - check if we're on pace
      const expectedProgress = (daysSinceLaunch / milestone.days_after_launch);
      const actualProgress = currentValue / milestone.target_value;
      if (actualProgress >= expectedProgress * 0.8) {
        status = 'ON_TRACK'; // Within 80% of expected pace
      } else if (actualProgress >= expectedProgress * 0.5) {
        status = 'AT_RISK'; // Between 50-80% of expected pace
      } else {
        status = 'AT_RISK'; // Below 50% of expected pace but still have time
      }
    }
    
    return {
      milestone,
      currentValue,
      status,
      daysRemaining: isPast ? null : daysRemaining,
      percentComplete,
    };
  });
}

/**
 * Get the current active milestone (next one to hit)
 */
export function getCurrentMilestone(
  milestoneProgress: MilestoneProgress[],
  daysSinceLaunch: number | null
): MilestoneProgress | null {
  if (milestoneProgress.length === 0 || daysSinceLaunch === null) {
    return null;
  }
  
  // Find the first milestone that hasn't passed yet
  const upcoming = milestoneProgress.find(mp => 
    mp.daysRemaining !== null && mp.daysRemaining >= 0
  );
  
  if (upcoming) return upcoming;
  
  // If all milestones have passed, return the last one
  return milestoneProgress[milestoneProgress.length - 1];
}

// ============================================================================
// Dashboard Data
// ============================================================================

/**
 * Get full HEART dashboard for an epic
 * Fetches LIVE data from Pendo API; when asOfDate is set, uses only stored snapshots (no Pendo).
 * When window is set (e.g. 7D, 1M), adoption metrics use that date range so the card matches the chart.
 */
export async function getEpicHeartDashboard(
  epicId: string,
  options?: { asOfDate?: string; window?: HeartTrackerWindow }
): Promise<EpicHeartDashboard | null> {
  const asOfDate = options?.asOfDate ?? null;
  const chartWindow = options?.window ?? null;
  const dateRangeOverride = chartWindow ? getWindowDateRange(chartWindow) : undefined;

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
    .select('target_launch_date, scheduled_ga_dev_date, aha_fields')
    .eq('id', epicId)
    .single();

  const isValidDateStr = (s: string | null | undefined): boolean => {
    if (!s) return false;
    return !isNaN(new Date(s).getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s);
  };

  let rawLaunchDate: string | null = null;
  if (isValidDateStr(epic?.target_launch_date)) {
    rawLaunchDate = epic!.target_launch_date;
  } else {
    const ahaFields = (epic?.aha_fields as any) || {};
    const sf = ahaFields?.standard_fields;
    const releaseName = sf?.aha_release_name || sf?.release?.name || null;
    if (releaseName) {
      const { data: schedule } = await supabase
        .from('release_schedule')
        .select('launch_date')
        .eq('release_name', releaseName)
        .maybeSingle();
      if (isValidDateStr(schedule?.launch_date)) {
        rawLaunchDate = schedule!.launch_date;
      }
    }
  }
  const epicLaunchDate = rawLaunchDate ? new Date(rawLaunchDate) : null;

  const referenceDate = asOfDate ? new Date(asOfDate) : new Date();
  let daysSinceLaunch: number | null = null;
  if (epicLaunchDate) {
    daysSinceLaunch = Math.floor((referenceDate.getTime() - epicLaunchDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // When asOfDate is set, or in production (Netlify), use only stored snapshots to avoid timeout
  const useSnapshotOnly =
    Boolean(asOfDate) ||
    Boolean(process.env.NETLIFY || process.env.HEART_DASHBOARD_SNAPSHOT_ONLY);
  const pendoClient = useSnapshotOnly ? null : await getPendoClient();

  // Build id -> display name and id -> entity type (for Metric details: Page / Feature / Track event)
  let pendoEventIdToName: Record<string, string> = {};
  let pendoEventIdToType: Record<string, 'Page' | 'Feature' | 'Track event'> = {};
  if (pendoClient) {
    try {
      const [events, features, pages] = await Promise.all([
        pendoClient.getEvents().catch(() => []),
        pendoClient.getFeatures().catch(() => []),
        pendoClient.getPages().catch(() => []),
      ]);
      for (const e of events) {
        if (e.name) {
          pendoEventIdToName[e.name] = e.name;
          pendoEventIdToType[e.name] = 'Track event';
        }
      }
      for (const f of features) {
        if (f.id && f.name) {
          pendoEventIdToName[f.id] = f.name;
          pendoEventIdToType[f.id] = 'Feature';
        }
      }
      for (const p of pages) {
        if (p.id && p.name) {
          pendoEventIdToName[p.id] = p.name;
          pendoEventIdToType[p.id] = 'Page';
        }
      }
    } catch {
      // Non-fatal; UI will fall back to showing IDs
    }
  }

  // Build metrics display with live data from Pendo
  const metricsWithLiveData: HeartMetricDisplay[] = [];
  
  for (const category of categories) {
    const metric = metrics.find(m => m.heart_category === category.id) || null;
    
    // Create a "live snapshot" object (not stored, just for display)
    let latestSnapshot: EpicHeartSnapshot | null = null;
    let liveError: string | undefined;
    let trend: 'up' | 'down' | 'stable' | null = null;
    let history: EpicHeartSnapshot[] = [];
    // #region agent log
    let storedHistoryLength = 0;
    let usedPendoFallback = false;
    let pendoRawLength = 0;
    // #endregion
    
    // Track context for display
    let isPreLaunch: boolean | undefined;
    let measurementPeriod: string | undefined;
    let historyUnit: string | undefined;
    let metricContext: MetricContext | undefined;

    if (metric && pendoClient) {
      // Fetch LIVE data from Pendo; when chart window is set, all metrics use it so card and chart match
      const liveData = await fetchLiveMetricValue(
        metric,
        pendoClient,
        epicLaunchDate,
        metric.target_value,
        metric.target_timeframe_days,
        dateRangeOverride
      );

      isPreLaunch = liveData.isPreLaunch;
      measurementPeriod = liveData.measurementPeriod;
      metricContext = liveData.metricContext;
      liveError = liveData.error ?? undefined;

      // Enrich context with display names, entity type, and measurement type for chart details
      if (metricContext && metric) {
        metricContext.measurementTypeLabel = getMeasurementTypeLabel(metric.measurement_type);
        const ids = metric.pendo_event_ids ?? [];
        if (ids.length > 0) {
          metricContext.trackingItems = ids.map((id) => ({
            id,
            name: pendoEventIdToName[id] || id,
            type: pendoEventIdToType[id],
          }));
          // Task Success with Page as first "event" = page views as denominator → page→action rate, not task completion funnel
          const isCompletionRate =
            metric.measurement_type === 'completion_rate' || metric.measurement_type === 'success_rate';
          if (isCompletionRate && metricContext.trackingItems.length >= 2 && metricContext.trackingItems[0]?.type === 'Page') {
            metricContext.isPageToActionRate = true;
          }
        }
      }

      if (liveData.value !== null || !liveData.error) {
        const snapshotDate = new Date().toISOString().split('T')[0];

        // Create a virtual snapshot for display (not persisted)
        latestSnapshot = {
          id: `live-${metric.id}`,
          epic_heart_metric_id: metric.id,
          snapshot_date: snapshotDate,
          value: liveData.value,
          target_at_snapshot: metric.target_value,
          status: liveData.status,
          pendo_raw_data: liveData.rawData || {},
          calculated_at: new Date().toISOString(),
        };

        // Auto-persist today's snapshot so chart history accumulates over time
        if (liveData.value !== null) {
          supabase
            .from('epic_heart_snapshots')
            .upsert({
              epic_heart_metric_id: metric.id,
              snapshot_date: snapshotDate,
              value: liveData.value,
              target_at_snapshot: metric.target_value,
              status: liveData.status,
              pendo_raw_data: liveData.rawData || {},
              calculated_at: new Date().toISOString(),
            }, { onConflict: 'epic_heart_metric_id,snapshot_date' })
            .then(() => {}, (err: any) => console.warn('[HeartService] snapshot auto-save failed:', err?.message));
        }
      }

      // Live view (no asOfDate): always build chart history from Pendo (-30d). Stored snapshots are only used when user selects "As of" date.
      usedPendoFallback = true;
      const todayKey = new Date().toISOString().split('T')[0]!;
      // Fetch daily time-series from Pendo and compute actual metric values per day
      const allEventIds = metric.pendo_event_ids ?? [];
      // Happiness uses frustration time series (same scope as live card/description), not event counts
      if (category.id === 'happiness' && pendoClient) {
        try {
          const pageIdsForChart = metric?.pendo_event_ids ?? [];
          const frustrationCounts = await pendoClient.getFrustrationTimeSeries(
            pageIdsForChart.length > 0 ? { days: 30, pageIds: pageIdsForChart } : { days: 30 }
          );
          if (frustrationCounts.length > 0) {
            pendoRawLength = frustrationCounts.length;
            history = frustrationCounts.map(d => ({
              id: `frust-${metric.id}-${d.date}`,
              epic_heart_metric_id: metric.id,
              snapshot_date: d.date,
              value: d.count,
              target_at_snapshot: metric.target_value,
              status: 'PENDING' as HeartMetricStatus,
              pendo_raw_data: d.breakdown || {},
              calculated_at: new Date().toISOString(),
            }));
            historyUnit = 'frustration';
          } else {
            history = await getSnapshots(metric.id);
          }
        } catch {
          history = await getSnapshots(metric.id);
        }
      } else if (
        (metric.measurement_type === 'completion_rate' || metric.measurement_type === 'success_rate') &&
        allEventIds.length >= 2 &&
        pendoClient
      ) {
        // Task Success with 2 events: build history as daily completion rate (%), not summed count
        try {
          const [startSeries, completeSeries] = await Promise.all([
            pendoClient.getDailyMetricTimeSeries({ eventId: allEventIds[0], days: 30 }),
            pendoClient.getDailyMetricTimeSeries({ eventId: allEventIds[1], days: 30 }),
          ]);
          const startByDate = new Map<string, number>();
          for (const d of startSeries) {
            startByDate.set(d.date, d.events);
          }
          const completeByDate = new Map<string, number>();
          for (const d of completeSeries) {
            completeByDate.set(d.date, d.events);
          }
          const allDates = Array.from(new Set([...startByDate.keys(), ...completeByDate.keys()])).sort();
          if (allDates.length > 0) {
            pendoRawLength = allDates.length;
            history = allDates.map((date) => {
              const startCount = startByDate.get(date) ?? 0;
              const completeCount = completeByDate.get(date) ?? 0;
              const metricValue = startCount > 0 ? (completeCount / startCount) * 100 : 0;
              return {
                id: `ts-${metric.id}-${date}`,
                epic_heart_metric_id: metric.id,
                snapshot_date: date,
                value: Math.round(metricValue * 100) / 100,
                target_at_snapshot: metric.target_value,
                status: 'PENDING' as HeartMetricStatus,
                pendo_raw_data: { startCount, completeCount },
                calculated_at: new Date().toISOString(),
              };
            });
            // Do not set historyUnit = 'completions' so card averages and displays as %
          } else {
            history = await getSnapshots(metric.id);
          }
        } catch {
          history = await getSnapshots(metric.id);
        }
      } else if (allEventIds.length > 0 && pendoClient) {
        // Retention: build chart history from Pendo (return rate per day) so chart has data without waiting for stored snapshots
        if (
          metric.measurement_type === 'return_rate_7_days' ||
          metric.measurement_type === 'return_rate_14_days' ||
          metric.measurement_type === 'return_rate_30_days'
        ) {
          const retentionDays = metric.measurement_type === 'return_rate_7_days' ? 7 :
            metric.measurement_type === 'return_rate_14_days' ? 14 : 30;
          const primaryEventId = allEventIds[0]!;
          const segmentId = metric.pendo_segment_id ?? undefined;
          const filters = segmentId ? { segmentId } : undefined;
          try {
            const today = new Date();
            const daysToCompute = 14; // Reduced from 30 to stay under Netlify function timeout
            const dates: string[] = [];
            for (let i = daysToCompute - 1; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              dates.push(d.toISOString().split('T')[0]!);
            }
            const historyPromises = dates.map(async (dateStr) => {
              const periodEnd = new Date(dateStr);
              const periodMid = new Date(periodEnd);
              periodMid.setDate(periodMid.getDate() - retentionDays);
              const periodStart = new Date(periodMid);
              periodStart.setDate(periodStart.getDate() - retentionDays);
              const [firstPct, secondPct] = await Promise.all([
                pendoClient.getEventPercentage({
                  eventId: primaryEventId,
                  startDate: periodStart.toISOString().split('T')[0]!,
                  endDate: periodMid.toISOString().split('T')[0]!,
                  filters,
                }),
                pendoClient.getEventPercentage({
                  eventId: primaryEventId,
                  startDate: periodMid.toISOString().split('T')[0]!,
                  endDate: periodEnd.toISOString().split('T')[0]!,
                  filters,
                }),
              ]);
              // When there's no baseline usage in the first period, omit the point so we don't draw a misleading 0% line
              if (firstPct <= 0) return null;
              const value = Math.min(100, (secondPct / firstPct) * 100);
              return {
                id: `ret-${metric.id}-${dateStr}`,
                epic_heart_metric_id: metric.id,
                snapshot_date: dateStr,
                value: Math.round(value * 100) / 100,
                target_at_snapshot: metric.target_value,
                status: 'PENDING' as HeartMetricStatus,
                pendo_raw_data: { firstPeriodPercentage: firstPct, secondPeriodPercentage: secondPct, retentionDays },
                calculated_at: new Date().toISOString(),
              };
            });
            const computedRaw = await Promise.all(historyPromises);
            const computed = computedRaw.filter((s): s is NonNullable<typeof s> => s != null);
            if (computed.length > 0) {
              pendoRawLength = computed.length;
              history = computed;
            } else {
              history = await getSnapshots(metric.id);
              if (latestSnapshot && latestSnapshot.value !== null) {
                const todayKey = today.toISOString().split('T')[0]!;
                if (!history.some((s) => s.snapshot_date === todayKey)) {
                  history = [...history, latestSnapshot];
                }
              }
            }
          } catch {
            history = await getSnapshots(metric.id);
            if (latestSnapshot && latestSnapshot.value !== null) {
              const todayKey = new Date().toISOString().split('T')[0]!;
              if (!history.some((s) => s.snapshot_date === todayKey)) {
                history = [...history, latestSnapshot];
              }
            }
          }
        } else {
          try {
            // Fetch time series for all events and aggregate
            const allDailySeries = await Promise.all(
              allEventIds.map((eid) => pendoClient.getDailyMetricTimeSeries({ eventId: eid, days: 30 }))
            );
            // Merge: sum events and take max unique visitors per day across events
            const dailyMap = new Map<string, { date: string; events: number; visitors: number }>();
            for (const series of allDailySeries) {
              for (const d of series) {
                const existing = dailyMap.get(d.date);
                if (existing) {
                  existing.events += d.events;
                  existing.visitors = Math.max(existing.visitors, d.visitors);
                } else {
                  dailyMap.set(d.date, { ...d });
                }
              }
            }
            const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
            if (daily.length > 0) {
              pendoRawLength = daily.length;
              const maxVisitorsInADay = Math.max(...daily.map((d) => d.visitors), 1);

              history = daily.map((d) => {
                let metricValue: number;
                switch (metric.measurement_type) {
                  case 'unique_users_percentage':
                    metricValue = (d.visitors / Math.max(1, maxVisitorsInADay)) * 100;
                    break;
                  case 'events_per_user_per_week':
                    metricValue = d.visitors > 0 ? d.events / d.visitors : 0;
                    break;
                  case 'success_rate':
                  case 'completion_rate':
                    metricValue = d.events;
                    historyUnit = 'completions';
                    break;
                  default:
                    metricValue = d.events;
                }
                return {
                  id: `ts-${metric.id}-${d.date}`,
                  epic_heart_metric_id: metric.id,
                  snapshot_date: d.date,
                  value: Math.round(metricValue * 100) / 100,
                  target_at_snapshot: metric.target_value,
                  status: 'PENDING' as HeartMetricStatus,
                  pendo_raw_data: { events: d.events, visitors: d.visitors },
                  calculated_at: new Date().toISOString(),
                };
              });
            } else {
              history = await getSnapshots(metric.id);
            }
          } catch {
            history = await getSnapshots(metric.id);
          }
        }
      } else {
        history = await getSnapshots(metric.id);
        if (latestSnapshot && latestSnapshot.value !== null) {
          const todayKeyFallback = new Date().toISOString().split('T')[0];
          if (!history.some(s => s.snapshot_date === todayKeyFallback)) {
            history = [...history, latestSnapshot];
          }
        }
      }
      if (history.length >= 2) {
        const prevH = history[history.length - 2];
        const currH = history[history.length - 1];
        if (prevH.value !== null && currH.value !== null) {
          if (currH.value > prevH.value) trend = 'up';
          else if (currH.value < prevH.value) trend = 'down';
          else trend = 'stable';
        }
      }
    } else if (metric) {
      // No Pendo client - use stored snapshots (or as-of date view)
      if (asOfDate) {
        const rangeStart = new Date(asOfDate);
        rangeStart.setDate(rangeStart.getDate() - 180);
        if (epicLaunchDate && epicLaunchDate > rangeStart) {
          rangeStart.setTime(epicLaunchDate.getTime());
        }
        const rangeStartKey = rangeStart.toISOString().split('T')[0]!;
        history = await getSnapshots(metric.id, rangeStartKey, asOfDate);
        latestSnapshot = history.length > 0 ? history[history.length - 1]! : await getLatestSnapshotAsOf(metric.id, asOfDate);
      } else {
        latestSnapshot = await getLatestSnapshot(metric.id);
        if (latestSnapshot) {
          const snapshots = await getSnapshots(metric.id);
          history = snapshots;
        }
      }
      if (latestSnapshot && history.length >= 2) {
        const prev = history[history.length - 2];
        const curr = history[history.length - 1];
        if (prev.value !== null && curr.value !== null) {
          if (curr.value > prev.value) trend = 'up';
          else if (curr.value < prev.value) trend = 'down';
          else trend = 'stable';
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
    
    // Get milestones and calculate progress
    let milestoneProgress: MilestoneProgress[] = [];
    let currentMilestone: MilestoneProgress | null = null;
    let nextMilestone: HeartMetricMilestone | null = null;
    
    if (metric) {
      const milestones = await getMetricMilestones(metric.id);
      if (milestones.length > 0) {
        const currentValue = latestSnapshot?.value ?? null;
        milestoneProgress = calculateMilestoneProgress(milestones, currentValue, daysSinceLaunch);
        currentMilestone = getCurrentMilestone(milestoneProgress, daysSinceLaunch);
        
        // Find next upcoming milestone
        const upcomingMilestones = milestones.filter(m => 
          daysSinceLaunch !== null && m.days_after_launch > daysSinceLaunch
        );
        nextMilestone = upcomingMilestones.length > 0 ? upcomingMilestones[0] : null;
      }
    }

    metricsWithLiveData.push({
      category,
      metric,
      latestSnapshot,
      survey,
      history,
      trend,
      isPreLaunch,
      measurementPeriod,
      historyUnit,
      metricContext,
      milestoneProgress,
      currentMilestone,
      nextMilestone,
      liveError,
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
    let liveError: string | undefined;
    let trend: 'up' | 'down' | 'stable' | null = null;
    let isPreLaunch: boolean | undefined;
    let measurementPeriod: string | undefined;
    let history: EpicHeartSnapshot[] = [];

    if (pendoClient) {
      const liveData = await fetchLiveMetricValue(
        metric,
        pendoClient,
        epicLaunchDate,
        metric.target_value,
        metric.target_timeframe_days,
        dateRangeOverride
      );

      isPreLaunch = liveData.isPreLaunch;
      measurementPeriod = liveData.measurementPeriod;
      liveError = liveData.error ?? undefined;

      if (liveData.value !== null || !liveData.error) {
        latestSnapshot = {
          id: `live-${metric.id}`,
          epic_heart_metric_id: metric.id,
          snapshot_date: new Date().toISOString().split('T')[0],
          value: liveData.value,
          target_at_snapshot: metric.target_value,
          status: liveData.status,
          pendo_raw_data: liveData.rawData || {},
          calculated_at: new Date().toISOString(),
        };
      }

      // Calculate trend from historical snapshots
      const historicalSnapshots = await getSnapshots(metric.id);
      history = historicalSnapshots;
      if (historicalSnapshots.length >= 1 && liveData.value !== null) {
        const lastHistorical = historicalSnapshots[historicalSnapshots.length - 1];
        if (lastHistorical.value !== null) {
          if (liveData.value > lastHistorical.value) trend = 'up';
          else if (liveData.value < lastHistorical.value) trend = 'down';
          else trend = 'stable';
        }
      }
    }

    // Get milestones and calculate progress for custom metrics
    const milestones = await getMetricMilestones(metric.id);
    let milestoneProgress: MilestoneProgress[] = [];
    let currentMilestone: MilestoneProgress | null = null;
    let nextMilestone: HeartMetricMilestone | null = null;
    
    if (milestones.length > 0) {
      const currentValue = latestSnapshot?.value ?? null;
      milestoneProgress = calculateMilestoneProgress(milestones, currentValue, daysSinceLaunch);
      currentMilestone = getCurrentMilestone(milestoneProgress, daysSinceLaunch);
      
      const upcomingMilestones = milestones.filter(m => 
        daysSinceLaunch !== null && m.days_after_launch > daysSinceLaunch
      );
      nextMilestone = upcomingMilestones.length > 0 ? upcomingMilestones[0] : null;
    }

    metricsWithLiveData.push({
      category: customCategory,
      metric,
      latestSnapshot,
      survey: null,
      history,
      trend,
      isPreLaunch,
      measurementPeriod,
      milestoneProgress,
      currentMilestone,
      nextMilestone,
      liveError,
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

  return {
    config,
    metrics: metricsWithLiveData,
    overallStatus,
    daysSinceLaunch,
    launchDate: rawLaunchDate,
    pendoEventIdToName,
    ...(asOfDate ? { asOfDate } : useSnapshotOnly ? { asOfDate: referenceDate.toISOString().split('T')[0]! } : {}),
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
          pendo_raw_data: liveData.rawData || {},
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
 * Create snapshots for yesterday (closed day) for all active HEART configs.
 * Called by daily cron (e.g. 01:00 UTC) so we accumulate one immutable row per metric per day.
 */
export async function createYesterdaySnapshots(): Promise<{
  epicsProcessed: number;
  snapshotsCreated: number;
  errors: string[];
}> {
  const supabase = getClient();

  const { data: configs, error } = await supabase
    .from('epic_heart_configs')
    .select('epic_id')
    .eq('status', 'active');

  if (error || !configs) {
    console.error('[HeartService] Failed to fetch active configs:', error);
    return { epicsProcessed: 0, snapshotsCreated: 0, errors: [error?.message || 'Unknown error'] };
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const allErrors: string[] = [];
  let totalSnapshots = 0;

  for (const config of configs) {
    try {
      const snapshots = await createEpicSnapshots(config.epic_id, yesterday);
      totalSnapshots += snapshots.length;
    } catch (err: any) {
      allErrors.push(`Epic ${config.epic_id}: ${err?.message || String(err)}`);
    }
  }

  console.log(`[HeartService] Yesterday snapshots: ${configs.length} epics, ${totalSnapshots} snapshots for ${yesterday.toISOString().split('T')[0]}`);

  return {
    epicsProcessed: configs.length,
    snapshotsCreated: totalSnapshots,
    errors: allErrors,
  };
}

/**
 * Create daily snapshots for all active HEART configs.
 * Writes yesterday (closed day) so we accumulate immutable history. Call at e.g. 01:00 UTC.
 */
export async function createDailySnapshots(): Promise<{
  epicsProcessed: number;
  snapshotsCreated: number;
  errors: string[];
}> {
  return createYesterdaySnapshots();
}
