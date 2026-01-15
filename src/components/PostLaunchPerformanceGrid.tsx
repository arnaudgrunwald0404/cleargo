"use client";

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, Title, Text, Box, Tooltip } from '@mantine/core';
import type { Epic } from '@/types/epics';
import { PurpleLoader } from './PurpleLoader';
import { useEpicScope } from '@/lib/contexts/EpicScopeContext';
import { ScopeFilterBanner } from './ScopeFilterBanner';

interface Release {
  id: number;
  release_name: string;
  launch_date: string | null;
  archived?: boolean;
}

interface FeedbackCount {
  epic_id: string;
  count: number;
}

interface PostLaunchPerformanceGridProps {
  className?: string;
}

export function PostLaunchPerformanceGrid({ className }: PostLaunchPerformanceGridProps) {
  const { scope, isMyScope } = useEpicScope();
  const [releases, setReleases] = useState<Release[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [feedbackCounts, setFeedbackCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const endpoint = isMyScope ? '/api/epics/my-scope' : '/api/epics';
        const [releasesRes, epicsRes] = await Promise.all([
          fetch('/api/releases', { credentials: 'include' }),
          fetch(endpoint, { credentials: 'include' }),
        ]);

        if (releasesRes.ok) {
          const releasesData = await releasesRes.json();
          setReleases(Array.isArray(releasesData) ? releasesData : []);
        }

        // Fetch feedback counts for all epics
        const feedbackMap = new Map<string, number>();
        let epicsData: Epic[] = [];
        
        if (epicsRes.ok) {
          epicsData = await epicsRes.json();
          setEpics(Array.isArray(epicsData) ? epicsData : []);
          
          if (Array.isArray(epicsData)) {
            // Fetch feedback for each epic
            const feedbackPromises = epicsData.map(async (epic: Epic) => {
              try {
                const feedbackRes = await fetch(`/api/epics/${epic.id}/feedback`, { credentials: 'include' });
                if (feedbackRes.ok) {
                  const feedback = await feedbackRes.json();
                  return { epic_id: epic.id, count: Array.isArray(feedback) ? feedback.length : 0 };
                }
              } catch (error) {
                console.warn(`Error fetching feedback for epic ${epic.id}:`, error);
              }
              return { epic_id: epic.id, count: 0 };
            });
            const feedbackResults = await Promise.all(feedbackPromises);
            feedbackResults.forEach(({ epic_id, count }) => {
              feedbackMap.set(epic_id, count);
            });
          }
        }
        setFeedbackCounts(feedbackMap);
      } catch (error) {
        console.error('Error fetching data for grid:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [scope]);

  // Extract release name from epic's aha_fields
  const getReleaseName = (epic: Epic): string | null => {
    if (!epic.aha_fields || typeof epic.aha_fields !== 'object') return null;
    const fields = epic.aha_fields as any;

    // Check standard fields
    if (fields.standard_fields && typeof fields.standard_fields === 'object') {
      const standardFields = fields.standard_fields;
      const releaseName = standardFields?.aha_release_name ||
        standardFields?.release?.name || null;
      if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
        return releaseName.trim();
      }
    }

    // Check custom fields
    if (fields.custom_fields && typeof fields.custom_fields === 'object') {
      const customFields = fields.custom_fields;
      const releaseName = customFields?.release_target_after_pod_planning;
      if (releaseName && typeof releaseName === 'string' && releaseName.trim()) {
        return releaseName.trim();
      }
    }

    return null;
  };

  // Get performance color based on feedback count
  const getPerformanceColor = (feedbackCount: number): string => {
    if (feedbackCount === 0) return '#9CA3AF'; // gray for no feedback
    if (feedbackCount >= 5) return '#10B981'; // green for high engagement
    if (feedbackCount >= 2) return '#F59E0B'; // yellow for moderate engagement
    return '#EF4444'; // red for low engagement (1 feedback)
  };

  // Process data to create grid structure
  const gridData = useMemo(() => {
    // Filter out archived releases
    const activeReleases = releases.filter(r => !r.archived);

    // Calculate date 180 days ago
    const today = new Date();
    const oneHundredEightyDaysAgo = new Date();
    oneHundredEightyDaysAgo.setDate(today.getDate() - 180);

    // Filter epics to only LAUNCHED status
    // If scheduled_ga_dev_date exists, check if it's within last 180 days
    // Otherwise, include the epic anyway (for demo purposes)
    const postLaunchEpics = epics.filter(epic => {
      // Exclude archived epics
      if (epic.archived === true) return false;
      
      // Debug: log "Hire Eligibility" epic details
      if (epic.name?.includes('Hire Eligibility')) {
        console.log('Hire Eligibility epic details:', {
          name: epic.name,
          status: epic.status,
          scheduled_ga_dev_date: epic.scheduled_ga_dev_date,
          target_launch_date: epic.target_launch_date,
          aha_fields: epic.aha_fields
        });
      }
      
      // Check status (case-insensitive, trim whitespace)
      const status = epic.status?.trim().toUpperCase();
      if (status !== 'LAUNCHED') {
        return false;
      }
      
      // If there's a scheduled_ga_dev_date, check if it's within the window
      if (epic.scheduled_ga_dev_date) {
        const gaDate = new Date(epic.scheduled_ga_dev_date);
        // Check if date is valid
        if (isNaN(gaDate.getTime())) {
          // Invalid date - include it anyway (for demo)
          if (epic.name?.includes('Hire Eligibility')) {
            console.log('Hire Eligibility - invalid GA date, including anyway:', epic.scheduled_ga_dev_date);
          }
          return true;
        }
        // Check if GA date is within last 180 days (GA date >= oneHundredEightyDaysAgo and <= today)
        const inWindow = gaDate >= oneHundredEightyDaysAgo && gaDate <= today;
        if (epic.name?.includes('Hire Eligibility')) {
          console.log('Hire Eligibility GA date check:', {
            scheduled_ga_dev_date: epic.scheduled_ga_dev_date,
            gaDate: gaDate.toISOString(),
            oneHundredEightyDaysAgo: oneHundredEightyDaysAgo.toISOString(),
            today: today.toISOString(),
            inWindow: inWindow
          });
        }
        return inWindow;
      }
      
      // If no scheduled_ga_dev_date, include it anyway (for demo)
      return true;
    });

    // Group epics by release
    const releaseEpicsMap = new Map<string, Epic[]>();

    postLaunchEpics.forEach(epic => {
      const releaseName = getReleaseName(epic);
      // Use release name if available, otherwise use "Ungrouped"
      const displayReleaseName = releaseName || 'Ungrouped';
      if (!releaseEpicsMap.has(displayReleaseName)) {
        releaseEpicsMap.set(displayReleaseName, []);
      }
      releaseEpicsMap.get(displayReleaseName)!.push(epic);
    });

    // Sort epics within each release by name for consistent ordering
    releaseEpicsMap.forEach((epicsList, releaseName) => {
      epicsList.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Get all releases that have epics (from both activeReleases and any releases found in epics)
    const allReleaseNames = new Set<string>();
    releaseEpicsMap.forEach((_, releaseName) => {
      allReleaseNames.add(releaseName);
    });

    // Create a map of release names to release data
    const releaseMap = new Map<string, Release>();
    activeReleases.forEach(r => {
      releaseMap.set(r.release_name, r);
    });

    // Build releases list: first from activeReleases, then add any missing ones from epics
    const releasesWithEpics: Release[] = [];
    
    // Add releases from activeReleases that have epics
    activeReleases
      .filter(r => releaseEpicsMap.has(r.release_name))
      .forEach(r => releasesWithEpics.push(r));

    // Add any releases found in epics that aren't in activeReleases
    allReleaseNames.forEach(releaseName => {
      if (releaseName !== 'Ungrouped' && !releaseMap.has(releaseName)) {
        releasesWithEpics.push({
          id: -1,
          release_name: releaseName,
          launch_date: null,
          archived: false,
        });
      }
    });

    // Add "Ungrouped" release if there are epics without a release
    if (releaseEpicsMap.has('Ungrouped')) {
      releasesWithEpics.push({
        id: -1,
        release_name: 'Ungrouped',
        launch_date: null,
        archived: false,
      });
    }

    // Sort all releases by launch date
    releasesWithEpics.sort((a, b) => {
      if (!a.launch_date && !b.launch_date) return 0;
      if (!a.launch_date) return 1;
      if (!b.launch_date) return -1;
      return new Date(a.launch_date).getTime() - new Date(b.launch_date).getTime();
    });

    return {
      releases: releasesWithEpics,
      releaseEpicsMap,
    };
  }, [releases, epics]);

  // Calculate metrics - must be before conditional returns
  const totalEpics = useMemo(() => {
    if (!gridData.releaseEpicsMap) return 0;
    return Array.from(gridData.releaseEpicsMap.values())
      .flat().length;
  }, [gridData.releaseEpicsMap]);

  const epicsWithFeedback = useMemo(() => {
    if (!gridData.releaseEpicsMap) return 0;
    return Array.from(gridData.releaseEpicsMap.values())
      .flat()
      .filter(epic => (feedbackCounts.get(epic.id) || 0) > 0).length;
  }, [gridData.releaseEpicsMap, feedbackCounts]);

  if (loading) {
    return (
      <>
        <ScopeFilterBanner />
        <Card shadow="sm" padding="md" radius="md" withBorder className={className}>
          <div className="flex items-center justify-center py-8">
            <PurpleLoader size="md" />
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <ScopeFilterBanner />
    <Card shadow="sm" padding="md" radius="md" withBorder className={className}>
      <Title order={3} className="mb-12" style={{ 
        fontFamily: 'var(--font-heading)',
        color: 'var(--color-gray-900)',
        fontSize: 'var(--font-size-subsection)',
        fontWeight: 'var(--font-weight-bold)'
      }}>
        <span style={{ color: 'var(--color-accent)' }}>Post-Launch</span>: {totalEpics} Epic{totalEpics !== 1 ? 's' : ''} tracked (GA &lt; 180 days) | {epicsWithFeedback} with Feedback
      </Title>

      {/* Grid Container */}
      <Box style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '700px', marginTop: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', justifyContent: 'center' }}>
          {gridData.releases.map(release => {
            const releaseEpics = gridData.releaseEpicsMap.get(release.release_name) || [];
            return (
              <div
                key={release.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '40px',
                  maxWidth: '70px',
                }}
              >
                {/* Release Name Header - Fixed height container for alignment */}
                <div
                  style={{
                    minHeight: '60px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    width: '100%',
                    marginBottom: '4px',
                  }}
                >
                  <Tooltip
                    label={
                      <div>
                        <div style={{ fontWeight: 600 }}>{release.release_name}</div>
                        {release.launch_date && (
                          <div style={{ fontSize: '11px', marginTop: '4px' }}>
                            {new Date(release.launch_date).toLocaleDateString()}
                          </div>
                        )}
                        <div style={{ fontSize: '11px', marginTop: '4px' }}>
                          {releaseEpics.length} epic{releaseEpics.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    }
                    position="top"
                    withArrow
                  >
                    <Link href={`/epics?release=${encodeURIComponent(release.release_name)}`}>
                      <Text
                        size="xs"
                        style={{
                          textAlign: 'center',
                          cursor: 'pointer',
                          lineHeight: 'var(--line-height-tight)',
                          fontWeight: 'var(--font-weight-medium)',
                          wordBreak: 'break-word',
                          hyphens: 'auto',
                          color: 'var(--color-gray-500)',
                          fontFamily: 'var(--font-body)'
                        }}
                      >
                        {release.release_name}
                      </Text>
                    </Link>
                  </Tooltip>
                </div>

                {/* Epic Squares Column */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    alignItems: 'center',
                    marginTop: '0',
                  }}
                >
                  {releaseEpics.map(epic => {
                    const feedbackCount = feedbackCounts.get(epic.id) || 0;
                    const color = getPerformanceColor(feedbackCount);

                    return (
                      <Tooltip
                        key={epic.id}
                        label={
                          <div>
                            <div style={{ fontWeight: 600 }}>{epic.name}</div>
                            <div style={{ fontSize: '11px', marginTop: '4px' }}>
                              {release.release_name}
                            </div>
                            <div style={{ fontSize: '11px', marginTop: '4px' }}>
                              Feedback: {feedbackCount} item{feedbackCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                        }
                        position="top"
                        withArrow
                      >
                        <Link href={`/epics/${epic.id}`} style={{ display: 'inline-block' }}>
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '3px',
                              backgroundColor: color,
                              border: '1px solid rgba(0, 0, 0, 0.1)',
                              transition: 'transform 0.2s',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          />
                        </Link>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Box>

      {/* Legend */}
      <Box style={{ 
        marginTop: 'var(--spacing-4)', 
        paddingTop: 'var(--spacing-4)', 
        borderTop: `1px solid var(--color-gray-200)` 
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 'var(--spacing-4)', 
          flexWrap: 'wrap', 
          justifyContent: 'center' 
        }}>
          <Text size="xs" style={{ 
            color: 'var(--color-gray-500)', 
            fontWeight: 'var(--font-weight-medium)',
            fontFamily: 'var(--font-body)'
          }}>Engagement:</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: 'var(--radius-sm)', 
              backgroundColor: 'var(--color-success-base)', 
              border: '1px solid rgba(0, 0, 0, 0.1)' 
            }} />
            <Text size="xs" style={{ 
              color: 'var(--color-gray-500)',
              fontFamily: 'var(--font-body)'
            }}>High (5+ feedback)</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: 'var(--radius-sm)', 
              backgroundColor: 'var(--color-warning-base)', 
              border: '1px solid rgba(0, 0, 0, 0.1)' 
            }} />
            <Text size="xs" style={{ 
              color: 'var(--color-gray-500)',
              fontFamily: 'var(--font-body)'
            }}>Moderate (2-4 feedback)</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: 'var(--radius-sm)', 
              backgroundColor: 'var(--color-error-base)', 
              border: '1px solid rgba(0, 0, 0, 0.1)' 
            }} />
            <Text size="xs" style={{ 
              color: 'var(--color-gray-500)',
              fontFamily: 'var(--font-body)'
            }}>Low (1 feedback)</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: 'var(--radius-sm)', 
              backgroundColor: 'var(--color-gray-400)', 
              border: '1px solid rgba(0, 0, 0, 0.1)' 
            }} />
            <Text size="xs" style={{ 
              color: 'var(--color-gray-500)',
              fontFamily: 'var(--font-body)'
            }}>No Feedback</Text>
          </div>
        </div>
      </Box>
    </Card>
    </>
  );
}

