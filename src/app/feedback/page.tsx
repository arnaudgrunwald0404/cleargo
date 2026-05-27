"use client";

import { Title, Text } from "@mantine/core";
import { AhaIdeasPortalEmbed } from "@/components/AhaIdeasPortalEmbed";

export default function FeedbackPage() {
  return (
    <div className="min-h-screen">
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
        <div className="mb-6">
          <Title
            order={1}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--font-size-page-title)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-gray-900)",
            }}
          >
            Ideas &amp; feedback
          </Title>
          <Text size="sm" c="dimmed" mt="xs" style={{ fontFamily: "var(--font-body)" }}>
            Share product ideas and feedback for the ClearGO team.
          </Text>
        </div>

        <AhaIdeasPortalEmbed />
      </div>
    </div>
  );
}
