"use client";

import { useEffect, useState } from "react";
import { Title, Text } from "@mantine/core";
import { FeedbackSection } from "@/components/FeedbackSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function FeedbackPage() {
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      setLoadingUser(true);
      try {
        const { fetchWithRateLimit } = await import("@/lib/fetch-with-rate-limit");
        const res = await fetchWithRateLimit("/api/me", { credentials: "include", maxRetries: 1 });
        if (res.ok) {
          const data = await res.json();
          const email = data?.user?.email;
          if (typeof email === "string") setCurrentUserEmail(email);
        }
      } catch (e) {
        // If this fails, the page still renders; delete button will just not show.
        console.warn("Failed to load current user:", e);
      } finally {
        setLoadingUser(false);
      }
    };

    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div
        style={{
          maxWidth: "var(--page-container-max-width)",
          margin: "0 auto",
          paddingLeft: "var(--page-container-padding-x)",
          paddingRight: "var(--page-container-padding-x)",
          paddingTop: "var(--page-container-padding-top)",
          paddingBottom: "var(--spacing-8)",
        }}
        className="sm:px-6 lg:px-8"
      >
        <div className="mb-8">
          <Title
            order={1}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--font-size-page-title)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-gray-900)",
            }}
          >
            Feedback
          </Title>
          <Text size="sm" c="dimmed" mt="xs" style={{ fontFamily: "var(--font-body)" }}>
            Share feedback on epics, the process, or the tool.
          </Text>
        </div>

        {loadingUser ? (
          <div className="flex items-center justify-center py-12">
            <PurpleLoader size="sm" />
          </div>
        ) : (
          <FeedbackSection currentUserEmail={currentUserEmail} />
        )}
      </div>
    </div>
  );
}

