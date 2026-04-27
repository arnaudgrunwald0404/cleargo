"use client";

import { Container, Title, Text, Stack } from "@mantine/core";
import { FEATURE_ROADMAP_REWIND, isEnabled } from "@/lib/flags";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { RoadmapRewindView } from "@/components/roadmap/RoadmapRewindView";

export default function RoadmapRewindPage() {
  const { flags } = useFeatureFlags();
  const enabled = isEnabled(FEATURE_ROADMAP_REWIND, flags);

  return (
    <Container py="xl" size="xl">
      <Title order={2}>Roadmap Rewind</Title>
      {!enabled ? (
        <Text mt="sm" c="dimmed">
          Enable the &quot;Roadmap Rewind&quot; feature flag under Settings → Other Settings (or{" "}
          <code>NEXT_PUBLIC_FEATURE_FLAGS</code>) to use this page.
        </Text>
      ) : (
        <Stack mt="md" gap="lg">
          <Text size="sm" c="dimmed">
            Release movement analytics and weekly heatmap (ported from RRV Performance Insights).
          </Text>
          <RoadmapRewindView />
        </Stack>
      )}
    </Container>
  );
}
