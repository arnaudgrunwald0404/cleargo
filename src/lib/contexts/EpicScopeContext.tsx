"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type EpicScope = 'all' | 'my';

interface EpicScopeContextType {
  scope: EpicScope;
  setScope: (scope: EpicScope) => void;
  isMyScope: boolean;
}

const EpicScopeContext = createContext<EpicScopeContextType | undefined>(undefined);

const STORAGE_KEY = 'epicScopePreference';

export function EpicScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<EpicScope>('all');

  // Initialize from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'my' || stored === 'all') {
        setScopeState(stored);
      }
    }
  }, []);

  const setScope = (newScope: EpicScope) => {
    setScopeState(newScope);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newScope);
    }
  };

  // Always provide the context, even during initialization
  // This prevents the "must be used within EpicScopeProvider" error
  return (
    <EpicScopeContext.Provider
      value={{
        scope,
        setScope,
        isMyScope: scope === 'my',
      }}
    >
      {children}
    </EpicScopeContext.Provider>
  );
}

export function useEpicScope() {
  const context = useContext(EpicScopeContext);
  if (context === undefined) {
    throw new Error('useEpicScope must be used within an EpicScopeProvider');
  }
  return context;
}

