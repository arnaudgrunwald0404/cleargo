"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";

type FeatureFlagsContextType = {
  flags: string[];
  loading: boolean;
  refetch: () => Promise<void>;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

function isPublicPage(pathname: string | null) {
  return pathname === "/login" || (pathname?.startsWith("/setup-password") ?? false);
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [flags, setFlags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = React.useCallback(async () => {
    try {
      const res = await fetch("/api/settings/feature-flags", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setFlags(Array.isArray(data.flags) ? data.flags : []);
      } else {
        setFlags([]);
      }
    } catch {
      setFlags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPublicPage(pathname)) {
      setFlags([]);
      setLoading(false);
      return;
    }
    fetchFlags();
  }, [pathname, fetchFlags]);

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, refetch: fetchFlags }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagsContextType {
  const ctx = useContext(FeatureFlagsContext);
  if (ctx === undefined) {
    return {
      flags: [],
      loading: false,
      refetch: async () => {},
    };
  }
  return ctx;
}
