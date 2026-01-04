/**
 * Feature flag system for enabling/disabling features
 * Checks environment variable NEXT_PUBLIC_FEATURE_FLAGS (comma-separated list)
 * or returns false by default
 */
export function isEnabled(flag: string): boolean {
  if (typeof window === 'undefined') {
    // Server-side: check environment variable
    const flagsEnv = process.env.NEXT_PUBLIC_FEATURE_FLAGS || '';
    const enabledFlags = flagsEnv.split(',').map(f => f.trim()).filter(Boolean);
    return enabledFlags.includes(flag);
  } else {
    // Client-side: check from window or localStorage
    const flagsEnv = process.env.NEXT_PUBLIC_FEATURE_FLAGS || '';
    const enabledFlags = flagsEnv.split(',').map(f => f.trim()).filter(Boolean);
    return enabledFlags.includes(flag);
  }
}

