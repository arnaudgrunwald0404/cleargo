"use client";

import { Title, Text } from "@mantine/core";
import { FEATURE_ROADMAP_REWIND, isEnabled } from "@/lib/flags";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { RoadmapSnapshotView } from "@/components/roadmap/RoadmapSnapshotView";

export default function RoadmapSnapshotPage() {
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
            Roadmap Snapshot
          </Title>
          <Text
            size="lg"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-gray-500)",
              fontSize: "var(--font-size-lg)",
            }}
          >
            This week&apos;s Aha! pivot — every epic with its current release, dates, status, and
            what changed since the prior snapshot.
          </Text>
        </div>

        {!enabled ? (
          <Text style={{ color: "var(--color-gray-700)" }}>
            Enable the &quot;Roadmap Rewind&quot; feature flag under Settings → Other Settings (or{" "}
            <code>NEXT_PUBLIC_FEATURE_FLAGS</code>) to use this page.
          </Text>
        ) : (
          <RoadmapSnapshotView />
        )}
      </div>
    </div>
  );
}
