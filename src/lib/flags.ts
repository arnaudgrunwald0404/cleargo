/**
 * Feature flag system for enabling/disabling features.
 * When flags are provided (from Settings > Other Settings), those are used.
 * Otherwise falls back to environment variable NEXT_PUBLIC_FEATURE_FLAGS (comma-separated list).
 */

/** AI pruning suggestion (human-in-the-loop) for criteria; off by default */
export const FEATURE_AI_PRUNING = 'ai_pruning';

/** Meetings page and navigation tab (Google Calendar sync, transcripts, snippets); off by default */
export const FEATURE_MEETINGS = 'meetings';

/** Fourth traffic light "Not Applicable" (neutral to readiness score); gating criteria cannot be NA */
export const FEATURE_NOT_APPLICABLE = 'not_applicable';

/** Roadmap Snapshot / Roadmap Rewind (historical Aha! pivot snapshots from Roadmap Rewind Visualizer merge); off by default */
export const FEATURE_ROADMAP_REWIND = 'roadmap_rewind';

/** All feature flag keys for UI (Settings > Other Settings) */
export const ALL_FEATURE_FLAGS = [
  { key: FEATURE_AI_PRUNING, label: 'AI checklist pruning', description: 'Suggest criteria to prune per epic (human-in-the-loop)' },
  { key: FEATURE_MEETINGS, label: 'Meetings', description: 'Meetings page and tab (Calendar sync, transcripts, snippets)' },
  { key: FEATURE_NOT_APPLICABLE, label: 'Not Applicable Go/No-Go Score', description: 'Fourth traffic light option; neutral to readiness; gating cannot be NA' },
  { key: FEATURE_ROADMAP_REWIND, label: 'Roadmap Rewind', description: 'Roadmap Snapshot & Rewind (weekly Aha! pivot history, confidence, movements)' },
] as const;

export function isEnabled(flag: string, flagsFromSettings?: string[]): boolean {
  if (flagsFromSettings !== undefined && Array.isArray(flagsFromSettings)) {
    return flagsFromSettings.includes(flag);
  }
  const flagsEnv = process.env.NEXT_PUBLIC_FEATURE_FLAGS || '';
  const enabledFlags = flagsEnv.split(',').map(f => f.trim()).filter(Boolean);
  return enabledFlags.includes(flag);
}

