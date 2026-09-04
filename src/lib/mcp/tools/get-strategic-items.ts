/**
 * Tool: get-strategic-items
 *
 * Strategic roadmap items for a category and period. The enums mirror the ones
 * the HTTP route validates against, so an invalid combination is refused here
 * rather than reaching the RPC.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  category: z.enum(['csm-priority', 'with-goals', 'combined']).describe('Item category'),
  period: z.enum(['last-release', 'quarter', 'year']).describe('Reporting period'),
  asOfDate: z.string().optional().describe('YYYY-MM-DD snapshot date'),
});

export async function getStrategicItems(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { data, error } = await supabase.rpc('get_strategic_items_detail', {
    p_category: parsed.data.category,
    p_period: parsed.data.period,
    as_of_date: parsed.data.asOfDate ?? null,
  } as { p_category: string; p_period: string; as_of_date: string | null });

  if (error) return { error: error.message };
  return { items: data ?? [], count: (data ?? []).length };
}
