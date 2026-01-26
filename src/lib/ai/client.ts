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
