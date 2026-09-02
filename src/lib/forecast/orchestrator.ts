/**
 * Live forecast generation pipeline for a NEW forecast (Phase 5). Runs research + narrative
 * LLM passes, tries the Pricing Agent (falls back to a hypothesis if the pricing sheet isn't
 * configured yet — see src/lib/pricing/index.ts), then runs the deterministic engine. Returns
 * rows ready to insert as a new forecast_runs version; does not write to the database itself —
 * callers (the sync route or the background function) own persistence, same separation HEART's
 * setupHeartMetricsWithAI uses.
 *
 * This can take minutes end to end, which is why it's always invoked through the async job
 * pattern (forecast_generation_jobs + Netlify background function) in production.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { getPackagePrice } from '../pricing';
import { computeForecastPeriods, AI_NOTETAKER_BASELINE_RAMP, type VolumeEngineInput } from './engine';

function ensureKeys(): void {
  if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
  }
}

function resolveModel(): LanguageModel {
  ensureKeys();
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (anthropicKey.startsWith('sk-ant-')) {
    return createAnthropic({})('claude-haiku-4-5-20251001');
  }
  return google('gemini-3.1-pro-preview');
}

export interface ForecastGenerationInput {
  epicAhaId: string;
  productName: string;
  productDescription: string;
  gaDate: string | null; // YYYY-MM-DD, null if not yet scheduled
  pricingNotes?: string;
  packageKeyGuess?: string; // best-guess platform package key, for the Pricing Agent
  employeesGuess?: number; // typical account size, for the Pricing Agent
}

const ScenarioNumber = z.object({ bear: z.number(), base: z.number(), bull: z.number() });

const ResearchSchema = z.object({
  tam: z.object({ estimateUsd: z.number(), basis: z.string(), confidence: z.enum(['confirmed', 'hypothesis', 'low_confidence']) }),
  eligiblePool: ScenarioNumber.describe('Size of the cross-sell/adoption pool this product targets'),
  threeYearPenetration: ScenarioNumber.describe('Fraction (0-1) of the eligible pool expected to adopt within 3 years'),
  crossSellShare: ScenarioNumber.describe('Fraction (0-1) of new adopting accounts attributed to cross-sell vs. net-new logos'),
  competitorPricing: z.array(z.object({ name: z.string(), annualPriceUsd: z.number(), notes: z.string() })),
  churnAtRiskArrUsd: ScenarioNumber.describe('Named/estimated ARR at risk of churn that this product would protect'),
  churnProtectionRate: ScenarioNumber.describe('Fraction (0-1) of the at-risk pool retained by end of the 3-year horizon'),
});

const NarrativeSchema = z.object({
  whyWeBelieve: z.string().describe('5-8 bullet points, markdown, on the strongest signals supporting this forecast'),
  frictionPoints: z.string().describe('4-6 bullet points, markdown, on forces likely to cause under-performance'),
  tacticalRoadmap: z.string().describe('Numbered steps, markdown, ordered by expected ARR impact, each with owner role and timing relative to GA'),
  risks: z.string().describe('Markdown table or list: risk, likelihood, ARR impact, mitigation'),
});

export interface ForecastGenerationResult {
  assumptions: Array<{
    key: string;
    label: string;
    value_bear: string;
    value_base: string;
    value_bull: string;
    confidence: 'confirmed' | 'hypothesis' | 'low_confidence';
    source_note: string | null;
  }>;
  periods: ReturnType<typeof computeForecastPeriods>;
  narrative: Array<{ section: 'why_we_believe' | 'friction_points' | 'tactical_roadmap' | 'risks'; content: string }>;
}

export async function runForecastGeneration(input: ForecastGenerationInput): Promise<ForecastGenerationResult> {
  const model = resolveModel();

  const { object: research } = await generateObject({
    model,
    schema: ResearchSchema,
    prompt: `
You are the Market Research + Competitive Analysis agent for a ClearCompany (HR tech SaaS,
100-5,000 employee customers) product revenue forecast.

Product: ${input.productName}
Description: ${input.productDescription}
${input.pricingNotes ? `Pricing notes: ${input.pricingNotes}` : ''}

Estimate TAM, the eligible cross-sell/adoption pool, 3-year penetration, cross-sell vs net-new
split, competitor pricing, and a churn-protection estimate (named/estimated at-risk ARR this
product would protect, and what fraction of it gets retained over 3 years). Bear/base/bull should
be meaningfully different, not the same number three times. Mark every estimate's confidence
honestly — most of this should be "hypothesis" unless you have a genuinely strong, specific basis.
`.trim(),
  });

  let acv: { bear: number; base: number; bull: number };
  let acvSourceNote: string;
  try {
    const packageKey = input.packageKeyGuess ?? 'clearrecruit';
    const employees = input.employeesGuess ?? 300;
    const price = await getPackagePrice({ packageKey, employees, termMonths: 24 });
    acv = { bear: price.listPriceUsd * 0.8, base: price.discountedPriceUsd, bull: price.listPriceUsd };
    acvSourceNote = `Pricing sheet: ${packageKey} @ ${employees} employees`;
  } catch {
    // Pricing sheet not configured yet (see src/lib/pricing) — fall back to a research-based
    // hypothesis rather than blocking generation entirely.
    const median = research.competitorPricing.length
      ? research.competitorPricing.reduce((s, c) => s + c.annualPriceUsd, 0) / research.competitorPricing.length
      : 6000;
    acv = { bear: median * 0.6, base: median * 0.75, bull: median };
    acvSourceNote = 'HYPOTHESIS — pricing sheet not yet configured; estimated from competitor pricing at a platform discount';
  }

  const rampProfile = { bear: AI_NOTETAKER_BASELINE_RAMP, base: AI_NOTETAKER_BASELINE_RAMP, bull: AI_NOTETAKER_BASELINE_RAMP };

  const gaDate = input.gaDate ? new Date(input.gaDate) : new Date();
  const horizonMonths = 36;

  const engineInput: VolumeEngineInput = {
    gaDate,
    horizonMonths,
    eligiblePool: research.eligiblePool,
    threeYearPenetration: research.threeYearPenetration,
    acv,
    crossSellShare: research.crossSellShare,
    rampProfile,
    churnAtRiskArrUsd: research.churnAtRiskArrUsd,
    churnProtectionRate: research.churnProtectionRate,
  };
  const periods = computeForecastPeriods(engineInput);

  const { object: narrative } = await generateObject({
    model,
    schema: NarrativeSchema,
    prompt: `
Write the narrative sections for ${input.productName}'s revenue forecast (ClearCompany HR tech
SaaS). Base-case 3-year eligible pool: ${research.eligiblePool.base}, penetration:
${(research.threeYearPenetration.base * 100).toFixed(0)}%, ACV: $${Math.round(acv.base)}.
Competitor pricing: ${research.competitorPricing.map((c) => `${c.name} $${c.annualPriceUsd}/yr`).join(', ') || 'none identified'}.
Churn protection: $${Math.round(research.churnAtRiskArrUsd.base)} at-risk ARR, ${(research.churnProtectionRate.base * 100).toFixed(0)}% protection target.
`.trim(),
  });

  return {
    assumptions: [
      {
        key: 'ga_date',
        label: 'Start date (GA)',
        value_bear: input.gaDate ?? 'TBD',
        value_base: input.gaDate ?? 'TBD',
        value_bull: input.gaDate ?? 'TBD',
        confidence: input.gaDate ? 'confirmed' : 'low_confidence',
        source_note: 'ClearGo epic scheduled GA date',
      },
      {
        key: 'eligible_pool',
        label: 'Eligible pool',
        value_bear: String(Math.round(research.eligiblePool.bear)),
        value_base: String(Math.round(research.eligiblePool.base)),
        value_bull: String(Math.round(research.eligiblePool.bull)),
        confidence: research.tam.confidence,
        source_note: research.tam.basis,
      },
      {
        key: 'three_year_penetration',
        label: '3-Year Penetration',
        value_bear: `${(research.threeYearPenetration.bear * 100).toFixed(0)}%`,
        value_base: `${(research.threeYearPenetration.base * 100).toFixed(0)}%`,
        value_bull: `${(research.threeYearPenetration.bull * 100).toFixed(0)}%`,
        confidence: 'hypothesis',
        source_note: null,
      },
      {
        key: 'acv',
        label: 'ACV',
        value_bear: `$${Math.round(acv.bear).toLocaleString()}`,
        value_base: `$${Math.round(acv.base).toLocaleString()}`,
        value_bull: `$${Math.round(acv.bull).toLocaleString()}`,
        confidence: acvSourceNote.startsWith('HYPOTHESIS') ? 'hypothesis' : 'confirmed',
        source_note: acvSourceNote,
      },
      {
        key: 'ramp_profile',
        label: 'Ramp speed',
        value_bear: rampProfile.bear.name,
        value_base: rampProfile.base.name,
        value_bull: rampProfile.bull.name,
        confidence: 'hypothesis',
        source_note: 'Calibrated against AI Notetaker actuals per FORECASTING-SKILL.md Step 2',
      },
      {
        key: 'churn_at_risk_arr',
        label: 'Churn — at-risk ARR pool',
        value_bear: `$${Math.round(research.churnAtRiskArrUsd.bear).toLocaleString()}`,
        value_base: `$${Math.round(research.churnAtRiskArrUsd.base).toLocaleString()}`,
        value_bull: `$${Math.round(research.churnAtRiskArrUsd.bull).toLocaleString()}`,
        confidence: 'hypothesis',
        source_note: null,
      },
      {
        key: 'churn_protection_rate',
        label: 'Churn — protection rate',
        value_bear: `${(research.churnProtectionRate.bear * 100).toFixed(0)}%`,
        value_base: `${(research.churnProtectionRate.base * 100).toFixed(0)}%`,
        value_bull: `${(research.churnProtectionRate.bull * 100).toFixed(0)}%`,
        confidence: 'hypothesis',
        source_note: null,
      },
    ],
    periods,
    narrative: [
      { section: 'why_we_believe', content: narrative.whyWeBelieve },
      { section: 'friction_points', content: narrative.frictionPoints },
      { section: 'tactical_roadmap', content: narrative.tacticalRoadmap },
      { section: 'risks', content: narrative.risks },
    ],
  };
}
