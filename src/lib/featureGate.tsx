import { isEnabled } from './flags';

/**
 * Require that a feature flag is enabled
 * Throws error with status 404 if flag is disabled
 */
export function requireFlag(flag: string): void {
  if (!isEnabled(flag)) {
    const err = new Error('Not Found');
    // @ts-ignore
    err.status = 404;
    throw err;
  }
}

