'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stack, Text } from '@mantine/core';
import { SlideoutContainer } from '@/components/roadmap/slideout/SlideoutContainer';
import { SlideoutProvider } from '@/components/roadmap/slideout/SlideoutContext';
import {
  usePlanVsActual,
  useGeneratePlanVsActualAnalysis,
  usePatchPlanVsActualAnalysis,
  usePatchPlanVsActualArr,
  usePatchPlanVsActualGtm,
  useRegeneratePlanVsActualItemNarrative,
} from '@/hooks/usePlanVsActual';
import { canRolesPerform } from '@/lib/permissions';
import {
  clampQuarterStartToPlanVsActualMin,
  defaultQuarterProgressWindowForQuarter,
  getInitialPlanVsActualPeriodState,
  planVsActualApiParams,
  quarterSelectOptions,
  type QuarterProgressWindow,
} from '@/lib/roadmap/planVsActualPeriodUi';
import { planVsActualArrStorageKey } from '@/lib/roadmap/planVsActualArrLocal';
import { PlanVsActualTable } from './PlanVsActualTable';
import { ShiftAnalysisPanel } from './ShiftAnalysisPanel';

export function PlanVsActualTab({ userRoles }: { userRoles: string[] }) {
  const [{ quarterStartDate, quarterProgressWindow }, setPeriod] = useState(getInitialPlanVsActualPeriodState);
  const quarterOptions = useMemo(() => quarterSelectOptions(), []);

  useEffect(() => {
    const ok = quarterOptions.some((o) => o.value === quarterStartDate);
    if (!ok && quarterOptions[0]) {
      const q = quarterOptions[0].value;
      setPeriod({
        quarterStartDate: q,
        quarterProgressWindow: defaultQuarterProgressWindowForQuarter(q),
      });
    }
  }, [quarterStartDate, quarterOptions]);

  const { periodType, periodDate } = useMemo(
    () => planVsActualApiParams(quarterStartDate, quarterProgressWindow),
    [quarterStartDate, quarterProgressWindow],
  );

  const autoAttemptKeyRef = useRef<string | null>(null);

  const gen = useGeneratePlanVsActualAnalysis();
  const patch = usePatchPlanVsActualAnalysis();
  const patchArr = usePatchPlanVsActualArr();
  const patchGtm = usePatchPlanVsActualGtm();
  const regenItem = useRegeneratePlanVsActualItemNarrative();

  useEffect(() => {
    autoAttemptKeyRef.current = null;
    gen.reset();
    patch.reset();
    regenItem.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gen/patch are stable mutation helpers
  }, [periodType, periodDate]);

  const { data, isPending, error, isFetching, refetch } = usePlanVsActual(periodType, periodDate);

  const canGenerate = useMemo(() => canRolesPerform(userRoles, 'roadmap.analysis.generate'), [userRoles]);
  const canSaveArr = useMemo(
    () => canRolesPerform(userRoles, 'roadmap.planVsActual.arr.write'),
    [userRoles],
  );
  const canEditGtm = useMemo(
    () => canRolesPerform(userRoles, 'roadmap.planVsActual.gtm.write'),
    [userRoles],
  );

  const insightsByKey = useMemo(() => {
    const list = data?.cachedAnalysis?.itemInsights;
    if (!list?.length) return undefined;
    return Object.fromEntries(
      list.map((i) => [
        i.ahaKey,
        { summary: i.summary, likelyReasons: i.likelyReasons, arrImpact: i.arrImpact },
      ]),
    );
  }, [data?.cachedAnalysis?.itemInsights]);

  const periodStorageKey = planVsActualArrStorageKey(periodType, periodDate);

  const attemptKey = `${periodType}:${periodDate}`;

  useEffect(() => {
    if (!data || isPending || !canGenerate || gen.isPending) return;
    if (data.items.length === 0 || data.cachedAnalysis) return;
    if (autoAttemptKeyRef.current === attemptKey) return;
    autoAttemptKeyRef.current = attemptKey;
    gen.mutate({ periodType, periodDate, force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable mutate
  }, [attemptKey, data, isPending, canGenerate, gen.isPending, gen.mutate, periodType, periodDate]);

  const autoRunPending = Boolean(
    gen.isPending && canGenerate && data && !data.cachedAnalysis && data.items.length > 0,
  );

  const generationError =
    gen.error instanceof Error ? gen.error.message : gen.error ? String(gen.error) : null;

  const patchError =
    patch.error instanceof Error ? patch.error.message : patch.error ? String(patch.error) : null;

  const regenItemError =
    regenItem.error instanceof Error ? regenItem.error.message : regenItem.error ? String(regenItem.error) : null;

  const arrSaveError =
    patchArr.error instanceof Error ? patchArr.error.message : patchArr.error ? String(patchArr.error) : null;

  const gtmSaveError =
    patchGtm.error instanceof Error ? patchGtm.error.message : patchGtm.error ? String(patchGtm.error) : null;

  const savingPeriodNarrative =
    patch.isPending &&
    (patch.variables?.overview !== undefined || patch.variables?.themes !== undefined);

  const hasCachedAnalysis = Boolean(data?.cachedAnalysis);
  const canEditAnalysis = canGenerate && hasCachedAnalysis;

  return (
    <SlideoutProvider>
      <Stack gap="md">
        {error ? (
          <Text c="red">{error instanceof Error ? error.message : String(error)}</Text>
        ) : null}
        {patchError ? (
          <Text c="red" size="sm">
            {patchError}
          </Text>
        ) : null}
        {regenItemError ? (
          <Text c="red" size="sm">
            {regenItemError}
          </Text>
        ) : null}
        {arrSaveError ? (
          <Text c="red" size="sm">
            {arrSaveError}
          </Text>
        ) : null}
        {gtmSaveError ? (
          <Text c="red" size="sm">
            {gtmSaveError}
          </Text>
        ) : null}
        <PlanVsActualTable
          items={data?.items ?? []}
          loading={isPending && !data}
          onRefreshReport={() => void refetch()}
          refreshReportPending={isFetching}
          insightsByKey={insightsByKey}
          periodStorageKey={periodStorageKey}
          quarterStartDate={quarterStartDate}
          quarterProgressWindow={quarterProgressWindow}
          lastQuarterReleaseLaunchDate={data?.quarterContext?.lastQuarterReleaseLaunchDate ?? null}
          onQuarterStartDateChange={(iso) => {
            const q = clampQuarterStartToPlanVsActualMin(iso);
            setPeriod({
              quarterStartDate: q,
              quarterProgressWindow: defaultQuarterProgressWindowForQuarter(q),
            });
          }}
          onQuarterProgressWindowChange={(v: QuarterProgressWindow) =>
            setPeriod((p) => ({ ...p, quarterProgressWindow: v }))
          }
          canSaveArr={canSaveArr}
          onSaveArr={async (ahaKey, arrImpact) => {
            await patchArr.mutateAsync({ periodType, periodDate, ahaKey, arrImpact });
          }}
          arrSavePending={patchArr.isPending}
          savingArrAhaKey={patchArr.variables?.ahaKey ?? null}
          canEditGtm={canEditGtm}
          onSaveGtm={async (ahaKey, gtmModule, gtmName) => {
            await patchGtm.mutateAsync({ ahaKey, gtmModule, gtmName });
          }}
          gtmSavePending={patchGtm.isPending}
          savingGtmAhaKey={patchGtm.variables?.ahaKey ?? null}
          canEditShift={canEditAnalysis}
          onSaveShiftInsight={async (payload): Promise<void> => {
            await patch.mutateAsync({
              periodType,
              periodDate,
              itemInsight: payload,
            });
          }}
          onRegenerateItemNarrative={async (ahaKey): Promise<void> => {
            await regenItem.mutateAsync({ periodType, periodDate, ahaKey });
          }}
          patchPending={patch.isPending}
          patchingAhaKey={patch.variables?.itemInsight?.ahaKey ?? null}
          regeneratePending={regenItem.isPending}
          regeneratingAhaKey={regenItem.variables?.ahaKey ?? null}
        />
        <ShiftAnalysisPanel
          key={`${periodType}-${periodDate}-${data?.analysisGeneratedAt ?? 'none'}-${data?.cachedAnalysis ? 'cache' : 'nocache'}`}
          analysis={data?.cachedAnalysis ?? null}
          generatedAt={data?.analysisGeneratedAt ?? null}
          reportItems={data?.items ?? []}
          canGenerate={canGenerate}
          canEditPeriodNarrative={canEditAnalysis}
          generating={gen.isPending}
          reportLoading={isPending}
          savingPeriodNarrative={savingPeriodNarrative}
          autoRunPending={autoRunPending}
          generationError={generationError}
          onGenerate={() => gen.mutate({ periodType, periodDate, force: false })}
          onRegenerate={() => gen.mutate({ periodType, periodDate, force: true })}
          onSavePeriodNarrative={async (overview, themes): Promise<void> => {
            await patch.mutateAsync({
              periodType,
              periodDate,
              overview,
              themes,
            });
          }}
        />
      </Stack>
      <SlideoutContainer />
    </SlideoutProvider>
  );
}
