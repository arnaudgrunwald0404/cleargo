import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const ANTHROPIC_API_V1 = 'https://api.anthropic.com/v1';

/**
 * Match HEART agent / Netlify workaround: avoid site-local Netlify AI URLs that 404.
 */
function getAnthropicBaseUrl(): string {
  const fromEnv = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/$/, '');
  if (fromEnv && (fromEnv.includes('/.netlify/ai') || fromEnv.includes('.netlify.app'))) {
    return ANTHROPIC_API_V1;
  }
  if (fromEnv) return fromEnv;
  return ANTHROPIC_API_V1;
}

/** ClearGO standard is `CLAUDE_API_KEY`; `ANTHROPIC_API_KEY` is supported as fallback. */
function resolveAnthropicApiKey(): string | undefined {
  const k =
    process.env.CLAUDE_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  return k || undefined;
}

/**
 * Same order as RRV `api/generate-card-descriptions.js`.
 * On 404 (retired model id), try the next — mirrors RRV’s fallback behavior.
 */
const CARD_DESCRIPTION_MODEL_FALLBACK = [
  'claude-haiku-4-5-20251001',
  'claude-3-haiku-20240307',
  'claude-sonnet-4-5-20250929',
] as const;

function isRetryableModelNotFound(error: unknown): boolean {
  const status =
    error && typeof error === 'object' && 'statusCode' in error
      ? Number((error as { statusCode?: number }).statusCode)
      : NaN;
  return status === 404;
}

export interface CardDescriptionItemInput {
  ahaKey: string;
  ahaName: string;
  ahaDescription: string;
}

function buildPrompt(items: CardDescriptionItemInput[]): string {
  return `For each feature below, write ONE concise sentence (maximum 15 words) summarizing what it delivers for customers or the business. Be factual; use the description text if present.

${items
  .map(
    (i) =>
      `${i.ahaKey}: ${i.ahaName}\nDescription: ${i.ahaDescription || 'Not provided'}`,
  )
  .join('\n\n')}

Reply with ONLY valid JSON: an object whose keys are exactly the aha keys above and values are the short sentences. Example: {"APP-E-1": "Adds guided onboarding for new hiring managers."}`;
}

function parseDescriptionsJson(text: string, items: CardDescriptionItemInput[]): Record<string, string> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI response did not contain JSON');
  }
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const i of items) {
    const v = parsed[i.ahaKey];
    out[i.ahaKey] = typeof v === 'string' && v.trim() ? v.trim() : i.ahaName;
  }
  return out;
}

/**
 * Batch-generate ≤15-word factual blurbs for roadmap epic cards (Claude; RRV model order).
 */
export async function generateCardDescriptionsForBatch(
  items: CardDescriptionItemInput[],
): Promise<Record<string, string>> {
  if (items.length === 0) return {};

  const anthropicKey = resolveAnthropicApiKey();
  if (!anthropicKey) {
    throw new Error(
      'No Claude API key for card descriptions: set CLAUDE_API_KEY or ANTHROPIC_API_KEY',
    );
  }

  const prompt = buildPrompt(items);
  const clientOpts = {
    baseURL: getAnthropicBaseUrl(),
    apiKey: anthropicKey,
  };

  let lastError: unknown;
  for (const modelId of CARD_DESCRIPTION_MODEL_FALLBACK) {
    try {
      const model = createAnthropic(clientOpts)(modelId);
      const { text } = await generateText({
        model,
        prompt,
        maxOutputTokens: 1024,
      });
      return parseDescriptionsJson(text, items);
    } catch (e) {
      lastError = e;
      if (isRetryableModelNotFound(e)) continue;
      throw e;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All Claude models failed for card descriptions');
}

export function cleanEpicDescriptionForAi(htmlOrText: string | null | undefined): string {
  if (!htmlOrText) return '';
  const text = htmlOrText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}
