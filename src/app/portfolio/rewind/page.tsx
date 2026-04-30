"use client";

import { Title, Text } from "@mantine/core";
import { FEATURE_ROADMAP_REWIND, isEnabled } from "@/lib/flags";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { RoadmapRewindView } from "@/components/roadmap/RoadmapRewindView";

export default function RoadmapRewindPage() {
  const { flags } = useFeatureFlags();
  const enabled = isEnabled(FEATURE_ROADMAP_REWIND, flags);

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        fontFamily: "var(--font-body)",
        backgroundColor: "var(--color-platinum)",
      }}
    >
      <div
        style={{
          maxWidth: "var(--page-container-max-width)",
          margin: "0 auto",
          paddingLeft: "var(--page-container-padding-x)",
          paddingRight: "var(--page-container-padding-x)",
          paddingTop: "var(--page-container-padding-top)",
        }}
        className="sm:px-6 lg:px-8"
      >
        <div className="mb-6">
          <Title
            order={1}
            style={{
              fontFamily: "var(--font-marcellus), serif",
              color: "var(--color-gray-900)",
              fontSize: "var(--font-size-4xl)",
              fontWeight: "var(--font-weight-bold)",
              marginBottom: 4,
            }}
          >
            Roadmap Rewind
          </Title>
          <Text
            size="lg"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-gray-500)",
              fontSize: "var(--font-size-lg)",
            }}
          >
            Release movement analytics and weekly heatmap (ported from RRV Performance Insights).
          </Text>
        </div>

        {!enabled ? (
          <Text style={{ color: "var(--color-gray-700)" }}>
            Enable the &quot;Roadmap Rewind&quot; feature flag under Settings → Other Settings (or{" "}
            <code>NEXT_PUBLIC_FEATURE_FLAGS</code>) to use this page.
          </Text>
        ) : (
          <RoadmapRewindView />
        )}
      </div>
    </div>
  );
}
