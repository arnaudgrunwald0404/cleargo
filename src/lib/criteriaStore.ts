import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Criterion } from '@/types/criteria';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'criteria.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify({ items: [] as Criterion[] }, null, 2));
  }
}

async function readAll(): Promise<Criterion[]> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, 'utf8');
  const data = JSON.parse(raw) as { items: Criterion[] };
  return data.items;
}

async function writeAll(items: Criterion[]) {
  await ensureStore();
  await fs.writeFile(STORE_FILE, JSON.stringify({ items }, null, 2));
}

export async function listCriteria(): Promise<Criterion[]> {
  const items = await readAll();
  return items.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export type CreateCriterionInput = Omit<Criterion, 'id' | 'created_at' | 'updated_at'>;
export async function createCriterion(input: CreateCriterionInput): Promise<Criterion> {
  const now = new Date().toISOString();
  const item: Criterion = { id: randomUUID(), created_at: now, updated_at: now, ...input };
  const items = await readAll();
  items.push(item);
  await writeAll(items);
  return item;
}

export type UpdateCriterionInput = Partial<Omit<Criterion, 'id' | 'created_at'>>;
export async function updateCriterion(
  id: string,
  patch: UpdateCriterionInput
): Promise<Criterion | null> {
  const items = await readAll();
  const idx = items.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const updated: Criterion = { ...items[idx], ...patch, updated_at: new Date().toISOString() };
  items[idx] = updated;
  await writeAll(items);
  return updated;
}
