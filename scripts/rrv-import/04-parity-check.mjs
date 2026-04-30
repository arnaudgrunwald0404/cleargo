#!/usr/bin/env node
/**
 * Spot-check 20 random aha_keys: confirm row counts and most-recent
 * snapshot_date in ClearGo's `roadmap_snapshot` match RRV's `roadmap`.
 *
 * Usage:
 *   RRV_SUPABASE_DB_URL=postgres://… \
 *   CLEARGO_SUPABASE_DB_URL=postgres://… \
 *   node scripts/rrv-import/04-parity-check.mjs
 *
 * Requires: `npm i -D pg` (or use any pg client of your choice).
 * If pg isn't installed, falls back to two `psql -c` invocations.
 */

import { execFileSync } from 'node:child_process';

const RRV = process.env.RRV_SUPABASE_DB_URL;
const CG = process.env.CLEARGO_SUPABASE_DB_URL;
if (!RRV || !CG) {
  console.error('RRV_SUPABASE_DB_URL and CLEARGO_SUPABASE_DB_URL must be set.');
  process.exit(1);
}

const SAMPLE = parseInt(process.env.SAMPLE_SIZE || '20', 10);

function psql(url, sql) {
  return execFileSync('psql', [url, '-At', '-F', '|', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseRows(out) {
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'));
}

console.log(`Sampling ${SAMPLE} random aha_keys from RRV …`);
const sampleSql = `
  SELECT aha_key
  FROM (
    SELECT DISTINCT aha_key FROM public.roadmap WHERE aha_key IS NOT NULL
  ) k
  ORDER BY random()
  LIMIT ${SAMPLE};
`;
const rrvSampleOut = psql(RRV, sampleSql);
const sampleKeys = parseRows(rrvSampleOut).map((r) => r[0]);
if (sampleKeys.length === 0) {
  console.error('No keys returned from RRV — is the RRV DB URL correct?');
  process.exit(1);
}

const ahaKeyList = sampleKeys.map((k) => `'${k.replace(/'/g, "''")}'`).join(',');

const countsSql = (table, dateCol) => `
  SELECT aha_key, COUNT(*) AS n, MAX(${dateCol})::date AS latest
  FROM ${table}
  WHERE aha_key IN (${ahaKeyList})
  GROUP BY aha_key;
`;

console.log('Querying RRV roadmap counts …');
const rrvOut = psql(RRV, countsSql('public.roadmap', 'created_at'));
console.log('Querying ClearGo roadmap_snapshot counts …');
const cgOut = psql(CG, countsSql('public.roadmap_snapshot', 'snapshot_date'));

const rrvByKey = new Map(parseRows(rrvOut).map((r) => [r[0], { n: Number(r[1]), latest: r[2] }]));
const cgByKey = new Map(parseRows(cgOut).map((r) => [r[0], { n: Number(r[1]), latest: r[2] }]));

let mismatches = 0;
console.log('\naha_key                        | rrv_n | cg_n | rrv_latest | cg_latest  | OK');
console.log('-'.repeat(86));
for (const k of sampleKeys) {
  const r = rrvByKey.get(k) ?? { n: 0, latest: '' };
  const c = cgByKey.get(k) ?? { n: 0, latest: '' };
  const ok = r.n === c.n && r.latest === c.latest;
  if (!ok) mismatches++;
  const pad = (s, n) => String(s ?? '').padEnd(n);
  console.log(
    `${pad(k, 30)} | ${pad(r.n, 5)} | ${pad(c.n, 4)} | ${pad(r.latest, 10)} | ${pad(c.latest, 10)} | ${ok ? '✓' : '✗'}`,
  );
}

console.log('-'.repeat(86));
console.log(`Sampled: ${sampleKeys.length}, mismatches: ${mismatches}`);
process.exit(mismatches === 0 ? 0 : 2);
