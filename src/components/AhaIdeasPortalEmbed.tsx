"use client";

/**
 * @deprecated Do not use on /feedback. Aha routes many @clearcompany.com users to
 * https://secure.aha.io/session/new inside the portal iframe; that host sets
 * frame-ancestors 'self' and cannot be embedded. Use Feedback nav (new-tab portal SSO) instead.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mantine/core";
import { PurpleLoader } from "@/components/PurpleLoader";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";
import { getAhaIdeasPortalUrl } from "@/lib/aha/ideasPortal";

type PortalJwtResponse = {
  callbackUrl: string;
};

type EmbedPhase = "boot" | "auth" | "portal";

export function AhaIdeasPortalEmbed() {
  const portalUrl = getAhaIdeasPortalUrl();
  const authFinishedRef = useRef(false);
  const [phase, setPhase] = useState<EmbedPhase>("boot");
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFinishedRef.current = false;

    async function boot() {
      setPhase("boot");
      setIframeSrc(null);

      try {
        const res = await fetchWithRateLimit("/api/integrations/aha/ideas-portal-jwt", {
          credentials: "include",
          maxRetries: 1,
        });

        if (cancelled) return;

        if (res.ok) {
          const { callbackUrl } = (await res.json()) as PortalJwtResponse;
          setIframeSrc(callbackUrl);
          setPhase("auth");
          return;
        }
      } catch {
        // fall through
      }

      if (!cancelled) {
        setIframeSrc(portalUrl);
        setPhase("portal");
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [portalUrl]);

  const finishAuthAndShowPortal = useCallback(() => {
    if (authFinishedRef.current) return;
    authFinishedRef.current = true;
    setIframeSrc(portalUrl);
    setPhase("portal");
  }, [portalUrl]);

  const handleIframeLoad = useCallback(() => {
    if (phase === "auth") {
      window.setTimeout(finishAuthAndShowPortal, 1500);
    }
  }, [phase, finishAuthAndShowPortal]);

  const showLoader = phase === "boot" || !iframeSrc;

  return (
    <Box style={{ width: "100%", minHeight: "min(75vh, 900px)", position: "relative" }}>
      {showLoader ? (
        <div className="flex justify-center py-16">
          <PurpleLoader size="sm" />
        </div>
      ) : null}
      {iframeSrc ? (
        <iframe
          key={phase === "auth" ? "auth" : "portal"}
          src={iframeSrc}
          title="ClearGO ideas portal"
          onLoad={handleIframeLoad}
          style={{
            width: "100%",
            minHeight: "min(75vh, 900px)",
            border: 0,
            display: showLoader ? "none" : "block",
          }}
          allow="fullscreen"
        />
      ) : null}
    </Box>
  );
}
