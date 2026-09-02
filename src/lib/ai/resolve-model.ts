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
 * The models every call site uses, in one place.
 *
 * Google retires Gemini versions and then REFUSES them for new users with
 * "no longer available to new users" -- which is a runtime failure, not a
 * deprecation warning. This repo had two different stale ids scattered across
 * six files (gemini-2.5-flash in five, gemini-1.5-pro-latest in two more), so
 * the last retirement broke retros, the weekly digest and stale-criteria nudges
 * silently. Import these instead of writing an id inline, so the next
 * retirement is a one-line change.
 *
 * Note the @ai-sdk/google type union in the installed version stops at
 * gemini-3-pro-preview; ids newer than that still typecheck because the union
 * carries a `(string & {})` member.
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

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
  claudeModel: string = DEFAULT_CLAUDE_MODEL,
  geminiModel: string = DEFAULT_GEMINI_MODEL
): LanguageModel | null {
  return resolveModelChain(claudeModel, geminiModel)[0]?.model ?? null;
}

export interface ModelCandidate {
  model: LanguageModel;
  /** For log lines when one candidate hands off to the next. */
  label: string;
}

/**
 * Every model we could use, best first.
 *
 * Previously only the first of these was ever returned, so the Gemini fallback
 * fired only when no Anthropic key was CONFIGURED -- never when a configured
 * one FAILED. An exhausted Anthropic quota therefore took every AI feature down
 * while a perfectly good Gemini key sat unused in the same environment.
 */
export function resolveModelChain(
  claudeModel: string = DEFAULT_CLAUDE_MODEL,
  geminiModel: string = DEFAULT_GEMINI_MODEL
): ModelCandidate[] {
  const chain: ModelCandidate[] = [];

  if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (anthropicKey.startsWith('sk-ant-')) {
    chain.push({
      model: createAnthropic({ baseURL: getAnthropicBaseUrl() })(claudeModel),
      label: claudeModel,
    });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
  if (geminiKey) {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
    }
    chain.push({ model: google(geminiModel), label: geminiModel });
  }

  return chain;
}

/** Quota, spend-cap and capacity wording, which does not always carry a 429. */
const TRANSIENT_MESSAGE = /usage limit|quota|credit balance|rate limit|overloaded|capacity|too many requests/i;

/**
 * Whether another provider is worth trying.
 *
 * Deliberately conservative on 400: a malformed request or a schema the model
 * cannot satisfy fails identically everywhere, and retrying would double the
 * latency and hide our own bug. The exception is a 400 whose message is about
 * spend or quota -- Anthropic does not always return 429 for those.
 */
export function shouldTryNextModel(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (typeof status === 'number') {
    if (status >= 500) return true;
    // 401/403: a bad or revoked key. 402: billing. 408/409/429: transient.
    if ([401, 402, 403, 408, 409, 429].includes(status)) return true;
    if (status === 400) return TRANSIENT_MESSAGE.test(message);
    return false;
  }

  // No status: a network or DNS failure, or a wrapped error we cannot classify.
  // The other provider is a different host, so it is worth one attempt.
  return true;
}

/**
 * Run `operation` against each candidate until one succeeds.
 *
 * Rethrows the FIRST error rather than the last when everything fails: the
 * primary model's failure is the one that describes the actual problem, and a
 * downstream "no Gemini key" would bury it.
 */
export async function runWithModelFallback<T>(
  candidates: ModelCandidate[],
  operation: (model: LanguageModel) => Promise<T>,
  log: (message: string) => void = console.warn
): Promise<T> {
  if (candidates.length === 0) {
    throw new Error(
      'No AI model configured (set CLAUDE_API_KEY/ANTHROPIC_API_KEY or GEMINI_API_KEY)'
    );
  }

  let firstError: unknown = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      return await operation(candidate.model);
    } catch (error) {
      if (firstError === null) firstError = error;

      const isLast = i === candidates.length - 1;
      if (isLast || !shouldTryNextModel(error)) throw firstError;

      log(
        `[ai] ${candidate.label} failed (${
          error instanceof Error ? error.message : String(error)
        }); trying ${candidates[i + 1].label}.`
      );
    }
  }

  // Unreachable: the loop either returns or throws.
  throw firstError;
}
