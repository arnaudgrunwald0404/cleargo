"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type AppMode = "release" | "launch";

interface AppModeContextValue {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
}

const AppModeContext = createContext<AppModeContextValue | undefined>(undefined);

const STORAGE_KEY = "cleargo_app_mode";

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [appMode, setAppModeState] = useState<AppMode>("release");

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "launch" || stored === "release") {
        setAppModeState(stored);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const setAppMode = useCallback((mode: AppMode) => {
    setAppModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage not available
    }
  }, []);

  return (
    <AppModeContext.Provider value={{ appMode, setAppMode }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error("useAppMode must be used within an AppModeProvider");
  }
  return ctx;
}
