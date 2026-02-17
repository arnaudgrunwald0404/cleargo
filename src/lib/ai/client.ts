import { google } from '@ai-sdk/google';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';

// Map GEMINI_API_KEY to the expected name if not already set
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

const model = google('gemini-1.5-pro-latest');

export interface CriterionSuggestion {
    id: string;
    label: string;
    reason: string;
}

/**
 * Suggests which criteria to prune based on epic description and tags.
 */
export async function pruneCriteria(
    epicName: string,
    epicDescription: string,
    tags: string[],
    criteria: Array<{ id: string; label: string; description: string }>
): Promise<CriterionSuggestion[]> {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.warn('Neither GEMINI_API_KEY nor GOOGLE_GENERATIVE_AI_API_KEY is set, skipping AI pruning');
        return [];
    }

    try {
        const { object } = await generateObject({
            model,
            schema: z.object({
                suggestions: z.array(z.object({
                    id: z.string(),
                    label: z.string(),
                    reason: z.string()
                }))
            }),
            prompt: `
            You are a Product Operations assistant helping to set up a Launch Readiness checklist for a new product epic.
            
            Epic Name: ${epicName}
            Epic Description: ${epicDescription}
            Tags: ${tags.join(', ')}
            
            Based on the epic description, identify which of the following criteria are likely IRRELEVANT and should be suggested for removal (pruning).
            For each suggestion, provide a brief, professional reason.
            
            Checklist Criteria:
            ${criteria.map(c => `- [${c.id}] ${c.label}: ${c.description}`).join('\n')}
            
            Look for indicators like:
            - Internal-only launches vs public-facing.
            - Maintenance/infrastructure vs new features.
            - Restricted geographic scope (e.g. non-EU means GDPR might be less relevant).
            - No UI changes (prune UX reviews).
            `,
        });

        return object.suggestions;
    } catch (error) {
        console.error('Error in AI pruneCriteria:', error);
        return [];
    }
}

/**
 * Generates a personalized Slack nudge for a stale criterion.
 */
export async function generateSmartNudge(data: {
    launchName: string;
    criterionLabel: string;
    ownerName: string;
    statusNotes: string | null;
    daysStale: number;
}): Promise<string | null> {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        return null;
    }

    try {
        const { text } = await generateText({
            model,
            prompt: `
            Draft a personalized, professional Slack reminder for ${data.ownerName} regarding the launch "${data.launchName}".
            The checklist item "${data.criterionLabel}" has not been updated in ${data.daysStale} days.
            
            Recent status notes: ${data.statusNotes || 'None'}
            
            Rules:
            - Be concise and friendly.
            - Reference the specific criterion and launch name.
            - If there are recent notes, mention them to show context (e.g., "Last we heard was...").
            - The goal is to get them to update the status in the Launch Console.
            - Ensure the tone is helpful, not nagging.
            `,
        });

        return text.trim();
    } catch (error) {
        console.error('Error in AI generateSmartNudge:', error);
        return null;
    }
}

/** Summary shape for digest narrative generation */
export interface DigestNarrativeInput {
    week_of: string;
    last_releases: Array<{
        release_name: string;
        launch_date: string | null;
        average_readiness: number;
        metrics_count: number;
        high_risk_epics?: Array<{ name: string; tier: string | null; risk_level: string | null }>;
    }>;
    next_releases: Array<{
        release_name: string;
        launch_date: string | null;
        readiness_status: string;
        high_risk_epics?: Array<{ name: string; tier: string | null; risk_level: string | null }>;
    }>;
}

/**
 * Generates a short narrative (2–4 sentences) for the Weekly Release Readiness Status Update.
 * E.g. "In the past few weeks we have launched [tier 1 X, tier 2 Y] which is very exciting...
 * We are getting ready for the next release with [items] and things are looking good so far."
 */
export async function generateDigestNarrative(data: DigestNarrativeInput): Promise<string | null> {
    // Ensure API key mapping happens at runtime (not just module load)
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
    }
    
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    const hasGoogleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    
    if (!hasGeminiKey && !hasGoogleKey) {
        console.warn('generateDigestNarrative: Neither GEMINI_API_KEY nor GOOGLE_GENERATIVE_AI_API_KEY is set');
        return null;
    }
    
    console.log('generateDigestNarrative: API key found, attempting to generate narrative...', {
        hasGeminiKey,
        hasGoogleKey,
        geminiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
        googleKeyLength: process.env.GOOGLE_GENERATIVE_AI_API_KEY?.length || 0,
    });

    try {
        const lastSummary = data.last_releases
            .map(
                (r) =>
                    `${r.release_name} (avg readiness ${r.average_readiness}%, ${r.metrics_count} metrics)` +
                    (r.high_risk_epics?.length
                        ? `; high-risk: ${r.high_risk_epics.map((e) => `${e.name} (${e.tier || '?'})`).join(', ')}`
                        : '')
            )
            .join('; ');
        const nextSummary = data.next_releases
            .map(
                (r) =>
                    `${r.release_name} (${r.readiness_status})` +
                    (r.high_risk_epics?.length
                        ? `; high-risk: ${r.high_risk_epics.map((e) => `${e.name} (${e.tier || '?'})`).join(', ')}`
                        : '')
            )
            .join('; ');

        const { text } = await generateText({
            model,
            prompt: `
You are a Product Operations assistant writing the opening paragraph for the "Weekly Release Readiness Status Update" Slack message.
Write 2–4 short, professional sentences that:
1. Remind the team what we launched recently (reference the last 1–2 releases by name and tier if relevant, e.g. "we launched Tier 1 X and Tier 2 Y") and note that we're seeing signs of adoption.
2. Set up the next release (reference the next 1–2 releases) and mention important high-risk or tier 1/tier 2 items; say things are looking good so far (or note concerns briefly if any).
Be concise, positive but factual. No bullet points. Output only the paragraph, no title or prefix.

Data for this week (${data.week_of}):
- Last releases: ${lastSummary || 'None'}
- Next releases: ${nextSummary || 'None'}
`,
        });

        return text?.trim() || null;
    } catch (error: any) {
        console.error('Error in generateDigestNarrative:', {
            message: error?.message,
            name: error?.name,
            stack: error?.stack,
            cause: error?.cause,
        });
        return null;
    }
}
