"use client";

import { Button, Container, Title, Text, SimpleGrid, Card, Tabs, Stack, Group, Box, Flex } from '@mantine/core';
import { IconTable, IconCalculator, IconRefresh, IconBell } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';
import { useRef, useEffect } from 'react';

function SSOButton({ children, ...buttonProps }: any) {
  const supabase = createClient();
  
  const handleClick = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
  };

  return (
    <Button onClick={handleClick} {...buttonProps}>
      {children}
    </Button>
  );
}

export function WelcomePage() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Estimate frame rate (common values: 24, 30, 60 fps)
    // We'll use 30fps as default, which gives us 12 frames = 0.4 seconds
    // For 24fps: 12 frames = 0.5 seconds
    // For 60fps: 12 frames = 0.2 seconds
    const framesToCut = 12;
    const estimatedFps = 30; // Default assumption
    const frameDuration = framesToCut / estimatedFps; // ~0.4 seconds for 30fps
    
    const handleTimeUpdate = () => {
      if (video.duration && video.currentTime >= video.duration - frameDuration) {
        video.pause();
        video.currentTime = Math.max(0, video.duration - frameDuration);
      }
    };

    video.addEventListener('loadedmetadata', () => {
      video.addEventListener('timeupdate', handleTimeUpdate);
    });
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, []);

  return (
    <Box style={{ minHeight: '100vh', backgroundColor: '#FFFFFF' }}>
      {/* Section 1: Global Navigation (Sticky) */}
      <Box
        component="nav"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: '80px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #E9ECEF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
        }}
      >
        <Title order={1} style={{ fontSize: '24px', fontWeight: 800, color: '#1E3A8A' }}>
          ClearGO
        </Title>
        <SSOButton
          variant="filled"
          size="md"
          style={{ backgroundColor: '#228BE6', borderRadius: '9999px' }}
        >
          Log In with SSO
        </SSOButton>
      </Box>

      {/* Section 2: Hero Section */}
      <Container size="xl" style={{ paddingTop: '128px', paddingBottom: '128px' }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" style={{ alignItems: 'center' }}>
          <Stack gap="xl">
            <Title order={1} style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1.2 }}>
              Launch with Confidence.{' '}
              <span style={{ color: '#228BE6' }}>Not Spreadsheets.</span>
            </Title>
            <Text size="lg" style={{ color: '#495057', lineHeight: 1.6, maxWidth: '500px' }}>
              Replace the chaos of static matrices with a living, intelligent control tower. Align Product, GTM, and Engineering on a single source of truth.
            </Text>
            <Group>
              <SSOButton
                size="lg"
                variant="filled"
                style={{ backgroundColor: '#228BE6', borderRadius: '6px' }}
              >
                Enter the Console
              </SSOButton>
            </Group>
          </Stack>

          {/* Hero Visual - Before/After Transformation Video */}
          <Box style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <video
              ref={videoRef}
              src="/hero_video.mp4"
              autoPlay
              muted
              playsInline
              controls
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            >
              Your browser does not support the video tag.
            </video>
          </Box>
        </SimpleGrid>
      </Container>

      {/* Section 3: The "Why" */}
      <Box style={{ backgroundColor: '#F8F9FA', paddingTop: '128px', paddingBottom: '128px' }}>
        <Container size="md" style={{ textAlign: 'center' }}>
          <Title order={2} style={{ fontSize: '36px', fontWeight: 700, marginBottom: '24px' }}>
            Stop Launching in the Dark.
          </Title>
          <Text size="lg" style={{ color: '#495057', marginBottom: '64px', lineHeight: 1.6 }}>
            Launch risks are often discovered too late. ClearGO models your matrix in a real database, highlighting blockers and enforcing gates <strong>before</strong> they delay the release.
          </Text>

          {/* Timeline Visualization */}
          <Box style={{ width: '100%', maxWidth: '700px', margin: '0 auto' }}>
            <svg width="100%" height="200" viewBox="0 0 700 200" style={{ display: 'block' }}>
              {/* Timeline line */}
              <line x1="50" y1="100" x2="650" y2="100" stroke="#DEE2E6" strokeWidth="3" />
              
              {/* Markers */}
              <g>
                {/* T-90 */}
                <circle cx="150" cy="100" r="8" fill="#FA5252" />
                <text x="150" y="60" textAnchor="middle" fontSize="14" fontWeight="600" fill="#495057">T-90</text>
                <path d="M 140 90 L 130 80 L 120 90 Z" fill="#FA5252" />
                <text x="130" y="78" textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF">!</text>
                
                {/* T-30 */}
                <circle cx="350" cy="100" r="8" fill="#FAB005" />
                <text x="350" y="60" textAnchor="middle" fontSize="14" fontWeight="600" fill="#495057">T-30</text>
                <path d="M 340 90 L 330 80 L 320 90 Z" fill="#FAB005" />
                <text x="330" y="78" textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF">?</text>
                
                {/* ClearGO Gate */}
                <rect x="400" y="60" width="100" height="80" rx="8" fill="#228BE6" opacity="0.1" stroke="#228BE6" strokeWidth="2" />
                <text x="450" y="105" textAnchor="middle" fontSize="12" fontWeight="700" fill="#228BE6">ClearGO</text>
                <text x="450" y="125" textAnchor="middle" fontSize="10" fill="#228BE6">Gate</text>
                
                {/* T+30 */}
                <circle cx="550" cy="100" r="8" fill="#12B886" />
                <text x="550" y="60" textAnchor="middle" fontSize="14" fontWeight="600" fill="#495057">T+30</text>
                <path d="M 560 90 L 570 80 L 580 90 Z" fill="#12B886" />
                <text x="570" y="78" textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF">✓</text>
              </g>
              
              {/* Risk transformation arrows */}
              <path d="M 150 100 L 400 100" stroke="#FA5252" strokeWidth="2" strokeDasharray="5,5" fill="none" opacity="0.5" />
              <path d="M 350 100 L 400 100" stroke="#FAB005" strokeWidth="2" strokeDasharray="5,5" fill="none" opacity="0.5" />
              <path d="M 500 100 L 550 100" stroke="#12B886" strokeWidth="2" fill="none" opacity="0.5" />
              <polygon points="545,95 550,100 545,105" fill="#12B886" opacity="0.5" />
            </svg>
          </Box>
        </Container>
      </Box>

      {/* Section 4: Feature Grid */}
      <Container size="xl" style={{ paddingTop: '128px', paddingBottom: '128px' }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
          <Card shadow="sm" padding="xl" radius="md" withBorder style={{ borderColor: '#E2E8F0' }}>
            <Stack gap="md">
              <Box style={{ backgroundColor: '#EFF6FF', width: '64px', height: '64px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconTable size={32} color="#228BE6" />
              </Box>
              <Title order={3} style={{ fontSize: '20px', fontWeight: 700 }}>
                The Portfolio View
              </Title>
              <Text style={{ color: '#475569', lineHeight: 1.6 }}>
                A consistent, real-time view across all ~15 pods and active launches. Filter by tier or product instantly.
              </Text>
            </Stack>
          </Card>

          <Card shadow="sm" padding="xl" radius="md" withBorder style={{ borderColor: '#E2E8F0' }}>
            <Stack gap="md">
              <Box style={{ backgroundColor: '#EFF6FF', width: '64px', height: '64px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconCalculator size={32} color="#228BE6" />
              </Box>
              <Title order={3} style={{ fontSize: '20px', fontWeight: 700 }}>
                Intelligent Gating
              </Title>
              <Text style={{ color: '#475569', lineHeight: 1.6 }}>
                Automated readiness scores and verdicts based on your criteria. Gates block launches if not met.
              </Text>
            </Stack>
          </Card>

          <Card shadow="sm" padding="xl" radius="md" withBorder style={{ borderColor: '#E2E8F0' }}>
            <Stack gap="md">
              <Box style={{ backgroundColor: '#EFF6FF', width: '64px', height: '64px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconRefresh size={32} color="#228BE6" />
              </Box>
              <Title order={3} style={{ fontSize: '20px', fontWeight: 700 }}>
                Synced with Aha!
              </Title>
              <Text style={{ color: '#475569', lineHeight: 1.6 }}>
                Aha! remains the roadmap source of truth. We pull launchable epics and push back summary status.
              </Text>
            </Stack>
          </Card>

          <Card shadow="sm" padding="xl" radius="md" withBorder style={{ borderColor: '#E2E8F0' }}>
            <Stack gap="md">
              <Box style={{ backgroundColor: '#EFF6FF', width: '64px', height: '64px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconBell size={32} color="#228BE6" />
              </Box>
              <Title order={3} style={{ fontSize: '20px', fontWeight: 700 }}>
                Accountability & Alerts
              </Title>
              <Text style={{ color: '#475569', lineHeight: 1.6 }}>
                Stakeholders get reminders for stale criteria. High risks are flagged weeks before the target date.
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>
      </Container>

      {/* Section 5: Who is this for? */}
      <Box style={{ backgroundColor: '#F8F9FA', paddingTop: '128px', paddingBottom: '128px' }}>
        <Container size="lg">
          <Title order={2} style={{ fontSize: '36px', fontWeight: 700, textAlign: 'center', marginBottom: '48px' }}>
            Built for the Whole Org
          </Title>
          <Tabs defaultValue="leadership" variant="pills">
            <Tabs.List justify="center" style={{ marginBottom: '48px', backgroundColor: '#E2E8F0', padding: '4px', borderRadius: '9999px' }}>
              <Tabs.Tab value="leadership">Leadership (CPO/ELT)</Tabs.Tab>
              <Tabs.Tab value="pm">Product Managers</Tabs.Tab>
              <Tabs.Tab value="functional">Functional Leads (Eng/GTM)</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="leadership">
              <Card shadow="sm" padding={0} radius="md" withBorder style={{ borderColor: '#E2E8F0', overflow: 'hidden' }}>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0}>
                  <Stack gap="md" style={{ padding: '48px' }}>
                    <Title order={3} style={{ fontSize: '28px', fontWeight: 700 }}>
                      See the Big Picture.
                    </Title>
                    <Text size="lg" style={{ color: '#475569', lineHeight: 1.6 }}>
                      Needs a single view of major launches and risks. Use ClearGO in GTM councils to make data-driven Go/No-Go decisions based on real-time readiness scores.
                    </Text>
                  </Stack>
                  <Box style={{ height: '300px', backgroundColor: '#F1F5F9', position: 'relative', overflow: 'hidden' }}>
                    <svg width="100%" height="100%" viewBox="0 0 400 300" style={{ display: 'block' }}>
                      <defs>
                        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#228BE6" />
                          <stop offset="100%" stopColor="#1C7ED6" />
                        </linearGradient>
                      </defs>
                      {/* Chart bars */}
                      {[50, 100, 150, 200, 250, 300, 350].map((x, i) => {
                        const height = 50 + (i * 20);
                        return (
                          <rect
                            key={i}
                            x={x}
                            y={250 - height}
                            width="40"
                            height={height}
                            fill="url(#chartGradient)"
                            opacity={0.7 + (i * 0.05)}
                          />
                        );
                      })}
                      {/* Trend line */}
                      <polyline
                        points="70,200 120,180 170,160 220,140 270,120 320,100 370,80"
                        fill="none"
                        stroke="#12B886"
                        strokeWidth="3"
                      />
                    </svg>
                    <Box style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(30, 58, 138, 0.1), rgba(30, 58, 138, 0.1))', mixBlendMode: 'multiply' }} />
                  </Box>
                </SimpleGrid>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="pm">
              <Card shadow="sm" padding={0} radius="md" withBorder style={{ borderColor: '#E2E8F0', overflow: 'hidden' }}>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0}>
                  <Stack gap="md" style={{ padding: '48px' }}>
                    <Title order={3} style={{ fontSize: '28px', fontWeight: 700 }}>
                      Own Your Epic.
                    </Title>
                    <Text size="lg" style={{ color: '#475569', lineHeight: 1.6 }}>
                      Coordinate with PMM, Eng, and Support without chasing people down. Get a clear checklist, visibility into blockers, and a definitive log of launch decisions.
                    </Text>
                  </Stack>
                  <Box style={{ height: '300px', backgroundColor: '#F1F5F9', position: 'relative', overflow: 'hidden' }}>
                    <svg width="100%" height="100%" viewBox="0 0 400 300" style={{ display: 'block' }}>
                      {/* Checklist items */}
                      {[
                        { y: 60, text: 'Product Requirements', checked: true },
                        { y: 100, text: 'Marketing Assets', checked: true },
                        { y: 140, text: 'Engineering Sign-off', checked: true },
                        { y: 180, text: 'Security Review', checked: false },
                        { y: 220, text: 'Support Training', checked: false },
                      ].map((item, i) => (
                        <g key={i}>
                          <rect x="50" y={item.y - 15} width="20" height="20" rx="4" fill={item.checked ? '#12B886' : '#DEE2E6'} />
                          {item.checked && (
                            <path d={`M ${55} ${item.y - 5} L ${60} ${item.y} L ${65} ${item.y - 5}`} stroke="#FFFFFF" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          )}
                          <text x="85" y={item.y} fontSize="16" fill="#475569">{item.text}</text>
                        </g>
                      ))}
                    </svg>
                    <Box style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(30, 58, 138, 0.1), rgba(30, 58, 138, 0.1))', mixBlendMode: 'multiply' }} />
                  </Box>
                </SimpleGrid>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="functional">
              <Card shadow="sm" padding={0} radius="md" withBorder style={{ borderColor: '#E2E8F0', overflow: 'hidden' }}>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0}>
                  <Stack gap="md" style={{ padding: '48px' }}>
                    <Title order={3} style={{ fontSize: '28px', fontWeight: 700 }}>
                      Clear Expectations.
                    </Title>
                    <Text size="lg" style={{ color: '#475569', lineHeight: 1.6 }}>
                      Whether you own migration tooling, support readiness, or sales assets, see exactly what criteria you are on the hook for and easily update your status.
                    </Text>
                  </Stack>
                  <Box style={{ height: '300px', backgroundColor: '#F1F5F9', position: 'relative', overflow: 'hidden' }}>
                    <svg width="100%" height="100%" viewBox="0 0 400 300" style={{ display: 'block' }}>
                      {/* User avatar */}
                      <circle cx="200" cy="120" r="40" fill="#228BE6" />
                      <circle cx="200" cy="110" r="25" fill="#FFFFFF" />
                      <rect x="175" y="140" width="50" height="60" rx="8" fill="#228BE6" />
                      
                      {/* Badge */}
                      <circle cx="230" cy="100" r="20" fill="#FAB005" />
                      <text x="230" y="107" textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF">3</text>
                      
                      {/* To-Do label */}
                      <rect x="150" y="210" width="100" height="30" rx="4" fill="#F8F9FA" stroke="#DEE2E6" />
                      <text x="200" y="230" textAnchor="middle" fontSize="12" fontWeight="600" fill="#475569">Security Review</text>
                    </svg>
                    <Box style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(30, 58, 138, 0.1), rgba(30, 58, 138, 0.1))', mixBlendMode: 'multiply' }} />
                  </Box>
                </SimpleGrid>
              </Card>
            </Tabs.Panel>
          </Tabs>
        </Container>
      </Box>

      {/* Section 6: Footer */}
      <Box component="footer" style={{ borderTop: '1px solid #E2E8F0', paddingTop: '48px', paddingBottom: '48px', backgroundColor: '#FFFFFF' }}>
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" style={{ marginBottom: '32px' }}>
            <Stack gap="xs">
              <Title order={3} style={{ fontSize: '20px', fontWeight: 800, color: '#1E3A8A' }}>
                ClearGO
              </Title>
              <Text size="sm" style={{ color: '#64748B' }}>
                Internal Launch Readiness Console
              </Text>
            </Stack>
            <Flex direction={{ base: 'column', md: 'row' }} gap="xl" justify={{ base: 'flex-start', md: 'flex-end' }} align={{ base: 'flex-start', md: 'center' }}>
              <Text size="sm" style={{ color: '#475569', fontWeight: 500 }}>
                Ready to launch?
              </Text>
              <Text
                component="a"
                href="#"
                size="sm"
                style={{ color: '#228BE6', textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                Documentation / Wiki
              </Text>
              <Text
                component="a"
                href="#"
                size="sm"
                style={{ color: '#228BE6', textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                Support (Product Ops)
              </Text>
            </Flex>
          </SimpleGrid>
          <Box style={{ borderTop: '1px solid #F1F5F9', paddingTop: '32px', textAlign: 'center' }}>
            <Text size="xs" style={{ color: '#94A3B8' }}>
              © 2024 ClearCompany. Internal Use Only.
            </Text>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

