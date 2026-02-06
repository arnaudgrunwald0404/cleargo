"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

type MeResponse = {
  user?: { name?: string | null; email?: string | null };
  impersonating?: boolean;
  impersonationStartedAt?: string;
};

function formatDuration(isoStart: string): string {
  const start = new Date(isoStart).getTime();
  const now = Date.now();
  const ms = now - start;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    const m = minutes % 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  if (minutes > 0) return `${minutes}m`;
  return "< 1m";
}

export function ImpersonationBanner() {
  const pathname = usePathname();
  const [data, setData] = useState<MeResponse | null>(null);
  const [duration, setDuration] = useState<string>("");

  const isPublicPage = pathname === "/login" || pathname?.includes("/setup-password");

  useEffect(() => {
    if (isPublicPage) return;
    const fetchMe = async () => {
      try {
        const { fetchWithRateLimit } = await import("@/lib/fetch-with-rate-limit");
        const res = await fetchWithRateLimit("/api/me", { credentials: "include", maxRetries: 1 });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // ignore
      }
    };
    fetchMe();
  }, [isPublicPage]);

  useEffect(() => {
    if (!data?.impersonating || !data.impersonationStartedAt) return;
    const update = () => setDuration(formatDuration(data.impersonationStartedAt!));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [data?.impersonating, data?.impersonationStartedAt]);

  const stopImpersonating = async () => {
    try {
      await fetch("/api/admin/impersonate/stop", { method: "POST", credentials: "include" });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  if (isPublicPage || !data?.impersonating) return null;

  const displayName =
    data.user?.name?.trim() || data.user?.email || "Unknown user";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[1000] flex items-center justify-between gap-4 bg-red-600 px-4 py-2 text-white shadow-lg"
      role="banner"
      aria-label="Impersonation active"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>Impersonating</span>
        <span className="font-semibold">{displayName}</span>
        {data.impersonationStartedAt && (
          <span className="opacity-95">
            ({duration ? `for ${duration}` : "…"})
          </span>
        )}
      </div>
      <Button
        variant="white"
        color="red"
        size="xs"
        leftSection={<IconX size={14} />}
        onClick={stopImpersonating}
        aria-label="Stop impersonating and return to my session"
      >
        Close
      </Button>
    </div>
  );
}
