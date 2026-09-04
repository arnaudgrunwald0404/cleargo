/**
 * Tool: get-success-metrics
 *
 * The success plan for an epic: what the team said they would measure, and the
 * latest values.
 *
 * Carries one rule that lives only in the HTTP route and nowhere in the service:
 * until a config is published, its metrics are visible ONLY to people who can
 * configure success measurement. Skipping that check here would make the
 * connector leak drafts the UI deliberately hides -- the kind of divergence that
 * is invisible until someone quotes an unpublished target back to a stakeholder.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { actorCan } from '@/lib/permissions-server';
import {
  getEpicSuccessConfig,
  getEpicSuccessMetrics,
} from '@/lib/services/successMeasurementService';

export const InputSchema = z.object({
  epicId: z.string().describe('The epic UUID'),
});

export async function getSuccessMetrics(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const config = await getEpicSuccessConfig(parsed.data.epicId, supabase);
  if (!config) {
    return { epicId: parsed.data.epicId, config: null, metrics: [], count: 0 };
  }

  const published = config.success_metrics_published_at != null;
  const canConfigure = await actorCan(actor, 'settings.successMeasurement.update', supabase);

  if (!published && !canConfigure) {
    return {
      epicId: parsed.data.epicId,
      config: { published: false, lockedAt: config.locked_at ?? null },
      metrics: [],
      count: 0,
      // Said out loud rather than returned as an empty list, so a caller does
      // not report "no success metrics" when the truth is "not yet published".
      note: 'This success plan is not published yet, so its metrics are hidden from you. They are not absent.',
    };
  }

  const metrics = await getEpicSuccessMetrics(parsed.data.epicId, supabase);

  return {
    epicId: parsed.data.epicId,
    config: {
      published,
      publishedAt: config.success_metrics_published_at ?? null,
      lockedAt: config.locked_at ?? null,
    },
    metrics,
    count: metrics.length,
  };
}
