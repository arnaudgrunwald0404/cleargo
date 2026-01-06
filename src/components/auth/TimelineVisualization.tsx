"use client";

import { Box, Title, Text, Container } from '@mantine/core';

export function TimelineVisualization() {
  return (
    <Box style={{ backgroundColor: '#F8F9FA', paddingTop: '64px', paddingBottom: '64px' }}>
      <Container size="md" style={{ textAlign: 'center' }}>
        <Title order={2} style={{ fontSize: '36px', fontWeight: 700, marginBottom: '24px' }}>
          Stop Launching in the Dark.
        </Title>
        <Text size="lg" style={{ color: '#495057', marginBottom: '64px', lineHeight: 1.6 }}>
          Launch risks are often discovered too late. ClearGO models your matrix in a real database, highlighting blockers and enforcing gates <strong>before</strong> they delay the release.
        </Text>
      </Container>
    </Box>
  );
}

