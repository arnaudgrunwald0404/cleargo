"use client";

import React, { useEffect, useState } from 'react';
import { RetroList } from './RetroList';
import { RetroForm } from './RetroForm';
import { PurpleLoader } from '../PurpleLoader';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type { EpicRetroWithSubmitter } from '@/lib/services/successMeasurementService';
import type { DayMarker } from '@/lib/success/types';

interface RetroPageContentProps {
  epicId: string;
}

export function RetroPageContent({ epicId }: RetroPageContentProps) {
  const [retros, setRetros] = useState<EpicRetroWithSubmitter[]>([]);
  const [editingDayMarker, setEditingDayMarker] = useState<DayMarker | null>(null);
  const [editingRetro, setEditingRetro] = useState<EpicRetroWithSubmitter | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPM, setIsPM] = useState(false);

  useEffect(() => {
    if (epicId) {
      fetchRetros();
      checkPermissions();
    }
  }, [epicId]);

  useEffect(() => {
    if (editingDayMarker && epicId) {
      fetchRetroByDayMarker(editingDayMarker);
    } else {
      setEditingRetro(null);
    }
  }, [editingDayMarker, epicId]);

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

  const fetchRetros = async () => {
    if (!epicId) return;
    setLoading(true);
    try {
      const res = await fetchWithRateLimit(`/api/epics/${epicId}/success/retros`, {
        maxRetries: 1,
      });
      if (res.ok) {
        const data = await res.json();
        setRetros(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch retros:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRetroByDayMarker = async (dayMarker: DayMarker) => {
    if (!epicId) return;
    try {
      const res = await fetchWithRateLimit(`/api/epics/${epicId}/success/retros/${dayMarker}`, {
        maxRetries: 1,
      });
      if (res.ok) {
        const data = await res.json();
        setEditingRetro(data);
      } else if (res.status === 404) {
        setEditingRetro(null);
      }
    } catch (error) {
      console.error('Failed to fetch retro:', error);
    }
  };

  const handleSubmit = async (
    data: {
      day_marker: DayMarker;
      outcome: any;
      blockers?: string[];
      assumptions_wrong?: string;
      repeat_next_time?: string;
      change_next_time?: string;
      action_items?: any[];
    },
    submit: boolean
  ) => {
    if (!epicId) return;
    setSubmitting(true);
    try {
      if (submit) {
        // Submit retro
        const res = await fetch(`/api/epics/${epicId}/success/retros`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to submit retro');
        }
      } else {
        // Save as draft
        const res = await fetch(`/api/epics/${epicId}/success/retros/${data.day_marker}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to save retro');
        }
      }

      await fetchRetros();
      setEditingDayMarker(null);
    } catch (error: any) {
      alert(`Failed to ${submit ? 'submit' : 'save'} retro: ${error.message}`);
      throw error;
    } finally {
      setSubmitting(false);
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
    <>
      <RetroList
        epicId={epicId}
        retros={retros}
        onEdit={setEditingDayMarker}
        isAdmin={isAdmin}
        isPM={isPM}
      />

      {editingDayMarker && (
        <RetroForm
          opened={!!editingDayMarker}
          onClose={() => setEditingDayMarker(null)}
          epicId={epicId}
          dayMarker={editingDayMarker}
          initialData={editingRetro || undefined}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
        />
      )}
    </>
  );
}

