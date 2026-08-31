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
 * A base URL must end in the API version: the SDK appends `/messages` to it, so
 * `https://host` yields `https://host/messages` and 404s. Every documented
 * Anthropic base URL includes `/v1`.
 */
function withApiVersion(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/** api.anthropic.com and nothing else. */
function isFirstPartyAnthropic(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'api.anthropic.com' || host.endsWith('.anthropic.com');
  } catch {
    return false;
  }
}

let warnedAboutForeignBaseUrl = false;

/**
 * Where to send Messages API calls.
 *
 * ANTHROPIC_BASE_URL is deliberately NOT honoured. It is a machine-wide
 * convention: a developer who points it at their own gateway for one project
 * silently redirects every Claude call in every other project on that machine,
 * and Netlify sets it to a site-local `/.netlify/ai` path that 404s unless that
 * product is enabled. Both failure modes look identical from here -- a 404 from
 * a URL nobody in this repo chose.
 *
 * This used to be an opt-out blocklist matching `/.netlify/ai` and
 * `.netlify.app`, which could only ever catch the hosts someone had already
 * been burned by. It missed a real one (a corporate AI gateway) and every AI
 * feature in the app failed with `AI_APICallError: Not Found` on that machine.
 *
 * So: opt in with CLEARGO_ANTHROPIC_BASE_URL when you actually want ClearGO
 * behind a proxy. An ambient ANTHROPIC_BASE_URL is used only when it points at
 * Anthropic itself, where it cannot break anything.
 */
export function getAnthropicBaseUrl(): string {
  const explicit = process.env.CLEARGO_ANTHROPIC_BASE_URL?.trim();
  if (explicit) return withApiVersion(explicit);

  const ambient = process.env.ANTHROPIC_BASE_URL?.trim();
  if (ambient) {
    if (isFirstPartyAnthropic(ambient)) return withApiVersion(ambient);
    if (!warnedAboutForeignBaseUrl) {
      warnedAboutForeignBaseUrl = true;
      console.warn(
        `[ai] Ignoring ANTHROPIC_BASE_URL=${ambient} and using ${ANTHROPIC_API_V1}. ` +
          'Set CLEARGO_ANTHROPIC_BASE_URL if ClearGO really should use that gateway.'
      );
    }
  }

  return ANTHROPIC_API_V1;
}

/**
 * Resolve the AI model: prefer Claude with a real sk-ant- key, fall back to Gemini.
 * Netlify's AI integration injects a proxy key that fails against api.anthropic.com.
 */
export function resolveDefaultModel(
  claudeModel: string = 'claude-haiku-4-5',
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
