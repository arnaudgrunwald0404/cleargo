/**
 * One-time migration extraction: reads a Chrysalis-repo forecast.md + assumptions.md pair
 * and extracts structured forecast_assumptions / forecast_periods / forecast_narrative rows.
 *
 * The source documents are dense, narrative, and carry real judgment calls (e.g. the 0.547
 * eligible-base correction ratio in several products) — this extraction is a best-effort
 * structuring pass for the interactive UI, not the record of truth. The raw markdown is
 * always archived verbatim alongside it (see scripts/migrate-chrysalis-forecasts.ts), so
 * nothing is lost if a value here needs correcting later.
 *
 * Mirrors the generateObject pattern in src/lib/ai/client.ts.
 */

import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

const model = google('gemini-3.1-pro-preview');

const ConfidenceEnum = z.enum(['confirmed', 'hypothesis', 'low_confidence']);
const ScenarioEnum = z.enum(['bear', 'base', 'bull']);
const NarrativeSectionEnum = z.enum([
  'why_we_believe',
  'friction_points',
  'tactical_roadmap',
  'risks',
  'methodology_notes',
]);

const ExtractedForecastSchema = z.object({
  assumptions: z
    .array(
      z.object({
        key: z.string().describe('short snake_case identifier, e.g. account_penetration_y1'),
        label: z.string().describe('human-readable label, e.g. "Account Penetration — Year 1"'),
        valueBear: z.string().nullable(),
        valueBase: z.string().nullable(),
        valueBull: z.string().nullable(),
        confidence: ConfidenceEnum,
        sourceNote: z.string().nullable().describe('citation/provenance if stated, e.g. "Matt Yang, Sales, Slack, 2026-07-11"'),
      })
    )
    .describe(
      'Every named assumption from the Key Assumptions / Assumptions Quick Reference section(s), ordered by sensitivity to Year 1 new bookings (start date, penetration, ACV, ramp, eligible pool, then everything else).'
    ),
  periods: z
    .array(
      z.object({
        scenario: ScenarioEnum,
        periodType: z.enum(['year', 'quarter']),
        periodLabel: z.string().describe('e.g. "2027" or "Q2 2027"'),
        crossSellArrUsd: z.number().int(),
        netNewArrUsd: z.number().int(),
        churnReductionArrUsd: z
          .number()
          .int()
          .describe('Protected ARR for this period, if the document tracks it. This is a separate track from bookings — do not add it into totalArrUsd.'),
        totalArrUsd: z
          .number()
          .int()
          .describe('crossSellArrUsd + netNewArrUsd for this period — the new-bookings total. Must NOT include churnReductionArrUsd.'),
      })
    )
    .describe(
      'Annual figures (required, one row per scenario per year in the forecast horizon) plus quarterly figures when a clean quarterly table exists. Do NOT attempt to extract monthly detail tables — those stay in the archived raw markdown only. Whole USD, not thousands — "$268K" becomes 268000.'
    ),
  narrative: z
    .array(
      z.object({
        section: NarrativeSectionEnum,
        content: z.string().describe('markdown, verbatim or lightly cleaned from the source section'),
      })
    )
    .describe('One entry per section found: Why We Believe This, Friction Points, Tactical Roadmap, Risks, and Methodology Notes (if present).'),
  headlineCheck: z.object({
    threeYearBaseTotalUsd: z
      .number()
      .int()
      .describe(
        'The base-case 3-Year NEW BOOKINGS total specifically — i.e. cross-sell + net new revenue upside, matching the figure in a table titled something like "New Bookings" or "3-Year New Bookings" or "Revenue Upside". Do NOT use a "Combined Value", "Total Value", or any figure that adds Protected ARR / churn reduction on top of bookings — those are a separate track. This is a sanity-check value cross-referenced against CONSOLIDATED.md\'s Revenue Upside Summary table, which is bookings-only.'
      ),
  }),
});

export type ExtractedForecast = z.infer<typeof ExtractedForecastSchema>;

export async function extractForecastFromMarkdown(args: {
  productSlug: string;
  forecastMd: string;
  assumptionsMd: string;
}): Promise<ExtractedForecast> {
  const { productSlug, forecastMd, assumptionsMd } = args;

  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required for forecast migration extraction');
  }

  const { object } = await generateObject({
    model,
    schema: ExtractedForecastSchema,
    prompt: `
You are migrating a ClearCompany product revenue forecast from a hand-written markdown document
into a structured schema for an in-app forecast tool. Extract faithfully — do not invent numbers,
round differently than the source, or resolve inconsistencies the source itself flags as open
(carry the source's own stated figures through, including any "corrected"/"revised" values which
supersede earlier ones in the same document).

Product: ${productSlug}

=== forecast.md ===
${forecastMd}

=== assumptions.md ===
${assumptionsMd}
`.trim(),
  });

  return object;
}
