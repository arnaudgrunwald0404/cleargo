import { createClient } from '@/lib/supabase/server';
import { Criterion } from '@/types/criteria';

export async function listCriteria(): Promise<Criterion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('criterion')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (error) throw error;
  return data || [];
}

export type CreateCriterionInput = Omit<Criterion, 'id' | 'created_at' | 'updated_at'>;
export async function createCriteria(input: CreateCriterionInput): Promise<Criterion> {
  const supabase = createClient();
  const { data, error } = await supabase.from('criterion').insert(input).select().single();

  if (error) throw error;
  return data;
}

export type UpdateCriterionInput = Partial<Omit<Criterion, 'id' | 'created_at'>>;
export async function updateCriteria(
  id: string,
  patch: UpdateCriterionInput
): Promise<Criterion | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('criterion')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // Surface errors so API routes can return useful messages
    throw error;
  }
  return data;
}

export async function deleteCriteria(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('criterion').delete().eq('id', id);
  return !error;
}

export async function getCriteria(id: string): Promise<Criterion | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('criterion').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

export async function upsertCriteriaBatch(
  criteria: CreateCriterionInput[]
): Promise<{ created: number; updated: number; errors: any[] }> {
  const supabase = createClient();

  // 1. Fetch existing criteria to match by label
  const { data: existing, error: fetchError } = await supabase
    .from('criterion')
    .select('id, label');

  if (fetchError) throw fetchError;

  const existingMap = new Map(existing?.map((c) => [c.label.toLowerCase().trim(), c.id]));

  let created = 0;
  let updated = 0;
  const errors: any[] = [];

  for (const item of criteria) {
    try {
      const normalizedLabel = item.label.toLowerCase().trim();
      const existingId = existingMap.get(normalizedLabel);

      if (existingId) {
        // Update
        const { error } = await supabase
          .from('criterion')
          .update({ ...item, updated_at: new Date().toISOString() })
          .eq('id', existingId);
        if (error) {
          console.error(`[upsertCriteriaBatch] Update error for "${item.label}":`, error);
          throw error;
        }
        updated++;
      } else {
        // Create
        const { error } = await supabase.from('criterion').insert(item);
        if (error) {
          console.error(`[upsertCriteriaBatch] Insert error for "${item.label}":`, error);
          throw error;
        }
        created++;
      }
    } catch (e: any) {
      const errorMessage = e?.message || String(e);
      console.error(`[upsertCriteriaBatch] Error processing "${item.label}":`, errorMessage);
      errors.push({ item: item.label, error: errorMessage });
    }
  }

  return { created, updated, errors };
}
