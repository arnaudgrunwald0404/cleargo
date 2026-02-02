/**
 * Pendo Context Fetcher for HEART AI Agent
 * Fetches and formats Pendo data for AI consumption
 */

import { getClient, getAdminClient } from '@/lib/db';
import { PendoClient } from '@/lib/integrations/pendo/client';
import { getEpic as getAhaEpic } from '@/lib/aha/client';

// Use admin client for server-side operations to bypass RLS
const getDbClient = () => getAdminClient();
import type { 
  PendoEventForAgent,
  PendoFeatureForAgent,
  PendoContextForAgent,
  EpicContextForAgent,
  PendoEventCached 
} from './types';

// ============================================================================
// Pendo Client Helper
// ============================================================================

/**
 * Get an authenticated Pendo client
 */
async function getPendoClient(): Promise<PendoClient | null> {
  const supabase = getDbClient();
  
  const { data: integration } = await supabase
    .from('pendo_integrations')
    .select('*')
    .eq('status', 'connected')
    .single();
  
  if (!integration) {
    console.warn('No connected Pendo integration found');
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
// Pendo Events Cache
// ============================================================================

/**
 * Sync Pendo events to local cache
 * This should be called periodically (e.g., daily) to keep cache fresh
 */
export async function syncPendoEventsCache(): Promise<number> {
  const client = await getPendoClient();
  if (!client) {
    throw new Error('Pendo integration not connected');
  }
  
  const supabase = getDbClient();
  const events = await client.getEvents();
  
  let syncedCount = 0;
  
  for (const event of events) {
    const { error } = await supabase
      .from('pendo_events_cache')
      .upsert({
        event_name: event.name,
        description: event.description || null,
        // Note: product_area, user_count, event_count would need additional API calls
        // For now, we'll populate these from aggregation queries
        synced_at: new Date().toISOString(),
      }, {
        onConflict: 'event_name',
      });
    
    if (!error) {
      syncedCount++;
    }
  }
  
  console.log(`[syncPendoEventsCache] Synced ${syncedCount} events`);
  return syncedCount;
}

/**
 * Get cached Pendo events, optionally filtered by product area
 */
export async function getCachedPendoEvents(
  productArea?: string | null
): Promise<PendoEventCached[]> {
  const supabase = getDbClient();
  
  let query = supabase
    .from('pendo_events_cache')
    .select('*')
    .order('event_name');
  
  if (productArea) {
    query = query.eq('product_area', productArea);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching cached Pendo events:', error);
    return [];
  }
  
  return data || [];
}

// ============================================================================
// Pendo Context for AI Agent
// ============================================================================

/**
 * Fetch Pendo context formatted for the AI agent
 * This includes events, features (tagged UI elements), segments, and apps
 */
export async function getPendoContextForAgent(
  productArea?: string | null
): Promise<PendoContextForAgent> {
  const client = await getPendoClient();
  
  // If no Pendo client, return empty context (AI will note this)
  if (!client) {
    return {
      events: [],
      features: [],
      segments: [],
      apps: [],
    };
  }
  
  // Fetch data in parallel
  const [events, features, segments, apps] = await Promise.all([
    client.getEvents().catch(() => []),
    client.getFeatures().catch(() => []),
    client.getSegments().catch(() => []),
    client.getApps().catch(() => []),
  ]);
  
  // Try to get cached data for user/event counts
  const supabase = getDbClient();
  const { data: cachedEvents } = await supabase
    .from('pendo_events_cache')
    .select('event_name, product_area, user_count, event_count');
  
  const cachedMap = new Map(
    (cachedEvents || []).map(e => [e.event_name, e])
  );
  
  // Format events for agent, optionally filtering by product area
  const formattedEvents: PendoEventForAgent[] = events
    .filter(e => {
      if (!productArea) return true;
      const cached = cachedMap.get(e.name);
      return cached?.product_area === productArea;
    })
    .map(e => {
      const cached = cachedMap.get(e.name);
      return {
        name: e.name,
        productArea: cached?.product_area || inferProductArea(e.name),
        description: e.description || null,
        userCount: cached?.user_count || 0,
        eventCount: cached?.event_count || 0,
      };
    });

  // Format features for agent
  const formattedFeatures: PendoFeatureForAgent[] = features.map(f => ({
    id: f.id,
    name: f.name,
    appId: f.appId,
    kind: f.kind,
    group: f.group,
  }));

  console.log(`[getPendoContextForAgent] events=${formattedEvents.length} features=${formattedFeatures.length} segments=${segments.length} apps=${apps.length}`);
  
  return {
    events: formattedEvents,
    features: formattedFeatures,
    segments,
    apps,
  };
}

/**
 * Infer product area from event name
 * Based on naming convention: App.{Module}.{Action}.{Detail}
 */
function inferProductArea(eventName: string): string | null {
  // Common patterns:
  // App.Candidate.* -> Recruiting
  // App.Goal.* -> Goals
  // App.Adp.* -> Platform
  
  const parts = eventName.split('.');
  if (parts.length < 2) return null;
  
  const module = parts[1]?.toLowerCase();
  
  const moduleToArea: Record<string, string> = {
    candidate: 'Recruiting',
    goal: 'Goals',
    adp: 'Platform',
    user: 'Platform',
    account: 'Platform',
    report: 'Reporting',
    performance: 'Performance',
    onboarding: 'Onboarding',
  };
  
  return moduleToArea[module] || null;
}

// ============================================================================
// Epic Context for AI Agent
// ============================================================================

/**
 * Get epic context formatted for the AI agent
 * Includes epic details and any success criteria from Aha!
 * Will fetch description from Aha API if not available locally
 */
export async function getEpicContextForAgent(
  epicId: string
): Promise<EpicContextForAgent | null> {
  const supabase = getDbClient();
  
  // Fetch epic details from our database
  // Note: The epic table doesn't have a 'description' column - we need to fetch from Aha
  const { data: epic, error } = await supabase
    .from('epic')
    .select(`
      id,
      name,
      tier,
      target_launch_date,
      aha_id,
      aha_fields
    `)
    .eq('id', epicId)
    .single();
  
  if (error || !epic) {
    console.error('Error fetching epic for agent context:', { epicId, error });
    return null;
  }
  
  console.log('[getEpicContextForAgent] Loaded epic:', epic.name);
  
  // Extract what we can from aha_fields
  const ahaFields = epic.aha_fields as Record<string, any> | null;
  let description = ahaFields?.description || ahaFields?.description_text || null;
  
  // If no description in local data, fetch from Aha API
  if (!description && epic.aha_id) {
    console.log('[getEpicContextForAgent] No local description, fetching from Aha API...');
    try {
      const ahaEpic = await getAhaEpic(epic.aha_id);
      // Aha description can be a string OR an object with a "body" property
      const rawDescription = ahaEpic?.description;
      let descriptionHtml: string | null = null;
      
      if (typeof rawDescription === 'string') {
        descriptionHtml = rawDescription;
      } else if (rawDescription && typeof rawDescription === 'object' && 'body' in rawDescription) {
        descriptionHtml = (rawDescription as { body: string }).body;
      }
      
      if (descriptionHtml) {
        // Aha descriptions are HTML - strip tags for AI consumption
        description = stripHtmlTags(descriptionHtml);
        console.log('[getEpicContextForAgent] Fetched description from Aha:', 
          description.substring(0, 100) + (description.length > 100 ? '...' : ''));
      }
    } catch (ahaError) {
      console.warn('[getEpicContextForAgent] Could not fetch from Aha API:', ahaError);
      // Continue without description - better than failing entirely
    }
  }
  
  // Extract success criteria from Aha! fields
  const successCriteria: string[] = [];
  
  // Check for goals in aha_fields
  const ahaGoals = ahaFields?.goals || ahaFields?.aha_goals;
  if (ahaGoals) {
    if (typeof ahaGoals === 'string') {
      successCriteria.push(ahaGoals);
    } else if (Array.isArray(ahaGoals)) {
      successCriteria.push(...ahaGoals);
    }
  }
  
  // Check for success metrics in aha_fields
  const ahaSuccessMetric = ahaFields?.success_metric || ahaFields?.aha_success_metric;
  if (ahaSuccessMetric) {
    if (typeof ahaSuccessMetric === 'string') {
      successCriteria.push(ahaSuccessMetric);
    } else if (Array.isArray(ahaSuccessMetric)) {
      successCriteria.push(...ahaSuccessMetric);
    }
  }
  
  // Try to infer product area from epic name or description
  const productArea = inferProductAreaFromEpic(epic.name, description);
  
  return {
    id: epic.id,
    name: epic.name,
    description,
    productArea,
    launchDate: epic.target_launch_date,
    tier: epic.tier,
    successCriteria: successCriteria.filter(Boolean),
  };
}

/**
 * Strip HTML tags from a string (for cleaning Aha descriptions)
 */
function stripHtmlTags(html: string): string {
  if (!html) return '';
  
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, ' ');
  
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&bull;/g, '•');
  
  // Collapse multiple whitespace to single space
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Infer product area from epic name/description
 * Returns null if no clear match - we don't want to guess
 */
function inferProductAreaFromEpic(
  name: string,
  description: string | null
): string | null {
  // We intentionally don't try to infer product area from keywords
  // The AI should work with whatever events are available and make
  // intelligent decisions (or skip categories if it can't find relevant events)
  return null;
}

// ============================================================================
// Full Context Builder
// ============================================================================

export interface FullAgentContext {
  epic: EpicContextForAgent;
  pendo: PendoContextForAgent;
}

/**
 * Build full context for the AI agent
 * Combines epic details with relevant Pendo data
 */
export async function buildAgentContext(
  epicId: string
): Promise<FullAgentContext | null> {
  // Get epic context
  const epicContext = await getEpicContextForAgent(epicId);
  if (!epicContext) {
    return null;
  }
  
  // Get Pendo context, filtered by product area if available
  const pendoContext = await getPendoContextForAgent(epicContext.productArea);
  
  return {
    epic: epicContext,
    pendo: pendoContext,
  };
}

// ============================================================================
// Event Matching Utilities
// ============================================================================

/**
 * Find Pendo events that might be related to an epic
 * Uses fuzzy matching on event names vs epic keywords
 */
export function findRelatedEvents(
  epicName: string,
  epicDescription: string | null,
  events: PendoEventForAgent[]
): PendoEventForAgent[] {
  // Extract keywords from epic
  const text = `${epicName} ${epicDescription || ''}`.toLowerCase();
  const keywords = text
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['this', 'that', 'with', 'from', 'have', 'will', 'when', 'should', 'could', 'would'].includes(w));
  
  // Score each event based on keyword matches
  const scoredEvents = events.map(event => {
    const eventText = `${event.name} ${event.description || ''}`.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      if (eventText.includes(keyword)) {
        score += 1;
      }
    }
    
    // Boost events with higher usage (more reliable)
    if (event.userCount > 100) score += 0.5;
    if (event.eventCount > 1000) score += 0.5;
    
    return { event, score };
  });
  
  // Return events with score > 0, sorted by score
  return scoredEvents
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(e => e.event);
}
