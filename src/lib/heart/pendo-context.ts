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
  PendoPageForAgent,
  PendoEntityForAgent,
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
      pages: [],
      segments: [],
      apps: [],
    };
  }
  
  // Fetch data in parallel — now includes pages
  let [events, features, pages, segments, apps] = await Promise.all([
    client.getEvents().catch(() => []),
    client.getFeatures().catch(() => []),
    client.getPages().catch(() => [] as Array<{ id: string; name: string; appId: string }>),
    client.getSegments().catch(() => []),
    client.getApps().catch(() => []),
  ]);

  // Build a date range for optional activity checks (segments only)
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 14);
  const startDate = start.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];
  // Keep full event/feature lists for AI matching.
  // Filtering by recent activity can hide exactly the event the user expects.
  if (segments.length > 0) {
    const segmentChecks = await Promise.all(
      segments.map(async (segment) => {
        let count = 0;
        try {
          count = await client.getTotalUniqueVisitors({
            startDate,
            endDate,
            segmentId: segment.id,
          });
        } catch {
          count = 0;
        }
        return { segment, count };
      })
    );
    segments = segmentChecks.filter(c => c.count > 0).map(c => c.segment);
  }
  
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

  // Format pages for agent
  const formattedPages: PendoPageForAgent[] = pages.map(p => ({
    id: p.id,
    name: p.name,
    appId: p.appId,
  }));

  console.log(`[getPendoContextForAgent] events=${formattedEvents.length} features=${formattedFeatures.length} pages=${formattedPages.length} segments=${segments.length} apps=${apps.length}`);

  return {
    events: formattedEvents,
    features: formattedFeatures,
    pages: formattedPages,
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
  const sf = ahaFields?.standard_fields;
  let description: string | null = null;

  // Try structured path first: aha_fields.standard_fields.description.body (HTML)
  const descBody = sf?.description?.body;
  if (typeof descBody === 'string' && descBody.trim()) {
    description = stripHtmlTags(descBody);
  }
  // Fallback to flat fields
  if (!description) {
    description = ahaFields?.description || ahaFields?.description_text || null;
  }
  
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
// Entity Matching Utilities (MCP-inspired)
// ============================================================================

/**
 * Split CamelCase and PascalCase into separate tokens.
 * "ClearInsights" → ["clear", "insights"]
 * "OneOnOne" → ["one", "on", "one"]
 */
function splitCamelCase(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Normalize a single token: lowercase, strip non-alnum, light stem.
 */
function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(ing|tion|ions|ment|ments|ed|es|s)$/g, '');
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'when', 'should',
  'could', 'would', 'the', 'and', 'for', 'are', 'not', 'but', 'all',
  'can', 'had', 'her', 'was', 'one', 'our', 'out', 'also', 'been',
  'into', 'each', 'then', 'them', 'than', 'its', 'over', 'such', 'more',
  'some', 'other', 'these', 'using', 'used', 'via', 'app', 'new', 'to',
  'do', 'be', 'if', 'or', 'an', 'by', 'of', 'in', 'on', 'at', 'it',
  'no', 'so', 'up', 'he', 'we', 'my', 'me', 'how', 'who', 'what',
  'just', 'may', 'might', 'any', 'you', 'your',
]);

/**
 * Advanced tokenizer that handles:
 * - Dot-notation: "App.ClearInsights.Search" → ["clearinsight", "search"]
 * - CamelCase: "ClearInsights" → ["clear", "insight"]
 * - Hyphens/underscores: "ci-dashboard" → ["ci", "dashboard"]
 * - Brackets: "[RnA]" → ["rna"]
 */
function tokenize(value: string): string[] {
  const raw = value
    .replace(/\[([^\]]*)\]/g, ' $1 ')
    .split(/[.\s\-_/,;:()]+/)
    .filter(Boolean);

  const tokens: string[] = [];
  for (const part of raw) {
    const camelParts = splitCamelCase(part);
    for (const cp of camelParts) {
      const normed = normalizeToken(cp);
      if (normed.length > 1 && !STOP_WORDS.has(normed)) {
        tokens.push(normed);
      }
    }
    // Also add the full joined part as a token for compound matching
    const fullNormed = normalizeToken(part);
    if (fullNormed.length > 2 && !STOP_WORDS.has(fullNormed)) {
      tokens.push(fullNormed);
    }
  }

  return [...new Set(tokens)];
}

/**
 * Check if a short token (2-4 chars) could be an abbreviation for a compound name.
 * "ci" matches "ClearInsights" because C-I are first letters.
 * "rff" matches "React Feature Flags" because R-F-F are first letters.
 */
function isAbbreviationOf(abbr: string, compoundTokens: string[]): boolean {
  if (abbr.length < 2 || abbr.length > 5 || compoundTokens.length < 2) return false;
  if (abbr.length > compoundTokens.length) return false;

  const initials = compoundTokens
    .map(t => t.charAt(0))
    .join('');
  return initials.startsWith(abbr) || initials === abbr;
}

