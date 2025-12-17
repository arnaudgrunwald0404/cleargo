import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

async function ensureStore() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(TOKENS_FILE);
  } catch {
    await fs.writeFile(TOKENS_FILE, JSON.stringify({ used: {}, lastSentAt: {} }, null, 2));
  }
}

export async function markTokenUsed(jti: string) {
  await ensureStore();
  const raw = await fs.readFile(TOKENS_FILE, 'utf8');
  const data = JSON.parse(raw) as {
    used: Record<string, boolean>;
    lastSentAt: Record<string, number>;
  };
  data.used[jti] = true;
  await fs.writeFile(TOKENS_FILE, JSON.stringify(data, null, 2));
}

export async function isTokenUsed(jti: string) {
  await ensureStore();
  const raw = await fs.readFile(TOKENS_FILE, 'utf8');
  const data = JSON.parse(raw) as {
    used: Record<string, boolean>;
    lastSentAt: Record<string, number>;
  };
  return Boolean(data.used[jti]);
}

export async function canSendEmail(email: string, cooldownMs = 60000) {
  await ensureStore();
  const raw = await fs.readFile(TOKENS_FILE, 'utf8');
  const data = JSON.parse(raw) as {
    used: Record<string, boolean>;
    lastSentAt: Record<string, number>;
  };
  const last = data.lastSentAt[email] || 0;
  const now = Date.now();
  if (now - last < cooldownMs) return false;
  data.lastSentAt[email] = now;
  await fs.writeFile(TOKENS_FILE, JSON.stringify(data, null, 2));
  return true;
}
