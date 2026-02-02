/**
 * HEART Metrics AI Agent
 * Uses AI to recommend HEART metrics based on epic context and Pendo data
 */

import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { buildAgentContext, findRelatedEvents, type FullAgentContext } from './pendo-context';
import type {
  HeartAgentRecommendation,
  HeartMeasurementType,
  HeartSurveyType,
  PendoEventForAgent,
  PendoFeatureForAgent,
  PendoDataConfidenceLevel,
} from './types';

// Use Claude Haiku 4.5 - fast and cost-effective ($1/MTok in, $5/MTok out)
const model = anthropic('claude-haiku-4-5-20251001');

// ============================================================================
// Zod Schema for AI Output
// ============================================================================

const heartRecommendationSchema = z.object({
  engagement: z.object({
    eventIds: z.array(z.string()),
    measurementType: z.enum(['events_per_user', 'events_per_user_per_week']),
    rationale: z.string(),
  }).optional(),
  
  adoption: z.object({
    eventIds: z.array(z.string()),
    measurementType: z.enum(['unique_users_percentage', 'unique_users_count']),
    segmentId: z.string().nullable().optional(),
    targetValue: z.number().nullable().optional(),
    targetTimeframeDays: z.number().nullable().optional(),
    rationale: z.string(),
  }).optional(),
  
  retention: z.object({
    eventIds: z.array(z.string()),
    measurementType: z.enum(['return_rate_7_days', 'return_rate_14_days', 'return_rate_30_days']),
    rationale: z.string(),
  }).optional(),
  
  taskSuccess: z.object({
    eventIds: z.array(z.string()),
    measurementType: z.enum(['completion_rate', 'success_rate']),
    rationale: z.string(),
  }).optional(),
  
  happiness: z.object({
    surveyType: z.enum(['nps', 'satisfaction', 'yes_no', 'custom']),
    suggestedQuestion: z.string(),
    rationale: z.string(),
  }).optional(),
  
  // Simple confidence assessment
  dataConfidence: z.enum(['high', 'medium', 'low']).optional(),
  dataConfidenceReason: z.string().optional(),
});

// ============================================================================
// Prompt Builder
// ============================================================================

