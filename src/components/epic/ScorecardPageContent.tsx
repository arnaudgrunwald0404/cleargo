"use client";

import React, { useEffect, useState } from 'react';
import { Stack, Paper, Select } from '@mantine/core';
import { ScorecardList } from './ScorecardList';
import { ScorecardDetail } from './ScorecardDetail';
import { ScorecardTimeSeries } from './ScorecardTimeSeries';
import { PurpleLoader } from '../PurpleLoader';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type { EpicScorecard } from '@/lib/success/types';

interface ScorecardPageContentProps {
  epicId: string;
}

export function ScorecardPageContent({ epicId }: ScorecardPageContentProps) {
  const [scorecards, setScorecards] = useState<EpicScorecard[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedScorecard, setSelectedScorecard] = useState<EpicScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPM, setIsPM] = useState(false);

  useEffect(() => {
    if (epicId) {
      fetchScorecards();
      checkPermissions();
    }
  }, [epicId]);

  useEffect(() => {
    if (selectedDate && epicId) {
      fetchScorecardByDate(selectedDate);
    } else {
      setSelectedScorecard(null);
    }
  }, [selectedDate, epicId]);

  const checkPermissions = async () => {
    try {
      const res = await fetchWithRateLimit('/api/me', { maxRetries: 1 });
      if (res.ok) {
        const data = await res.json();
        const roles = (data.user?.roles || []) as string[];
        setIsAdmin(
          roles.includes('SUPERADMIN') ||
          roles.includes('PRODUCT_OPS') ||
          roles.includes('CPO')
        );
        setIsPM(roles.includes('PM'));
      }
    } catch (error) {
      console.error('Failed to check permissions:', error);
    }
  };

  const fetchScorecards = async () => {
    if (!epicId) return;
    setLoading(true);
    try {
      const res = await fetchWithRateLimit(`/api/epics/${epicId}/success/scorecards`, {
        maxRetries: 1,
      });
      if (res.ok) {
        const data = await res.json();
        setScorecards(Array.isArray(data) ? data : []);

        // Auto-select most recent if available
        if (data && data.length > 0 && !selectedDate) {
          setSelectedDate(data[0].snapshot_date);
        }
      }
    } catch (error) {
      console.error('Failed to fetch scorecards:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScorecardByDate = async (date: string) => {
    if (!epicId) return;
    setLoadingDetail(true);
    try {
      const res = await fetchWithRateLimit(`/api/epics/${epicId}/success/scorecards/${date}`, {
        maxRetries: 1,
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedScorecard(data);
      } else if (res.status === 404) {
        setSelectedScorecard(null);
      }
    } catch (error) {
      console.error('Failed to fetch scorecard:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <PurpleLoader />
      </div>
    );
  }

  return (
    <Stack gap="lg">
      <ScorecardList
        epicId={epicId}
        scorecards={scorecards}
        onSelect={setSelectedDate}
      />

      {scorecards.length > 0 && (
        <Paper withBorder p="md" radius="md" bg="white" style={{ borderColor: 'var(--color-gray-300)' }}>
          <Select
            label="Select scorecard date"
            placeholder="Choose a date..."
            data={scorecards.map(sc => ({
              value: sc.snapshot_date,
              label: new Date(sc.snapshot_date).toLocaleDateString(),
            }))}
            value={selectedDate || null}
            onChange={(value) => setSelectedDate(value)}
          />
        </Paper>
      )}

      {selectedDate && (
        <ScorecardDetail
          epicId={epicId}
          scorecard={selectedScorecard}
          loading={loadingDetail}
          isAdmin={isAdmin}
          isPM={isPM}
          onRefresh={async () => {
            // Regenerate scorecard for selected date
            try {
              const res = await fetch(`/api/epics/${epicId}/success/scorecards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshot_date: selectedDate }),
              });

              if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to refresh scorecard');
              }

              await fetchScorecardByDate(selectedDate);
            } catch (error: any) {
              alert(`Failed to refresh scorecard: ${error.message}`);
            }
          }}
        />
      )}

      {/* Time series chart from launch to +180d */}
      <ScorecardTimeSeries epicId={epicId} />
    </Stack>
  );
}

