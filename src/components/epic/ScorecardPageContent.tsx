"use client";

import React, { useEffect, useState } from 'react';
import { Stack, Select } from '@mantine/core';
import { ScorecardList } from './ScorecardList';
import { ScorecardDetail } from './ScorecardDetail';
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
  const [generating, setGenerating] = useState(false);
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

  const handleGenerate = async () => {
    if (!epicId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/success/scorecards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate scorecard');
      }

      const data = await res.json();
      await fetchScorecards();
      setSelectedDate(data.snapshot_date);
    } catch (error: any) {
      alert(`Failed to generate scorecard: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = (isAdmin || isPM) && !generating;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <PurpleLoader />
      </div>
    );
  }

  return (
    <Stack gap="md">
      <ScorecardList
        epicId={epicId}
        scorecards={scorecards}
        onGenerate={handleGenerate}
        onSelect={setSelectedDate}
        canGenerate={canGenerate}
      />

      {scorecards.length > 0 && (
        <div>
          <Select
            label="Select Scorecard Date"
            placeholder="Choose a date..."
            data={scorecards.map(sc => ({
              value: sc.snapshot_date,
              label: new Date(sc.snapshot_date).toLocaleDateString(),
            }))}
            value={selectedDate || null}
            onChange={(value) => setSelectedDate(value)}
            mb="md"
          />
        </div>
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
    </Stack>
  );
}