/**
 * Build a unified list of searchable entities from all Pendo data.
 */
function buildEntityList(context: PendoContextForAgent): PendoEntityForAgent[] {
  const entities: PendoEntityForAgent[] = [];

  for (const ev of context.events) {
    entities.push({
      id: ev.name,
      name: ev.name,
      entityType: 'trackEvent',
      description: ev.description,
    });
  }

  for (const feat of context.features) {
    entities.push({
      id: feat.id,
      name: feat.name,
      entityType: 'feature',
      description: null,
    });
  }

  for (const page of context.pages) {
    entities.push({
      id: page.id,
      name: page.name,
      entityType: 'page',
      description: null,
    });
  }

  return entities;
}

/**
 * Score a single keyword against a set of entity tokens.
 * Returns points earned (0 if no match).
 */
function scoreKeywordMatch(keyword: string, entityTokens: string[]): number {
  if (entityTokens.includes(keyword)) return 3;

  const hasStemMatch = entityTokens.some(
    t => (t.length > 3 && keyword.length > 3) && (t.startsWith(keyword) || keyword.startsWith(t))
  );
  if (hasStemMatch) return 2;

  if (keyword.length <= 5 && isAbbreviationOf(keyword, entityTokens)) return 2.5;

  return 0;
}

/**
 * Find Pendo entities (events, features, pages) related to an epic.
 * Uses IDF-weighted scoring to avoid template boilerplate drowning real signal.
 * Name keywords are weighted 3x higher than description keywords.
 */
export function findRelatedEntities(
  epicName: string,
  epicDescription: string | null,
  context: PendoContextForAgent
): PendoEntityForAgent[] {
  const allEntities = buildEntityList(context);

  // Two-tier keyword extraction: name is high-signal, description is noisy
  const nameKeywords = tokenize(epicName);
  const nameSet = new Set(nameKeywords);
  const descKeywords = epicDescription
    ? tokenize(epicDescription).filter(k => !nameSet.has(k))
    : [];

  // Pre-tokenize all entities
  const entityTokenSets = allEntities.map(e =>
    tokenize(`${e.name} ${e.description || ''}`)
  );

  // Compute document frequency (DF) for IDF weighting
  const allKeywords = [...new Set([...nameKeywords, ...descKeywords])];
  const docFreq = new Map<string, number>();
  for (const kw of allKeywords) {
    let count = 0;
    for (const tokenSet of entityTokenSets) {
      if (tokenSet.includes(kw) || tokenSet.some(t => (t.length > 3 && kw.length > 3) && (t.startsWith(kw) || kw.startsWith(t)))) {
        count++;
      }
    }
    docFreq.set(kw, count);
  }

  // IDF weight: rare keywords score higher, common keywords score lower (but not zero)
  const totalEntities = allEntities.length || 1;
  const idfWeight = (kw: string): number => {
    const df = docFreq.get(kw) || 1;
    return Math.max(0.1, Math.log2(totalEntities / df));
  };

  // Hard-filter description keywords that match >15% of entities (pure noise)
  // Name keywords are never hard-filtered — IDF weighting handles them
  const descNoiseCutoff = totalEntities * 0.15;
  const effectiveDescKw = descKeywords
    .filter(k => (docFreq.get(k) || 0) <= descNoiseCutoff)
    .sort((a, b) => (docFreq.get(a) || 0) - (docFreq.get(b) || 0))
    .slice(0, 20);

  const scored = allEntities.map((entity, idx) => {
    const entityTokens = entityTokenSets[idx];
    let score = 0;

    // Name keywords: 3x base weight, multiplied by IDF
    for (const kw of nameKeywords) {
      const matchScore = scoreKeywordMatch(kw, entityTokens);
      if (matchScore > 0) {
        score += matchScore * 3 * idfWeight(kw);
      }
    }

    // Description keywords: 1x base weight, multiplied by IDF
    for (const kw of effectiveDescKw) {
      const matchScore = scoreKeywordMatch(kw, entityTokens);
      if (matchScore > 0) {
        score += matchScore * idfWeight(kw);
      }
    }

    // Small boost for pages/features (higher signal than generic track events)
    if (entity.entityType === 'page') score *= 1.1;
    if (entity.entityType === 'feature') score *= 1.05;

    return { entity, score };
  });

  // Require a meaningful score
  const minScore = nameKeywords.length > 0 ? 5 : 2;
  const results = scored
    .filter(e => e.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map(e => e.entity);

  return results;
}

/**
 * Legacy wrapper: Find related events only (for backward compatibility).
 */
export function findRelatedEvents(
  epicName: string,
  epicDescription: string | null,
  events: PendoEventForAgent[]
): PendoEventForAgent[] {
  const dummyContext: PendoContextForAgent = {
    events,
    features: [],
    pages: [],
    segments: [],
    apps: [],
  };
  return findRelatedEntities(epicName, epicDescription, dummyContext)
    .filter(e => e.entityType === 'trackEvent')
    .map(e => events.find(ev => ev.name === e.id)!)
    .filter(Boolean);
}
