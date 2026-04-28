'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/**
 * Stack-based slideout system, ported from Roadmap Rewind Visualizer (RRV).
 *
 * RRV's `SlideoutContext` lets the user drill down (push) and pop back
 * without losing parent context. We render it with Mantine `Drawer` for
 * visual parity with the rest of ClearGo.
 *
 * Each entry is a `{ kind, title, render }` so the context doesn't have
 * to know about every view type — consumers register their own renderers.
 */

export interface SlideoutEntry {
  /** Stable identity used as React key (defaults to `${kind}-${index}`). */
  id?: string;
  /** Display title rendered in the drawer header. */
  title: ReactNode;
  /** Optional sub-title rendered under the title (smaller, dimmed). */
  description?: ReactNode;
  /** Render fn for the drawer body. */
  render: () => ReactNode;
}

interface SlideoutContextValue {
  stack: SlideoutEntry[];
  isOpen: boolean;
  push: (entry: SlideoutEntry) => void;
  /** Replace the current top of the stack (no animation). */
  replace: (entry: SlideoutEntry) => void;
  /** Pop the top entry (or close if it's the only one). */
  pop: () => void;
  /** Close everything. */
  close: () => void;
}

const SlideoutContext = createContext<SlideoutContextValue | null>(null);

export function SlideoutProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SlideoutEntry[]>([]);

  const push = useCallback((entry: SlideoutEntry) => {
    setStack((prev) => [...prev, entry]);
  }, []);

  const replace = useCallback((entry: SlideoutEntry) => {
    setStack((prev) => (prev.length === 0 ? [entry] : [...prev.slice(0, -1), entry]));
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const close = useCallback(() => {
    setStack([]);
  }, []);

  const value = useMemo<SlideoutContextValue>(
    () => ({ stack, isOpen: stack.length > 0, push, replace, pop, close }),
    [stack, push, replace, pop, close],
  );

  return <SlideoutContext.Provider value={value}>{children}</SlideoutContext.Provider>;
}

export function useSlideout(): SlideoutContextValue {
  const ctx = useContext(SlideoutContext);
  if (!ctx) {
    throw new Error('useSlideout must be used inside <SlideoutProvider>');
  }
  return ctx;
}
