"use client";

import { Box } from '@mantine/core';
import { Title, Text } from '@mantine/core';
import { EpicReleaseGrid } from '@/components/EpicReleaseGrid';
import { PostLaunchPerformanceGrid } from '@/components/PostLaunchPerformanceGrid';
import { ActivityFeed } from '@/components/ActivityFeed';

interface PortfolioContentProps {
  enableActivityFeed?: boolean;
}

export function PortfolioContent({ enableActivityFeed = true }: PortfolioContentProps) {
  return (
    <div
      className="min-h-screen pb-8"
      style={{
        fontFamily: 'var(--font-body)',
        backgroundColor: 'var(--color-platinum)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)',
          paddingTop: 'var(--page-container-padding-top)',
        }}
        className="sm:px-6 lg:px-8"
      >
        <div className="mb-8">
          <Title
            order={1}
            className="text-4xl font-bold mb-2"
            style={{
              fontFamily: 'var(--font-marcellus), serif',
              color: 'var(--color-gray-900)',
              fontSize: 'var(--font-size-4xl)',
              fontWeight: 'var(--font-weight-bold)',
            }}
          >
            Portfolio
          </Title>
          <Text
            size="lg"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--color-gray-500)',
              fontSize: 'var(--font-size-lg)',
            }}
          >
            Go/No-Go and post-launch epic tracking across releases.
          </Text>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-6)',
            alignItems: 'flex-start',
            flexDirection: enableActivityFeed ? undefined : 'column',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <div className="mb-8">
              <EpicReleaseGrid />
            </div>
            <div className="mb-8">
              <PostLaunchPerformanceGrid />
            </div>
          </div>

          {enableActivityFeed && (
            <div
              style={{
                width: '380px',
                flexShrink: 0,
              }}
              className="hidden lg:block"
            >
              <Box>
                <ActivityFeed />
              </Box>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
