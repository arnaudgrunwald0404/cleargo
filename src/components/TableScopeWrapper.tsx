"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SETTINGS_PATHS = ["/admin/settings", "/settings/"];

function isSettingsPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return SETTINGS_PATHS.some((p) => pathname.startsWith(p));
}

export function TableScopeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Default to "app" so server and initial client render always match,
  // then update after mount when pathname is available.
  const [scope, setScope] = useState<"app" | "settings">("app");

  useEffect(() => {
    setScope(isSettingsPath(pathname) ? "settings" : "app");
  }, [pathname]);

  return <div data-table-scope={scope}>{children}</div>;
}
