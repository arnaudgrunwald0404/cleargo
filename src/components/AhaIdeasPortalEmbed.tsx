"use client";

import { useEffect, useRef } from "react";
import { Box } from "@mantine/core";
import {
  AHA_IDEAS_EMBEDDED_SCRIPT_SRC,
  getAhaIdeasPortalUrl,
} from "@/lib/aha/ideasPortal";

const SCRIPT_ID = "aha-ideas-portal-embedded";

export function AhaIdeasPortalEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const portalUrl = getAhaIdeasPortalUrl();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = AHA_IDEAS_EMBEDDED_SCRIPT_SRC;
    script.setAttribute("data-portal-url", portalUrl);

    container.appendChild(script);

    return () => {
      script.remove();
      container.replaceChildren();
    };
  }, [portalUrl]);

  return (
    <Box
      ref={containerRef}
      style={{
        width: "100%",
        minHeight: "min(75vh, 900px)",
      }}
    />
  );
}
