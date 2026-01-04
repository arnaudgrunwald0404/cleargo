"use client";

import { Title, Text, Box } from '@mantine/core';
import { ActivityFeed } from './ActivityFeed';
import { EpicReleaseGrid } from './EpicReleaseGrid';
import { PostLaunchPerformanceGrid } from './PostLaunchPerformanceGrid';

interface HomeDashboardProps {
  userEmail?: string | null;
  firstName?: string | null;
  enableActivityFeed?: boolean;
}

export function HomeDashboard({ userEmail, firstName, enableActivityFeed = true }: HomeDashboardProps) {
  const displayName = firstName || userEmail?.split('@')[0] || 'dev';

  return (
    <div className="min-h-screen pb-8" style={{ 
      fontFamily: 'var(--font-body)',
      backgroundColor: 'var(--color-gray-50)'
    }}>
      <div style={{
        maxWidth: 'var(--page-container-max-width)',
        margin: '0 auto',
        paddingLeft: 'var(--page-container-padding-x)',
        paddingRight: 'var(--page-container-padding-x)',
        paddingTop: 'var(--page-container-padding-top)'
      }}
      className="sm:px-6 lg:px-8"
      >
        {/* Welcome Section - Full Width */}
        <div className="mb-8">
          <Title 
            order={1} 
            className="text-4xl font-bold mb-2"
            style={{ 
              fontFamily: 'var(--font-heading)',
              color: 'var(--color-gray-900)',
              fontSize: 'var(--font-size-4xl)',
              fontWeight: 'var(--font-weight-bold)'
            }}
          >
            Welcome back, <span style={{ color: 'var(--color-accent)' }}>{displayName}</span>
          </Title>
          <Text 
            size="lg" 
            style={{ 
              fontFamily: 'var(--font-body)',
              color: 'var(--color-gray-500)',
              fontSize: 'var(--font-size-lg)'
            }}
          >
            Manage your epics, track readiness criteria, and ensure successful go-to-market execution.
          </Text>
        </div>

        {/* Two-Column Layout Below Welcome Section */}
        <div style={{ 
          display: 'flex', 
          gap: 'var(--spacing-6)', 
          alignItems: 'flex-start',
          flexDirection: enableActivityFeed ? undefined : 'column',
        }}>
          {/* Left Column - Main Content */}
          <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
            {/* Epic Release Grid */}
            <div className="mb-8">
              <EpicReleaseGrid />
            </div>

            {/* Post-Launch Performance Grid */}
            <div className="mb-8">
              <PostLaunchPerformanceGrid />
            </div>
          </div>

          {/* Right Column - Activity Feed */}
          {enableActivityFeed && (
            <div 
              style={{ 
                width: '380px',
                flexShrink: 0
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

