"use client";

import { Title, Text, Box } from '@mantine/core';
import { ActivityFeed } from './ActivityFeed';
import { EpicReleaseGrid } from './EpicReleaseGrid';
import { PostLaunchPerformanceGrid } from './PostLaunchPerformanceGrid';
import { createClient } from '@/lib/supabase/client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface HomeDashboardProps {
  userEmail?: string | null;
  firstName?: string | null;
  enableActivityFeed?: boolean;
  isFirstTime?: boolean;
}

export function HomeDashboard({ userEmail, firstName, enableActivityFeed = true, isFirstTime = false }: HomeDashboardProps) {
  const router = useRouter();
  const supabase = createClient();
  
  // Client-side auth check as fallback
  useEffect(() => {
    const checkAuth = async () => {
      if (!userEmail) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
          if (marketingUrl) {
            window.location.href = marketingUrl;
          } else {
            router.push('/welcome');
          }
        }
      }
    };
    checkAuth();
  }, [userEmail, router, supabase]);
  
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
            {isFirstTime ? (
              <>Welcome to ClearGO, <span style={{ color: 'var(--color-accent)' }}>{displayName}</span>!</>
            ) : (
              <>Welcome back, <span style={{ color: 'var(--color-accent)' }}>{displayName}</span></>
            )}
          </Title>
          <Text 
            size="lg" 
            style={{ 
              fontFamily: 'var(--font-body)',
              color: 'var(--color-gray-500)',
              fontSize: 'var(--font-size-lg)'
            }}
          >
            {isFirstTime ? (
              <>
                Get started by exploring your epics and launch readiness criteria. Track progress, collaborate with your team, and ensure successful go-to-market execution.
              </>
            ) : (
              <>
                Manage your epics, track readiness criteria, and ensure successful go-to-market execution.
              </>
            )}
          </Text>
          {isFirstTime && (
            <div 
              style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#eff6ff',
                borderLeft: '4px solid #3b82f6',
                borderRadius: '8px',
                border: '1px solid #dbeafe'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '20px', lineHeight: '1' }}>💡</div>
                <div style={{ flex: 1 }}>
                  <p style={{ 
                    fontFamily: 'var(--font-body)',
                    color: '#1e40af', 
                    fontWeight: '600', 
                    marginBottom: '4px',
                    fontSize: '14px'
                  }}>
                    Quick Start
                  </p>
                  <p style={{ 
                    fontFamily: 'var(--font-body)',
                    color: '#1e3a8a', 
                    fontSize: '14px', 
                    lineHeight: '1.6',
                    margin: 0
                  }}>
                    Start by reviewing your assigned epics below. Click on any epic to view its launch readiness criteria, track progress, and collaborate with your team.
                  </p>
                </div>
              </div>
            </div>
          )}
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

