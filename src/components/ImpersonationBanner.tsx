"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Group } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

type MeResponse = {
  user?: {
    name?: string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  impersonating?: boolean;
  impersonationStartedAt?: string;
};

const IMPERSONATION_TTL_MS = 5 * 60 * 1000;

function formatRemaining(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function ImpersonationBanner() {
  const pathname = usePathname();
  const [data, setData] = useState<MeResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const autoStopFiredRef = useRef(false);

  const isPublicPage = pathname === "/login" || pathname?.includes("/setup-password");

  const fetchMe = useCallback(async () => {
    try {
      const { fetchWithRateLimit } = await import("@/lib/fetch-with-rate-limit");
      const res = await fetchWithRateLimit("/api/me", { credentials: "include", maxRetries: 1 });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        return json as MeResponse;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  useEffect(() => {
    if (isPublicPage) return;
    void fetchMe();
  }, [isPublicPage, fetchMe]);

  useEffect(() => {
    autoStopFiredRef.current = false;
  }, [data?.impersonationStartedAt]);

  const stopImpersonating = useCallback(async () => {
    try {
      await fetch("/api/admin/impersonate/stop", { method: "POST", credentials: "include" });
    } catch {
      // still reload
    }
    window.location.reload();
  }, []);

  useLayoutEffect(() => {
    if (isPublicPage || !data?.impersonating || !data.impersonationStartedAt) return;

    const expiresAt =
      new Date(data.impersonationStartedAt).getTime() + IMPERSONATION_TTL_MS;

    const tick = () => {
      const sec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(sec);
      if (sec <= 0 && !autoStopFiredRef.current) {
        autoStopFiredRef.current = true;
        void (async () => {
          try {
            await fetch("/api/admin/impersonate/stop", {
              method: "POST",
              credentials: "include",
            });
          } catch {
            // ignore
          }
          window.location.reload();
        })();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isPublicPage, data?.impersonating, data?.impersonationStartedAt]);

  const extendSession = async () => {
    const res = await fetch("/api/admin/impersonate/extend", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return;
    await fetchMe();
  };

  if (isPublicPage || !data?.impersonating) return null;

  const displayName =
    data.user?.name?.trim() ||
    [data.user?.first_name, data.user?.last_name].filter(Boolean).join(" ").trim() ||
    data.user?.email ||
    "Unknown user";
  const displayEmail = data.user?.email?.trim() || "";

  let backgroundColor = "#14532d";
  if (secondsLeft <= 30) {
    backgroundColor = "#dc2626";
  } else if (secondsLeft <= 60) {
    backgroundColor = "#ea580c";
  }

  const showExtend = secondsLeft <= 30 && secondsLeft > 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[1000] flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-white shadow-lg"
      style={{ backgroundColor }}
      role="banner"
      aria-label="Impersonation active"
    >
      <div className="min-w-0 flex-1 text-sm font-medium">
        <span>Impersonating </span>
        <span className="font-semibold">{displayName}</span>
        {displayEmail ? (
          <span className="opacity-95">
            {" "}
            ({displayEmail}) — {formatRemaining(secondsLeft)} remaining
          </span>
        ) : (
          <span className="opacity-95">
            {" "}
            — {formatRemaining(secondsLeft)} remaining
          </span>
        )}
      </div>
      <Group gap="xs" wrap="nowrap">
        {showExtend && (
          <Button
            variant="white"
            size="xs"
            onClick={() => void extendSession()}
            aria-label="Extend impersonation by five minutes"
          >
            Extend
          </Button>
        )}
        <Button
          variant="white"
          color="red"
          size="xs"
          leftSection={<IconX size={14} />}
          onClick={() => void stopImpersonating()}
          aria-label="Stop impersonating and return to my session"
        >
          Stop
        </Button>
      </Group>
    </div>
  );
}
