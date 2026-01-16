import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateSuccessMetricDTO } from '@/lib/success/types';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { description } = await req.json();
    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    // Check OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const prompt = `You are helping to create a success metric for a product launch. Parse the following user description and extract structured information.

USER DESCRIPTION:
"${description}"

Extract the following information:
1. **name**: A concise metric name (e.g., "Feature Adoption Rate", "Time to First Value")
2. **category**: One of: ADOPTION, REVENUE, RETENTION, ENABLEMENT, FRICTION
3. **description**: A clear description of what this metric measures (can be the user's description or a refined version)
4. **measurement_type**: One of: PERCENTAGE, COUNT, DURATION, BOOLEAN
   - PERCENTAGE: For rates, percentages, ratios (e.g., "50% of users", "adoption rate")
   - COUNT: For absolute numbers (e.g., "number of users", "total events")
   - DURATION: For time-based metrics (e.g., "time to first value", "days to complete")
   - BOOLEAN: For yes/no metrics (e.g., "has completed onboarding", "is activated")
5. **source**: One of: PENDO, SNOWFLAKE, MANUAL
   - PENDO: If the user mentions Pendo, events, or product analytics
   - SNOWFLAKE: If the user mentions Snowflake, data warehouse, or SQL
   - MANUAL: If they mention manual entry or don't specify
6. **pendo_event_id**: If source is PENDO and the user mentions a specific event ID, extract it. Otherwise null.
7. **leading_or_lagging**: One of: LEADING, LAGGING
   - LEADING: Predictive indicators (e.g., "sign-ups", "trials started")
   - LAGGING: Outcome indicators (e.g., "revenue", "retention", "churn")
8. **thresholds**: Object with TIER_1, TIER_2, TIER_3, each containing optional min, max, target values
   - Extract any mentioned thresholds, targets, or goals
   - If user mentions "tier 1 should be X", "tier 2 should be Y", etc., map accordingly
   - If user mentions a single target/goal, apply it to TIER_1 target
   - If no thresholds mentioned, return empty objects

Return ONLY a valid JSON object matching this structure:
{
  "name": "string",
  "category": "ADOPTION" | "REVENUE" | "RETENTION" | "ENABLEMENT" | "FRICTION",
  "description": "string",
  "measurement_type": "PERCENTAGE" | "COUNT" | "DURATION" | "BOOLEAN",
  "source": "PENDO" | "SNOWFLAKE" | "MANUAL",
  "pendo_event_id": "string | null",
  "leading_or_lagging": "LEADING" | "LAGGING",
  "thresholds": {
    "TIER_1": { "min": number | undefined, "max": number | undefined, "target": number | undefined },
    "TIER_2": { "min": number | undefined, "max": number | undefined, "target": number | undefined },
    "TIER_3": { "min": number | undefined, "max": number | undefined, "target": number | undefined }
  }
}

Return ONLY the JSON object, no other text or markdown formatting.`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that parses natural language descriptions into structured metric configurations. Always return valid JSON objects.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error('OpenAI API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to parse description with AI' },
        { status: 500 }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No content returned from AI' },
        { status: 500 }
      );
    }

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    // Normalize thresholds: support both old tiered shape and new global shape
    let normalizedThresholds: CreateSuccessMetricDTO['thresholds'] = null;
    if (parsed.thresholds) {
      const t = parsed.thresholds;
      if (t.TIER_1 || t.TIER_2 || t.TIER_3) {
        const tier1 = t.TIER_1 || {};
        normalizedThresholds = {
          min: tier1.min,
          max: tier1.max,
          target: tier1.target,
        };
      } else {
        normalizedThresholds = t;
      }
    }

    // Validate and normalize the response
    const result: Partial<CreateSuccessMetricDTO> = {
      name: parsed.name || 'Untitled Metric',
      category: parsed.category || 'ADOPTION',
      description: parsed.description || description,
      measurement_type: parsed.measurement_type || 'PERCENTAGE',
      source: parsed.source || 'MANUAL',
      pendo_event_id: parsed.pendo_event_id || null,
      leading_or_lagging: parsed.leading_or_lagging || 'LAGGING',
      thresholds: normalizedThresholds,
    };

    return NextResponse.json({ metric: result });
  } catch (error: any) {
    console.error('Error parsing metric description:', error);
    return NextResponse.json(
      { error: 'Failed to parse description', details: error.message },
      { status: 500 }
    );
  }
}

