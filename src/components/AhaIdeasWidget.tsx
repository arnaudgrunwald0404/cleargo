"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Code, Stack, Text } from "@mantine/core";
import { PurpleLoader } from "@/components/PurpleLoader";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";
import {
  destroyAhaIdeasWidget,
  ensureAhaFeedbackLoader,
  loadAhaFeedbackScript,
} from "@/lib/aha/ideasWidget";

type WidgetTokenResponse = {
  jwt: string;
  account: string;
  applicationId: string;
  widgetId: string;
};

type AhaIdeasWidgetProps = {
  /** Open the widget panel after initialize (requires Custom position in Aha admin). */
  autoOpen?: boolean;
};

function openAhaWidget(widgetId: string): void {
  window.aha?.("open", widgetId);
}

function scheduleOpenAttempts(widgetId: string): void {
  const delays = [0, 200, 800, 1500];
  for (const delay of delays) {
    window.setTimeout(() => openAhaWidget(widgetId), delay);
  }
}

export function AhaIdeasWidget({ autoOpen = true }: AhaIdeasWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [initialized, setInitialized] = useState(false);
  const widgetIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const handleOpen = useCallback(() => {
    if (!initialized || !widgetIdRef.current) return;
    scheduleOpenAttempts(widgetIdRef.current);
  }, [initialized]);

  useEffect(() => {
    mountedRef.current = true;
    setPageUrl(typeof window !== "undefined" ? window.location.href : "");

    async function mountWidget() {
      setLoading(true);
      setError(null);
      setInitialized(false);
      widgetIdRef.current = null;

      try {
        const res = await fetchWithRateLimit("/api/integrations/aha/ideas-widget-token", {
          credentials: "include",
          maxRetries: 1,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body?.error === "string" ? body.error : "Unable to load ideas portal"
          );
        }

        const tokenPayload = (await res.json()) as WidgetTokenResponse;
        if (!mountedRef.current) return;

        widgetIdRef.current = tokenPayload.widgetId;

        ensureAhaFeedbackLoader();
        await loadAhaFeedbackScript();
        if (!mountedRef.current) return;

        window.aha?.("initialize", {
          account: tokenPayload.account,
          applicationId: tokenPayload.applicationId,
          jwt: tokenPayload.jwt,
        });

        if (!mountedRef.current) return;
        setInitialized(true);

        if (autoOpen && tokenPayload.widgetId) {
          scheduleOpenAttempts(tokenPayload.widgetId);
        }
      } catch (e) {
        if (!mountedRef.current) return;
        setError(e instanceof Error ? e.message : "Unable to load ideas portal");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    void mountWidget();

    return () => {
      mountedRef.current = false;
      // Defer destroy so React Strict Mode remount does not tear down before `open` runs.
      window.setTimeout(() => {
        if (!mountedRef.current) {
          destroyAhaIdeasWidget();
        }
      }, 100);
    };
  }, [autoOpen]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <PurpleLoader size="sm" />
        <Text size="sm" c="dimmed">
          Loading ideas portal…
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Ideas portal unavailable">
        {error}
      </Alert>
    );
  }

  return (
    <Stack gap="md" maw={560}>
      <Button onClick={handleOpen} disabled={!initialized} size="md">
        Open ideas form
      </Button>

      <Text size="sm" c="dimmed">
        If nothing opens, add this page to the widget&apos;s <strong>Target URLs</strong> in Aha!
        (or use <Code>*</Code>):
      </Text>

      {pageUrl ? (
        <Code block style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
          {pageUrl}
        </Code>
      ) : null}
    </Stack>
  );
}
