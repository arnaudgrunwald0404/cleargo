"use client";

import { usePathname } from "next/navigation";

const SETTINGS_PATHS = ["/admin/settings", "/settings/"];

function isSettingsPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return SETTINGS_PATHS.some((p) => pathname.startsWith(p));
}

export function TableScopeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const scope = isSettingsPath(pathname) ? "settings" : "app";
  return <div data-table-scope={scope}>{children}</div>;
}
