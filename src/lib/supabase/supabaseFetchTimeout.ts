/** Default HTTP timeout for Supabase REST (most calls). */
export const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 30_000;

/** Heavy RPCs can exceed 30s on large `roadmap_snapshot` datasets. */
export const LONG_SUPABASE_FETCH_TIMEOUT_MS = 120_000;

const LONG_TIMEOUT_PATH_SUBSTRINGS = ['/rpc/get_period_plan_vs_actual'] as const;

export function supabaseFetchTimeoutMs(urlString: string): number {
  for (const s of LONG_TIMEOUT_PATH_SUBSTRINGS) {
    if (urlString.includes(s)) return LONG_SUPABASE_FETCH_TIMEOUT_MS;
  }
  return DEFAULT_SUPABASE_FETCH_TIMEOUT_MS;
}
