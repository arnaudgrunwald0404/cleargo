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
    <div className="min-h-screen bg-gray-50 pt-24 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div style={{ 
          display: 'flex', 
          gap: '24px', 
          alignItems: 'flex-start',
          flexDirection: enableActivityFeed ? undefined : 'column',
        }}>
          {/* Main Content */}
          <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
            {/* Welcome Section */}
            <div className="mb-8">
              <Title 
                order={1} 
                className="text-4xl font-bold mb-2"
                style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
              >
                Welcome back, <span className="text-indigo-600">{displayName}</span>
              </Title>
              <Text size="lg" className="text-gray-600" style={{ fontFamily: "'Public Sans', sans-serif" }}>
                Manage your epics, track readiness criteria, and ensure successful go-to-market execution.
              </Text>
            </div>

            {/* Epic Release Grid */}
            <div className="mb-8">
              <EpicReleaseGrid />
            </div>

            {/* Post-Launch Performance Grid */}
            <div className="mb-8">
              <PostLaunchPerformanceGrid />
            </div>
          </div>

          {/* Activity Feed Sidebar */}
          {enableActivityFeed && (
            <div 
              style={{ 
                width: '380px',
                flexShrink: 0,
                position: 'sticky',
                top: '100px',
                height: 'calc(100vh - 120px)',
                marginTop: '108px',
              }}
              className="hidden lg:block"
            >
              <Box style={{ height: '100%' }}>
                <ActivityFeed />
              </Box>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

