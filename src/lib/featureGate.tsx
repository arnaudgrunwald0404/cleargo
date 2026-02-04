import { isEnabled } from './flags';

/**
 * Require that a feature flag is enabled.
 * Pass flags from getFeatureFlags() when calling from server/API so settings are respected.
 * Throws error with status 404 if flag is disabled.
 */
export function requireFlag(flag: string, flagsFromSettings?: string[]): void {
  if (!isEnabled(flag, flagsFromSettings)) {
    const err = new Error('Not Found');
    // @ts-ignore
    err.status = 404;
    throw err;
  }
}

