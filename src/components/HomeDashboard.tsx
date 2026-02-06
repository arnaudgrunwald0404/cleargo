"use client";

import { Title, Text, Box, Select, Button, Group } from '@mantine/core';
import { MyTasks } from './MyTasks';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ViewAsUser = { email: string; name: string } | null;

interface HomeDashboardProps {
  userEmail?: string | null;
  firstName?: string | null;
  isFirstTime?: boolean;
  isSuperAdmin?: boolean;
}

export function HomeDashboard({ userEmail, firstName, isFirstTime = false, isSuperAdmin = false }: HomeDashboardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [viewAsUser, setViewAsUser] = useState<ViewAsUser>(null);
  const [usersForViewAs, setUsersForViewAs] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled || !data?.users) return;
      const currentEmail = (userEmail || '').toLowerCase();
      const options: Array<{ value: string; label: string }> = [
        { value: '', label: 'My tasks' },
        ...data.users
          .filter((u: { email?: string }) => (u.email || '').toLowerCase() !== currentEmail)
          .map((u: { email: string; name?: string; first_name?: string; last_name?: string }) => ({
            value: u.email,
            label: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.name || u.email,
          })),
      ];
      setUsersForViewAs(options);
    })();
    return () => { cancelled = true; };
  }, [userEmail, isSuperAdmin]);

  // Client-side auth check as fallback
  useEffect(() => {
    const checkAuth = async () => {
      if (!userEmail) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
          const isExternal =
            marketingUrl &&
            typeof window !== 'undefined' &&
            new URL(marketingUrl).origin !== window.location.origin;
          if (isExternal) {
            window.location.href = marketingUrl;
          } else {
            router.push('/login');
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
      backgroundColor: 'var(--color-platinum)'
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
              fontFamily: 'var(--font-marcellus), serif',
              color: 'var(--color-gray-900)',
              fontSize: 'var(--font-size-4xl)',
              fontWeight: 'var(--font-weight-bold)'
            }}
          >
            {isFirstTime ? (
              <>Welcome to ClearGO, <span style={{ color: 'var(--table-steel, #697771)' }}>{displayName}</span>!</>
            ) : (
              <>Welcome back, <span style={{ color: 'var(--table-steel, #697771)' }}>{displayName}</span></>
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

        {isSuperAdmin && usersForViewAs.length > 1 && (
          <Group align="center" gap="sm" style={{ marginBottom: 'var(--spacing-4)' }}>
            <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
              See Home page as
            </Text>
            <Select
              data={usersForViewAs}
              value={viewAsUser ? viewAsUser.email : ''}
              onChange={(value) => {
                if (value === null || value === '') {
                  setViewAsUser(null);
                  return;
                }
                const opt = usersForViewAs.find((o) => o.value === value);
                setViewAsUser(opt ? { email: opt.value, name: opt.label } : null);
              }}
              placeholder="My tasks"
              allowDeselect={false}
              searchable
              nothingFoundMessage="No user found"
              size="sm"
              style={{ minWidth: 220 }}
              styles={() => ({
                input: { fontFamily: 'var(--font-body)' },
              })}
            />
          </Group>
        )}

        {viewAsUser && (
          <Box
            style={{
              marginBottom: 'var(--spacing-4)',
              padding: '12px 16px',
              backgroundColor: 'var(--color-platinum)',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
            }}
          >
            <Group justify="space-between">
              <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                Viewing task list as <strong style={{ color: 'var(--color-gray-900)' }}>{viewAsUser.name}</strong>
              </Text>
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setViewAsUser(null)}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Back to my tasks
              </Button>
            </Group>
          </Box>
        )}

        <MyTasks viewAsEmail={viewAsUser?.email ?? null} viewAsName={viewAsUser?.name ?? null} />
      </div>
    </div>
  );
}

