"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Card, Title, Text, Box, Tooltip, ActionIcon } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
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

interface EpicReleaseGridProps {
  className?: string;
}

export function EpicReleaseGrid({ className }: EpicReleaseGridProps) {
  const { scope, isMyScope } = useEpicScope();
  const [releases, setReleases] = useState<Release[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingReleaseName, setSyncingReleaseName] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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

      if (epicsRes.ok) {
        const epicsData = await epicsRes.json();
        setEpics(Array.isArray(epicsData) ? epicsData : []);
      }
    } catch (error) {
      console.error('Error fetching data for grid:', error);
    } finally {
      setLoading(false);
    }
  }, [isMyScope]);

  useEffect(() => {
    fetchData();
  }, [fetchData, scope]);

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

  // Get risk level color
  const getRiskColor = (riskLevel: string | null | undefined): string => {
    if (!riskLevel) return '#9CA3AF'; // gray for not rated
    switch (riskLevel.toUpperCase()) {
      case 'HIGH':
        return '#EF4444'; // red
      case 'MEDIUM':
        return '#F59E0B'; // yellow
      case 'LOW':
        return '#10B981'; // green
      default:
        return '#9CA3AF'; // gray
    }
  };

  // Process data to create grid structure
  const gridData = useMemo(() => {
    // Filter out archived releases
    const activeReleases = releases.filter(r => !r.archived);

    // Filter out archived and launched epics (only show pre-launch epics)
    const preLaunchEpics = epics.filter(epic => 
      epic.archived !== true &&
      epic.status !== 'Released_Cohort_1' && epic.status !== 'Released_GA' && epic.status !== 'Released_Retroed'
    );

    // Group epics by release
    const releaseEpicsMap = new Map<string, Epic[]>();

    preLaunchEpics.forEach(epic => {
      const releaseName = getReleaseName(epic);
      if (releaseName) {
        if (!releaseEpicsMap.has(releaseName)) {
          releaseEpicsMap.set(releaseName, []);
        }
        releaseEpicsMap.get(releaseName)!.push(epic);
      }
    });

    // Sort epics within each release by name for consistent ordering
    releaseEpicsMap.forEach((epicsList, releaseName) => {
      epicsList.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Only show releases that have epics and are in the active releases list
    const releasesWithEpics = activeReleases
      .filter(r => releaseEpicsMap.has(r.release_name))
      .sort((a, b) => {
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

  // Calculate active epics (not completed) - must be before conditional returns
  const activeEpics = useMemo(() => {
    if (!gridData.releaseEpicsMap) return 0;
    return Array.from(gridData.releaseEpicsMap.values())
      .flat()
      .filter(epic => 
        epic.readiness_status !== 'COMPLETED' && 
        epic.status !== 'Released_Cohort_1' && 
        epic.status !== 'Released_GA' && 
        epic.status !== 'Released_Retroed' && 
        epic.status !== 'Cancelled'
      ).length;
  }, [gridData.releaseEpicsMap]);

  // Calculate high-risk epics - must be before conditional returns
  const highRiskEpics = useMemo(() => {
    if (!gridData.releaseEpicsMap) return 0;
    return Array.from(gridData.releaseEpicsMap.values())
      .flat()
      .filter(epic => epic.risk_level === 'HIGH').length;
  }, [gridData.releaseEpicsMap]);

  if (loading) {
    return (
      <Card shadow="sm" padding="md" radius="md" withBorder className={className}>
        <div className="flex items-center justify-center py-8">
          <PurpleLoader size="md" />
        </div>
      </Card>
    );
  }

  const totalEpics = Array.from(gridData.releaseEpicsMap.values()).reduce((sum, epics) => sum + epics.length, 0);

  if (gridData.releases.length === 0 || totalEpics === 0) {
    return (
      <Card shadow="sm" padding="md" radius="md" withBorder className={className}>
        <Title order={3} className="mb-2">Epic Release Grid</Title>
        <Text size="sm" className="text-gray-600">
          No releases or epics found. Add releases and epics to see the grid.
        </Text>
      </Card>
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
        <span style={{ color: 'var(--color-accent)' }}>Go/No-Go</span>: {activeEpics} Epic{activeEpics !== 1 ? 's' : ''} tracked across {gridData.releases.length} Release{gridData.releases.length !== 1 ? 's' : ''} | {highRiskEpics} High-Risk
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
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    width: '100%',
                    marginBottom: '4px',
                    gap: '4px',
                  }}
                >
                  <Tooltip label="Sync epics for this release" position="top" withArrow>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="blue"
                      loading={syncingReleaseName === release.release_name}
                      disabled={syncingReleaseName === release.release_name}
                      onClick={async () => {
                        if (!confirm(`Sync epics for release "${release.release_name}"?`)) return;
                        setSyncingReleaseName(release.release_name);
                        try {
                          const existingAhaIds = releaseEpics
                            .map((e) => e.aha_id)
                            .filter((id): id is string => Boolean(id));
                          const res = await fetch(
                            `/api/integrations/aha/sync?sync_all=true&release=${encodeURIComponent(release.release_name)}`,
                            {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                releaseName: release.release_name,
                                existingAhaIds,
                              }),
                            }
                          );
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error || 'Failed to sync epics');
                          }
                          const result = await res.json();
                          notifications.show({
                            title: 'Sync Complete',
                            message: `Created: ${result.results?.created ?? 0}, Updated: ${result.results?.updated ?? 0}`,
                            color: 'green',
                          });
                          await fetchData();
                        } catch (e: unknown) {
                          notifications.show({
                            title: 'Sync Failed',
                            message: e instanceof Error ? e.message : 'Failed to sync epics',
                            color: 'red',
                          });
                        } finally {
                          setSyncingReleaseName(null);
                        }
                      }}
                    >
                      <IconRefresh size={16} />
                    </ActionIcon>
                  </Tooltip>
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
                    const color = getRiskColor(epic.risk_level);
                    const riskLevel = epic.risk_level || 'Not rated';

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
                              Risk: {riskLevel}
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
          }}>Risk:</Text>
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
            }}>High</Text>
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
            }}>Medium</Text>
          </div>
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
            }}>Low</Text>
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
            }}>Not Rated</Text>
          </div>
        </div>
      </Box>
    </Card>
    </>
  );
}

