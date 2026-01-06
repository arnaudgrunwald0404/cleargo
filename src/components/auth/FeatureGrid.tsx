"use client";

import { SimpleGrid, Card, Stack, Box, Title, Text } from '@mantine/core';
import { IconTable, IconCalculator, IconRefresh, IconBell } from '@tabler/icons-react';

export function FeatureGrid() {
  const features = [
    {
      icon: IconTable,
      title: 'The Portfolio View',
      description: 'A consistent, real-time view across all ~15 pods and active launches. Filter by tier or product instantly.',
    },
    {
      icon: IconCalculator,
      title: 'Intelligent Gating',
      description: 'Automated readiness scores and verdicts based on your criteria. Gates block launches if not met.',
    },
    {
      icon: IconRefresh,
      title: 'Synced with Aha!',
      description: 'Aha! remains the roadmap source of truth. We pull launchable epics and push back summary status.',
    },
    {
      icon: IconBell,
      title: 'Accountability & Alerts',
      description: 'Stakeholders get reminders for stale criteria. High risks are flagged weeks before the target date.',
    },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
      {features.map((feature, index) => {
        const IconComponent = feature.icon;
        return (
          <Card key={index} shadow="sm" padding="xl" radius="md" withBorder style={{ borderColor: '#E2E8F0' }}>
            <Stack gap="md">
              <Box style={{ backgroundColor: '#EFF6FF', width: '64px', height: '64px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconComponent size={32} color="#228BE6" />
              </Box>
              <Title order={3} style={{ fontSize: '20px', fontWeight: 700 }}>
                {feature.title}
              </Title>
              <Text style={{ color: '#475569', lineHeight: 1.6 }}>
                {feature.description}
              </Text>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}

