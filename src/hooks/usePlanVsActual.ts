'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type {
  PeriodShiftAnalysis,
  PlanVsActualPeriodType,
  PlanVsActualReportPayload,
} from '@/types/roadmap';

async function fetchPlanVsActual(
  periodType: PlanVsActualPeriodType,
  periodDate: string,
): Promise<PlanVsActualReportPayload> {
  const params = new URLSearchParams({
    period_type: periodType,
    period_date: periodDate,
  });
  const res = await fetchWithRateLimit(`/api/analytics/plan-vs-actual?${params.toString()}`, {
    credentials: 'include',
    maxRetries: 1,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { details?: string }).details || (err as { error?: string }).error || res.statusText);
  }
  return res.json();
}

export function usePlanVsActual(periodType: PlanVsActualPeriodType, periodDate: string | null) {
  return useQuery({
    queryKey: ['plan-vs-actual', periodType, periodDate],
    queryFn: () => fetchPlanVsActual(periodType, periodDate as string),
    enabled: Boolean(periodDate),
    staleTime: 60_000,
  });
}

export function useGeneratePlanVsActualAnalysis() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      periodType: PlanVsActualPeriodType;
      periodDate: string;
      force?: boolean;
    }) => {
      const body = JSON.stringify({
        period_type: args.periodType,
        period_date: args.periodDate,
        force: args.force === true,
      });
      const res = await fetchWithRateLimit('/api/analytics/plan-vs-actual/analysis', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
        maxRetries: 1,
        dedupeKey: `POST /api/analytics/plan-vs-actual/analysis ${body}`,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { details?: string }).details || (err as { error?: string }).error || res.statusText);
      }
      return res.json() as Promise<{
        analysis: PlanVsActualReportPayload['cachedAnalysis'];
        generatedAt: string;
        fromCache: boolean;
      }>;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: ['plan-vs-actual', variables.periodType, variables.periodDate],
      });
    },
  });
}

export type PatchPlanVsActualAnalysisArgs = {
  periodType: PlanVsActualPeriodType;
  periodDate: string;
  overview?: string;
  themes?: string[];
  itemInsight?: {
    ahaKey: string;
    summary: string;
    likelyReasons: string;
    /** Omit to leave existing ARR text unchanged on the server row. */
    arrImpact?: string;
  };
};

export function useRegeneratePlanVsActualItemNarrative() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      periodType: PlanVsActualPeriodType;
      periodDate: string;
      ahaKey: string;
    }) => {
      const body = JSON.stringify({
        period_type: args.periodType,
        period_date: args.periodDate,
        aha_key: args.ahaKey,
      });
      const res = await fetchWithRateLimit('/api/analytics/plan-vs-actual/analysis/item', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
        maxRetries: 1,
        dedupeKey: `POST /api/analytics/plan-vs-actual/analysis/item ${body}`,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { details?: string }).details || (err as { error?: string }).error || res.statusText);
      }
      return res.json() as Promise<{
        analysis: PeriodShiftAnalysis;
        generatedAt: string | null;
      }>;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: ['plan-vs-actual', variables.periodType, variables.periodDate],
      });
    },
  });
}

export function usePatchPlanVsActualArr() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      periodType: PlanVsActualPeriodType;
      periodDate: string;
      ahaKey: string;
      arrImpact: string;
    }) => {
      const body = JSON.stringify({
        period_type: args.periodType,
        period_date: args.periodDate,
        aha_key: args.ahaKey,
        arr_impact: args.arrImpact,
      });
      const res = await fetchWithRateLimit('/api/analytics/plan-vs-actual/arr', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
        maxRetries: 1,
        dedupeKey: `PATCH /api/analytics/plan-vs-actual/arr ${body}`,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { details?: string }).details || (err as { error?: string }).error || res.statusText);
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      qc.setQueryData<PlanVsActualReportPayload>(
        ['plan-vs-actual', variables.periodType, variables.periodDate],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            cachedAnalysis: data.analysis,
            analysisGeneratedAt: data.generatedAt,
          };
        },
      );
    },
  });
}

export function usePatchPlanVsActualGtm() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: { ahaKey: string; gtmModule: string; gtmName?: string | null }) => {
      const body = JSON.stringify({
        aha_key: args.ahaKey,
        gtm_module: args.gtmModule,
        gtm_name: args.gtmName ?? null,
      });
      const res = await fetchWithRateLimit('/api/analytics/plan-vs-actual/gtm', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
        maxRetries: 1,
        dedupeKey: `PATCH /api/analytics/plan-vs-actual/gtm ${body}`,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { details?: string }).details || (err as { error?: string }).error || res.statusText);
      }
      return res.json() as Promise<{ ok: boolean; rows_updated: number }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plan-vs-actual'] });
    },
  });
}

export function usePatchPlanVsActualAnalysis() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: PatchPlanVsActualAnalysisArgs) => {
      const payload: Record<string, unknown> = {
        period_type: args.periodType,
        period_date: args.periodDate,
      };
      if (args.overview !== undefined) payload.overview = args.overview;
      if (args.themes !== undefined) payload.themes = args.themes;
      if (args.itemInsight) {
        payload.item_insight = {
          aha_key: args.itemInsight.ahaKey,
          summary: args.itemInsight.summary,
          likely_reasons: args.itemInsight.likelyReasons,
          ...(args.itemInsight.arrImpact !== undefined
            ? { arr_impact: args.itemInsight.arrImpact }
            : {}),
        };
      }
      const body = JSON.stringify(payload);
      const res = await fetchWithRateLimit('/api/analytics/plan-vs-actual/analysis', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
        maxRetries: 1,
        dedupeKey: `PATCH /api/analytics/plan-vs-actual/analysis ${body}`,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { details?: string }).details || (err as { error?: string }).error || res.statusText);
      }
      return res.json() as Promise<{
        analysis: PeriodShiftAnalysis;
        generatedAt: string | null;
      }>;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: ['plan-vs-actual', variables.periodType, variables.periodDate],
      });
    },
  });
}