function buildHeartAgentPrompt(context: FullAgentContext, userContext?: string): string {
  const { epic, pendo } = context;

  // Find potentially related events
  const relatedEvents = findRelatedEvents(
    epic.name,
    epic.description,
    pendo.events
  );

  // Build event list for prompt (all events; we typically have ~50–100 track types)
  const eventListText = pendo.events.length > 0
    ? pendo.events
        .slice(0, 100)
        .map(e => `- ${e.name}${e.productArea ? ` [${e.productArea}]` : ''} (${e.userCount} users, ${e.eventCount} events)`)
        .join('\n')
    : 'No Pendo events available';
  
  // Build related events section
  const relatedEventsText = relatedEvents.length > 0
    ? `\n\nEvents that seem most related to this feature:\n${relatedEvents.slice(0, 10).map(e => `- ${e.name}`).join('\n')}`
    : '';
  
  // Build segments list
  const segmentsText = pendo.segments.length > 0
    ? pendo.segments.map(s => `- ${s.name} (${s.id})`).join('\n')
    : 'No segments available';

  // Build features list: prioritize Page kind, then limit total for token budget
  const pageFeatures = pendo.features.filter(f => (f.kind || '').toLowerCase() === 'page');
  const otherFeatures = pendo.features.filter(f => (f.kind || '').toLowerCase() !== 'page');
  const prioritizedFeatures: PendoFeatureForAgent[] = [
    ...pageFeatures,
    ...otherFeatures,
  ].slice(0, 250);
  const featuresListText = prioritizedFeatures.length > 0
    ? prioritizedFeatures
        .map(f => `- id: ${f.id} | name: ${f.name} | kind: ${f.kind || 'Feature'}`)
        .join('\n')
    : 'No Pendo features available';

  const userDirectionSection = userContext
    ? `

## User direction for the AI (PRIMARY guide when present)
The user provided the following direction for what to look for in Pendo. **Use this as your PRIMARY guide** for which events to recommend.

"""
${userContext}
"""

When the user has provided direction above:
- Match events that align with what the user asked for (keywords, product area, feature names they mentioned).
- You MAY recommend events that match the user's direction even if the epic name/description do not contain those exact keywords.
- Only skip a category if neither the feature info nor the user's direction suggest any plausible matching events from the Available Pendo Events list.
- Prefer suggesting something that fits the user's context over returning nothing, as long as the event is plausibly related.
`
    : '';

  return `You are an AI assistant helping configure HEART metrics for a software feature launch.

## HEART Framework
HEART is Google's user-centered metrics framework:
- **Engagement**: How frequently and deeply are users engaging with this feature?
- **Adoption**: What percentage of eligible users have tried this feature?
- **Retention**: Are users coming back to use this feature again?
- **Task Success**: Are users completing key workflows successfully?
- **Happiness**: (Requires survey) Are users satisfied with this feature?

## Feature Information
- **Name**: ${epic.name}
- **Description**: ${epic.description || 'No description provided'}
- **Product Area**: ${epic.productArea || 'Unknown'}
- **Launch Date**: ${epic.launchDate || 'Not set'}
- **Tier**: ${epic.tier || 'Not specified'}
${epic.successCriteria.length > 0 
  ? `\n**Success Criteria from Aha!:**\n${epic.successCriteria.map(c => `- ${c}`).join('\n')}`
  : ''}
${userDirectionSection}

## Available Pendo Events (${pendo.events.length} total — custom track events)
${eventListText}
${relatedEventsText}

## Available Pendo Features (${Math.min(pendo.features.length, 250)} of ${pendo.features.length} — tagged pages and UI elements)
These are Pendo-tagged pages and UI elements (e.g. navigation, top-level pages like Recruiting, Me, Team, Company). When recommending a feature, use its **id** (not name) in eventIds.
${featuresListText}

## Available Segments
${segmentsText}

## Your Task
Recommend HEART metrics for this feature. For each dimension (except Happiness), select the most appropriate Pendo event(s) and/or feature(s) and explain your reasoning.

**eventIds can contain EITHER:**
1. An exact **event name** from "Available Pendo Events" (e.g. \`User.Login\`), OR
2. A **feature id** from "Available Pendo Features" (e.g. \`Avsy65YvGwYJviSfi1MdwdxDgp4\` — use the id value, not the name).

For page views, navigation, and top-level modules (e.g. Recruiting, Me, Team, Company), prefer **Features**—they represent tagged pages and UI elements. For custom actions (clicks, submissions), use **Events** when they exist.

## CRITICAL RULES - READ CAREFULLY

${userContext ? '**When the user provided direction above, use it as the primary guide.** Recommend events that match what they asked for, even if the epic name/description do not strongly match. Only skip a category if nothing in the event list plausibly fits the user\'s direction.\n\n' : ''}**DO NOT GUESS.** If you cannot find Pendo events that are CLEARLY related to this feature (or to the user's direction when provided), you MUST skip that HEART category entirely by not including it in your response.

It is FAR BETTER to return an empty response than to suggest tracking irrelevant events. The user will configure metrics manually if needed.

## Guidelines

1. **Match events** - Look for events that contain words from the feature name, description, ${userContext ? "or the user's direction above" : ''}
2. **Be STRICT about relevance** - An event must clearly relate to THIS feature (or to what the user asked for), not just be a high-usage event
3. **Skip liberally** - If in doubt, skip the category. Do not fill categories just to have something.
4. **Use success criteria** from Aha! to set targets when available
5. **For Happiness**, always suggest a survey question (surveys don't require event matching)

## When to SKIP a category (return undefined)

Skip a category if ANY of these are true:
- No events match the feature name, description${userContext ? ", or the user's direction" : ''}
- The description is empty/sparse and you're just guessing (and no user direction was provided)
- The only matching events are generic (like "PageView", "Login", "Meeting") that aren't specific to this feature
- You're tempted to pick high-usage events that aren't related just to fill the category

IMPORTANT: Each value in eventIds must EXACTLY match either an event name from "Available Pendo Events" or a feature id from "Available Pendo Features" (use the id field for features).

## Data Confidence

Also assess your confidence in the Pendo data quality:
- **high**: Events are clearly named, have good volume, directly related to feature
- **medium**: Events seem related but naming is ambiguous or volume is low  
- **low**: Events are poorly named, very low volume, or questionable relevance

Respond with JSON:
{
  "engagement": {
    "eventIds": ["exact_event_name"],
    "measurementType": "events_per_user_per_week",
    "rationale": "Why this measures engagement"
  },
  "adoption": {
    "eventIds": ["exact_event_name"],
    "measurementType": "unique_users_percentage",
    "segmentId": null,
    "targetValue": 80,
    "targetTimeframeDays": 60,
    "rationale": "Why this measures adoption"
  },
  "retention": {
    "eventIds": ["exact_event_name"],
    "measurementType": "return_rate_14_days",
    "rationale": "Why this measures retention"
  },
  "taskSuccess": {
    "eventIds": ["exact_event_name"],
    "measurementType": "completion_rate",
    "rationale": "Why this measures task success"
  },
  "happiness": {
    "surveyType": "satisfaction",
    "suggestedQuestion": "How satisfied are you with [feature]?",
    "rationale": "Why this question"
  },
  "dataConfidence": "high",
  "dataConfidenceReason": "Events are well-named and have good volume"
}`;
}

// ============================================================================
// AI Agent Runner
// ============================================================================

export interface HeartAgentResult {
  success: boolean;
  recommendations: HeartAgentRecommendation | null;
  context: FullAgentContext | null;
  error?: string;
  modelVersion?: string;
  // Simple confidence assessment from AI
  dataConfidence?: PendoDataConfidenceLevel;
  dataConfidenceReason?: string;
}

/**
 * Run the HEART metrics AI agent for an epic
 */
