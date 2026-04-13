/**
 * @anthropic-internal/shared - Feature Flags & Settings Context
 *
 * Generic React context providers for feature flags and application settings.
 * Each app defines its own settings shape; this module provides the plumbing.
 *
 * Extracted from ClearGo's FeatureFlagsContext.tsx and SettingsContext.tsx.
 *
 * Usage:
 *   // 1. Define your settings shape
 *   interface MySettings { theme: 'light' | 'dark'; maxItems: number }
 *
 *   // 2. Create the context
 *   const { SettingsProvider, useSettings } = createSettingsContext<MySettings>({
 *     fetchSettings: () => fetch('/api/settings').then(r => r.json()),
 *     autoSave: (settings) => fetch('/api/settings', {
 *       method: 'PUT',
 *       body: JSON.stringify(settings),
 *     }),
 *   });
 *
 *   // 3. Use in your app
 *   function App() {
 *     return <SettingsProvider><MyComponent /></SettingsProvider>;
 *   }
 */

'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FeatureFlag, SettingsSlice } from '../types';

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

interface FeatureFlagsContextValue {
  flags: FeatureFlag[];
  loading: boolean;
  hasFlag: (name: string) => boolean;
  refetch: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

export interface FeatureFlagsProviderProps {
  /** Async function to fetch feature flags from your API */
  fetchFlags: () => Promise<FeatureFlag[]>;
  /** Paths where flags should NOT be loaded (e.g. ['/login', '/setup']) */
  skipPaths?: string[];
  children: ReactNode;
}

export function FeatureFlagsProvider({ fetchFlags, skipPaths = [], children }: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Skip on certain paths (e.g. login pages)
    if (typeof window !== 'undefined' && skipPaths.some((p) => window.location.pathname.startsWith(p))) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const result = await fetchFlags();
      setFlags(result);
    } catch (err) {
      console.error('[FeatureFlags] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchFlags, skipPaths]);

  useEffect(() => { load(); }, [load]);

  const hasFlag = useCallback(
    (name: string) => flags.some((f) => f.name === name && f.enabled),
    [flags],
  );

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, hasFlag, refetch: load }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  const ctx = useContext(FeatureFlagsContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Generic Settings Context Factory
// ---------------------------------------------------------------------------

interface SettingsContextValue<T> extends SettingsSlice<T> {
  update: (partial: Partial<T>) => void;
  refetch: () => Promise<void>;
  saving: boolean;
}

/**
 * Creates a typed settings context with auto-save support.
 * Returns a Provider component and a hook.
 */
export function createSettingsContext<T extends Record<string, unknown>>(config: {
  /** Fetch current settings from your API */
  fetchSettings: () => Promise<T>;
  /** Auto-save callback (debounced internally). Omit to disable auto-save. */
  autoSave?: (settings: T) => Promise<void>;
  /** Debounce delay in ms for auto-save (default: 1000) */
  autoSaveDelayMs?: number;
}) {
  const Context = createContext<SettingsContextValue<T> | null>(null);

  function SettingsProvider({ children }: { children: ReactNode }) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestDataRef = useRef<T | null>(null);

    const load = useCallback(async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await config.fetchSettings();
        setData(result);
        latestDataRef.current = result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
        console.error('[Settings] Load failed:', err);
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => { load(); }, [load]);

    const update = useCallback(
      (partial: Partial<T>) => {
        setData((prev) => {
          if (!prev) return prev;
          const next = { ...prev, ...partial };
          latestDataRef.current = next;

          // Debounced auto-save
          if (config.autoSave) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(async () => {
              const toSave = latestDataRef.current;
              if (!toSave) return;
              try {
                setSaving(true);
                await config.autoSave!(toSave);
              } catch (err) {
                console.error('[Settings] Auto-save failed:', err);
                setError(err instanceof Error ? err.message : 'Failed to save settings');
              } finally {
                setSaving(false);
              }
            }, config.autoSaveDelayMs ?? 1000);
          }

          return next;
        });
      },
      [],
    );

    return (
      <Context.Provider value={{ data, loading, error, saving, update, refetch: load }}>
        {children}
      </Context.Provider>
    );
  }

  function useSettings(): SettingsContextValue<T> {
    const ctx = useContext(Context);
    if (!ctx) throw new Error('useSettings must be used within its SettingsProvider');
    return ctx;
  }

  return { SettingsProvider, useSettings };
}
