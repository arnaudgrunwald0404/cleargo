export type TierThresholds = { tier1: number; tier2: number; tier3: number };

function numFromEnv(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const defaults = {
  thresholds: {
    tier1: 0.9,
    tier2: 0.8,
    tier3: 0.7,
  } as TierThresholds,
  stalenessDays: 14,
  timezone: process.env.COMPANY_TIMEZONE || "America/New_York",
  digestSchedule: process.env.DIGEST_SCHEDULE || "MON_09_00",
  allowlistDomains: (process.env.ALLOWLIST_DOMAINS || "clearcompany.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  fallbackProductOpsEmail:
    process.env.FALLBACK_PRODUCT_OPS_EMAIL || "agrunwald@clearcompany.com",
  emailSender: process.env.EMAIL_SENDER || "noreply@tacticalsync.com",
};

export function getThresholds(): TierThresholds {
  return {
    tier1: numFromEnv("THRESHOLD_TIER1", defaults.thresholds.tier1),
    tier2: numFromEnv("THRESHOLD_TIER2", defaults.thresholds.tier2),
    tier3: numFromEnv("THRESHOLD_TIER3", defaults.thresholds.tier3),
  };
}

export function getStalenessDays(): number {
  return numFromEnv("STALENESS_DAYS", defaults.stalenessDays);
}
