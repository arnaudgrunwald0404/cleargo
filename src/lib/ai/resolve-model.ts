/**
 * Shared Claude-preferred / Gemini-fallback model resolution, extracted from
 * src/lib/heart/agent.ts so new LLM call sites (e.g. the Story Brief generator) don't duplicate
 * the Netlify ANTHROPIC_BASE_URL workaround and let it drift out of sync.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

const ANTHROPIC_API_V1 = 'https://api.anthropic.com/v1';

/**
 * Netlify (and some hosts) set ANTHROPIC_BASE_URL to a site-local AI path
 * (e.g. .../.netlify/ai) that returns 404 unless that product is fully enabled.
 * The default @ai-sdk/anthropic client follows that env, so we override in that
 * case and use the real Anthropic Messages API.
 */
export function getAnthropicBaseUrl(): string {
  const fromEnv = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/$/, '');
  if (fromEnv && (fromEnv.includes('/.netlify/ai') || fromEnv.includes('.netlify.app'))) {
    return ANTHROPIC_API_V1;
  }
  if (fromEnv) return fromEnv;
  return ANTHROPIC_API_V1;
}

/**
 * Resolve the AI model: prefer Claude with a real sk-ant- key, fall back to Gemini.
 * Netlify's AI integration injects a proxy key that fails against api.anthropic.com.
 */
export function resolveDefaultModel(
  claudeModel: string = 'claude-haiku-4-5-20251001',
  geminiModel: string = 'gemini-2.5-flash'
): LanguageModel | null {
  if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
    return createAnthropic({ baseURL: getAnthropicBaseUrl() })(claudeModel);
  }
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
  if (geminiKey) {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
    }
    return google(geminiModel);
  }
  return null;
}