export async function runHeartAgent(
  epicId: string,
  options?: { userContext?: string }
): Promise<HeartAgentResult> {
  // Check for API key (Anthropic SDK uses ANTHROPIC_API_KEY by default)
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    return {
      success: false,
      recommendations: null,
      context: null,
      error: 'AI API key not configured (ANTHROPIC_API_KEY or CLAUDE_API_KEY)',
    };
  }
  
  // Map CLAUDE_API_KEY to ANTHROPIC_API_KEY if needed
  if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
  }
  
  try {
    // Build context
    const context = await buildAgentContext(epicId);
    if (!context) {
      return {
        success: false,
        recommendations: null,
        context: null,
        error: 'Could not load epic context',
      };
    }
    
    // Check if we have Pendo data
    if (context.pendo.events.length === 0) {
      return {
        success: false,
        recommendations: null,
        context,
        error: 'No Pendo events available. Please connect Pendo integration first.',
      };
    }
    
    // Build prompt
    const prompt = buildHeartAgentPrompt(context, options?.userContext);
    
    // Call AI
    const { object } = await generateObject({
      model,
      schema: heartRecommendationSchema,
      prompt,
    });
    
    // Validate event/feature IDs exist in context (events by name, features by id)
    const validatedRecommendations = validateRecommendations(object, context.pendo.events, context.pendo.features);
    
    return {
      success: true,
      recommendations: validatedRecommendations,
      context,
      modelVersion: 'claude-haiku-4-5',
      dataConfidence: object.dataConfidence as PendoDataConfidenceLevel | undefined,
      dataConfidenceReason: object.dataConfidenceReason,
    };
  } catch (error) {
    console.error('Error running HEART agent:', error);
    return {
      success: false,
      recommendations: null,
      context: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate that recommended event IDs exist in the available events or features
 * eventIds can be either: (1) an event name from availableEvents, or (2) a feature id from availableFeatures
 */
function validateRecommendations(
  recommendations: z.infer<typeof heartRecommendationSchema>,
  availableEvents: PendoEventForAgent[],
  availableFeatures: PendoFeatureForAgent[]
): HeartAgentRecommendation {
  const eventNames = new Set(availableEvents.map(e => e.name));
  const featureIds = new Set(availableFeatures.map(f => f.id));
  
  const filterValidEvents = (eventIds: string[]): string[] => {
    return eventIds.filter(id => eventNames.has(id) || featureIds.has(id));
  };
  
  const result: HeartAgentRecommendation = {};
  
  if (recommendations.engagement) {
    const validEventIds = filterValidEvents(recommendations.engagement.eventIds);
    if (validEventIds.length > 0) {
      result.engagement = {
        eventIds: validEventIds,
        measurementType: recommendations.engagement.measurementType as HeartMeasurementType,
        rationale: recommendations.engagement.rationale,
      };
    }
  }
  
  if (recommendations.adoption) {
    const validEventIds = filterValidEvents(recommendations.adoption.eventIds);
    if (validEventIds.length > 0) {
      result.adoption = {
        eventIds: validEventIds,
        measurementType: recommendations.adoption.measurementType as HeartMeasurementType,
        segmentId: recommendations.adoption.segmentId,
        targetValue: recommendations.adoption.targetValue,
        targetTimeframeDays: recommendations.adoption.targetTimeframeDays,
        rationale: recommendations.adoption.rationale,
      };
    }
  }
  
  if (recommendations.retention) {
    const validEventIds = filterValidEvents(recommendations.retention.eventIds);
    if (validEventIds.length > 0) {
      result.retention = {
        eventIds: validEventIds,
        measurementType: recommendations.retention.measurementType as HeartMeasurementType,
        rationale: recommendations.retention.rationale,
      };
    }
  }
  
  if (recommendations.taskSuccess) {
    const validEventIds = filterValidEvents(recommendations.taskSuccess.eventIds);
    if (validEventIds.length > 0) {
      result.taskSuccess = {
        eventIds: validEventIds,
        measurementType: recommendations.taskSuccess.measurementType as HeartMeasurementType,
        rationale: recommendations.taskSuccess.rationale,
      };
    }
  }
  
  if (recommendations.happiness) {
    result.happiness = {
      surveyType: recommendations.happiness.surveyType as HeartSurveyType,
      suggestedQuestion: recommendations.happiness.suggestedQuestion,
      rationale: recommendations.happiness.rationale,
    };
  }
  
  return result;
}

// ============================================================================
// Helper: Generate metric name from event
// ============================================================================

export function generateMetricName(
  category: string,
  eventIds: string[],
  epicName: string
): string {
  // Extract the key action from the first event
  const firstEvent = eventIds[0] || '';
  const parts = firstEvent.split('.');
  const action = parts[parts.length - 1] || 'Usage';
  
  const categoryNames: Record<string, string> = {
    engagement: 'Engagement',
    adoption: 'Adoption',
    retention: 'Retention',
    task_success: 'Task Success',
    happiness: 'Satisfaction',
  };
  
  return `${categoryNames[category] || category} - ${action}`;
}
