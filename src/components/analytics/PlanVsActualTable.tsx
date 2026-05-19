'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconChevronUp, IconRefresh } from '@tabler/icons-react';
import { ahaEpicUrl } from '@/lib/aha/epicUrl';
import type { PlanVsActualItem, PlanVsActualStatusCategory } from '@/types/roadmap';
import {
  getPeriodBounds,
  planVsActualApiParams,
  quarterProgressWindowOptions,
  quarterSelectOptions,
  type QuarterProgressWindow,
} from '@/lib/roadmap/planVsActualPeriodUi';
import {
  allowedTrainMonthKeysForPlanVsActualReport,
  delayedBeyondQuarterSectionLabel,
  DELAYED_BEYOND_QUARTER_KEY,
} from '@/lib/roadmap/planVsActualStatus';
import {
  loadLocalPlanVsActualArrMap,
  saveLocalPlanVsActualArr,
} from '@/lib/roadmap/planVsActualArrLocal';
import {
  comparePlanVsActualItems,
  comparePlanVsActualItemsInGroup,
  EMPTY_GTM,
  EMPTY_GOAL,
  EMPTY_RELEASE,
  goalKey,
  gtmModuleKey,
  internalExternalLabel,
  releaseKey,
  releaseKeyLabel,
  type PlanVsActualGroupBy,
  type PlanVsActualSortKey,
} from '@/lib/roadmap/planVsActualTableHelpers';
import {
  formatPlanVsActualReleaseLabel,
  shouldShowPlanVsActualPmCause,
} from '@/lib/roadmap/planVsActualStatus';
import { PlanVsActualPmCauseHint } from '@/components/analytics/PlanVsActualPmCauseHint';
import {
  isQuarterResultsWindowAvailable,
  latestAvailableQuarterProgressWindow,
} from '@/lib/roadmap/planVsActualPeriodUi';
import { PurpleLoader } from '@/components/PurpleLoader';
import { StatusIndicator } from './StatusIndicator';
import {
  PlanVsActualItemDetail,
  type PlanVsActualRowInsight,
} from '@/components/analytics/PlanVsActualItemDetail';
import { useSlideout } from '@/components/roadmap/slideout/SlideoutContext';
import classes from './PlanVsActualTable.module.css';

const STATUS_OPTIONS: { value: PlanVsActualStatusCategory; label: string }[] = [
  { value: 'green', label: 'On plan & delivered on time' },
  { value: 'yellow', label: 'Delayed, postponed, or delivered late' },
  { value: 'red', label: 'Removed' },
  { value: 'neutral', label: 'New addition' },
];

const EMPTY_PM = '__none_pm__';

const FILTER_MULTISELECT_STYLES = {
  pillsList: {
    flexWrap: 'nowrap' as const,
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    alignItems: 'center' as const,
    maxHeight: 30,
    scrollbarGutter: 'stable',
  },
  pill: {
    flexShrink: 0,
  },
};

function pmCauseFilterKey(item: PlanVsActualItem): string {
  const c = item.pmNoteCause?.trim();
  return c ? c : EMPTY_PM;
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  thClassName,
}: {
  label: string;
  sortKey: PlanVsActualSortKey;
  activeKey: PlanVsActualSortKey | null;
  dir: 1 | -1;
  onSort: (k: PlanVsActualSortKey) => void;
  thClassName?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <Table.Th className={thClassName}>
      <UnstyledButton
        type="button"
        onClick={() => onSort(sortKey)}
        style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        {label}
        {active ? (
          dir === 1 ? (
            <IconChevronUp size={14} stroke={1.5} />
          ) : (
            <IconChevronDown size={14} stroke={1.5} />
          )
        ) : null}
      </UnstyledButton>
    </Table.Th>
  );
}

export function PlanVsActualTable({
  items,
  loading,
  insightsByKey,
  quarterStartDate,
  quarterProgressWindow,
  lastQuarterReleaseLaunchDate,
  periodStorageKey,
  onQuarterStartDateChange,
  onQuarterProgressWindowChange,
  canSaveArr,
  onSaveArr,
  arrSavePending,
  savingArrAhaKey,
  canEditGtm,
  onSaveGtm,
  gtmSavePending,
  savingGtmAhaKey,
  canEditShift,
  onSaveShiftInsight,
  onRegenerateItemNarrative,
  patchPending,
  patchingAhaKey,
  regeneratePending,
  regeneratingAhaKey,
  onRefreshReport,
  refreshReportPending,
}: {
  items: PlanVsActualItem[];
  loading?: boolean;
  onRefreshReport?: () => void;
  refreshReportPending?: boolean;
  insightsByKey?: Record<string, PlanVsActualRowInsight>;
  quarterStartDate: string;
  quarterProgressWindow: QuarterProgressWindow;
  lastQuarterReleaseLaunchDate?: string | null;
  periodStorageKey: string;
  onQuarterStartDateChange: (iso: string) => void;
  onQuarterProgressWindowChange: (v: QuarterProgressWindow) => void;
  canSaveArr?: boolean;
  onSaveArr?: (ahaKey: string, arrImpact: string) => void | Promise<void>;
  arrSavePending?: boolean;
  savingArrAhaKey?: string | null;
  canEditGtm?: boolean;
  onSaveGtm?: (ahaKey: string, gtmModule: string, gtmName?: string | null) => void | Promise<void>;
  gtmSavePending?: boolean;
  savingGtmAhaKey?: string | null;
  canEditShift?: boolean;
  onSaveShiftInsight?: (args: {
    ahaKey: string;
    summary: string;
    likelyReasons: string;
    arrImpact?: string;
  }) => void | Promise<void>;
  onRegenerateItemNarrative?: (ahaKey: string) => void | Promise<void>;
  patchPending?: boolean;
  patchingAhaKey?: string | null;
  regeneratePending?: boolean;
  regeneratingAhaKey?: string | null;
}) {
  const { push } = useSlideout();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [goalFilter, setGoalFilter] = useState<string[]>([]);
  const [gtmFilter, setGtmFilter] = useState<string[]>([]);
  const [releaseFilter, setReleaseFilter] = useState<string[]>([]);
  const [pmCauseFilter, setPmCauseFilter] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<PlanVsActualGroupBy>('goal');
  const [sortKey, setSortKey] = useState<PlanVsActualSortKey>('feature');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [localArrMap, setLocalArrMap] = useState<Record<string, string>>({});
  const [arrTyping, setArrTyping] = useState<Record<string, string | undefined>>({});
  const [gtmTyping, setGtmTyping] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    setLocalArrMap(loadLocalPlanVsActualArrMap(periodStorageKey));
  }, [periodStorageKey]);

  const arrDisplayValue = useCallback(
    (ahaKey: string): string => {
      if (arrTyping[ahaKey] !== undefined) return arrTyping[ahaKey]!;
      const serverArr = insightsByKey?.[ahaKey]?.arrImpact?.trim();
      return serverArr || localArrMap[ahaKey] || '';
    },
    [arrTyping, insightsByKey, localArrMap],
  );

  const arrSnapshotRef = useRef<Record<string, string>>({});

  const syncArrSnapshotRef = useCallback(() => {
    const snap: Record<string, string> = {};
    for (const i of items) {
      snap[i.ahaKey] = arrDisplayValue(i.ahaKey);
    }
    arrSnapshotRef.current = snap;
  }, [items, arrDisplayValue]);

  useLayoutEffect(() => {
    syncArrSnapshotRef();
  }, [syncArrSnapshotRef]);

  const persistArr = async (ahaKey: string, raw: string) => {
    const trimmed = raw.trim();
    saveLocalPlanVsActualArr(periodStorageKey, ahaKey, trimmed);
    setLocalArrMap((prev) => {
      const next = { ...prev };
      if (!trimmed) delete next[ahaKey];
      else next[ahaKey] = trimmed;
      return next;
    });

    if (canSaveArr && onSaveArr) {
      try {
        await onSaveArr(ahaKey, trimmed);
        return;
      } catch {
        /* parent surfaces error */
        return;
      }
    }

    if (!canEditShift || !onSaveShiftInsight) return;

    const insight = insightsByKey?.[ahaKey];
    try {
      await onSaveShiftInsight({
        ahaKey,
        summary: insight?.summary ?? '',
        likelyReasons: insight?.likelyReasons ?? '',
        arrImpact: trimmed,
      });
    } catch {
      /* parent surfaces error */
    }
  };

  const stageArrDraft = (ahaKey: string, raw: string) => {
    setArrTyping((prev) => ({ ...prev, [ahaKey]: raw }));
    setLocalArrMap((prev) => {
      const next = { ...prev };
      const trimmed = raw.trim();
      if (!trimmed) delete next[ahaKey];
      else next[ahaKey] = trimmed;
      return next;
    });
    saveLocalPlanVsActualArr(periodStorageKey, ahaKey, raw);
  };

  const persistGtm = async (row: PlanVsActualItem, raw: string) => {
    const trimmed = raw.trim();
    if (!canEditGtm || !onSaveGtm || !trimmed) return;
    try {
      await onSaveGtm(row.ahaKey, trimmed, row.featureName);
    } catch {
      /* parent surfaces error */
    }
  };

  const openDetail = (row: PlanVsActualItem) => {
    const insight = insightsByKey?.[row.ahaKey];
    push({
      id: `pva-${row.ahaKey}`,
      title: row.featureName,
      description: (
        <Anchor
          href={ahaEpicUrl(row.ahaKey)}
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
          onClick={(e) => e.stopPropagation()}
        >
          {row.ahaKey}
        </Anchor>
      ),
      render: () => (
        <PlanVsActualItemDetail
          row={row}
          insight={insight}
          canEditShift={canEditShift}
          getArrImpact={() => arrSnapshotRef.current[row.ahaKey] ?? ''}
          onSave={
            onSaveShiftInsight
              ? (payload) => onSaveShiftInsight(payload)
              : async () => {
                  /* read-only */
                }
          }
          onRegenerateItemNarrative={
            onRegenerateItemNarrative ? () => onRegenerateItemNarrative(row.ahaKey) : undefined
          }
          rowSaving={Boolean(patchPending && patchingAhaKey === row.ahaKey)}
          rowRegenerating={Boolean(regeneratePending && regeneratingAhaKey === row.ahaKey)}
        />
      ),
    });
  };

  const onSortColumn = (k: PlanVsActualSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };

  const { periodType, periodDate } = useMemo(
    () => planVsActualApiParams(quarterStartDate, quarterProgressWindow),
    [quarterStartDate, quarterProgressWindow],
  );
  const reportingScope = useMemo(() => {
    const { periodStart, periodEnd } = getPeriodBounds(periodType, periodDate);
    return {
      allowedTrainMonthKeys: allowedTrainMonthKeysForPlanVsActualReport(
        periodType,
        periodStart,
        periodEnd,
      ),
    };
  }, [periodType, periodDate]);
  const delayedBeyondLabel = useMemo(
    () => delayedBeyondQuarterSectionLabel(quarterStartDate),
    [quarterStartDate],
  );

  const goalOptions = useMemo(() => {
    const labels = new Map<string, string>();
    items.forEach((i) => {
      const k = goalKey(i);
      labels.set(k, k === EMPTY_GOAL ? '(No goal)' : k);
    });
    return [...labels.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [items]);

  const gtmOptions = useMemo(() => {
    const labels = new Map<string, string>();
    items.forEach((i) => {
      const k = gtmModuleKey(i);
      labels.set(k, k === EMPTY_GTM ? '(No GTM module)' : k);
    });
    return [...labels.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [items]);

  const releaseOptions = useMemo(() => {
    const labels = new Map<string, string>();
    items.forEach((i) => {
      const k = releaseKey(i, reportingScope);
      labels.set(k, releaseKeyLabel(k, delayedBeyondLabel));
    });
    return [...labels.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [items]);

  const missingGtmCount = useMemo(
    () => items.filter((i) => gtmModuleKey(i) === EMPTY_GTM).length,
    [items],
  );

  const pmCauseOptions = useMemo(() => {
    const labels = new Map<string, string>();
    items.forEach((i) => {
      const k = pmCauseFilterKey(i);
      labels.set(k, k === EMPTY_PM ? '(No PM reason)' : k);
    });
    return [...labels.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [items]);

  const filteredItems = useMemo(() => {
    let out = items;
    if (statusFilter.length > 0) {
      out = out.filter((i) => statusFilter.includes(i.statusCategory));
    }
    if (goalFilter.length > 0) {
      out = out.filter((i) => goalFilter.includes(goalKey(i)));
    }
    if (gtmFilter.length > 0) {
      out = out.filter((i) => gtmFilter.includes(gtmModuleKey(i)));
    }
    if (releaseFilter.length > 0) {
      out = out.filter((i) => releaseFilter.includes(releaseKey(i, reportingScope)));
    }
    if (pmCauseFilter.length > 0) {
      out = out.filter((i) => pmCauseFilter.includes(pmCauseFilterKey(i)));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (i) =>
          (i.goal ?? '').toLowerCase().includes(q) ||
          (i.productArea ?? '').toLowerCase().includes(q) ||
          (i.pmNoteCause ?? '').toLowerCase().includes(q) ||
          internalExternalLabel(i.pmNoteCause).toLowerCase().includes(q) ||
          i.featureName.toLowerCase().includes(q) ||
          i.ahaKey.toLowerCase().includes(q) ||
          i.statusLabel.toLowerCase().includes(q) ||
          releaseKey(i, reportingScope).toLowerCase().includes(q) ||
          delayedBeyondLabel.toLowerCase().includes(q) ||
          (i.endRelease ?? '').toLowerCase().includes(q) ||
          arrDisplayValue(i.ahaKey).toLowerCase().includes(q),
      );
    }
    return out;
  }, [
    items,
    search,
    statusFilter,
    goalFilter,
    gtmFilter,
    releaseFilter,
    pmCauseFilter,
    arrDisplayValue,
    reportingScope,
    delayedBeyondLabel,
  ]);

  const groupedSections = useMemo(() => {
    const m = new Map<string, PlanVsActualItem[]>();
    for (const row of filteredItems) {
      const key =
        groupBy === 'goal'
          ? goalKey(row)
          : groupBy === 'gtm'
            ? gtmModuleKey(row)
            : releaseKey(row, reportingScope);
      const list = m.get(key) ?? [];
      list.push(row);
      m.set(key, list);
    }
    const entries = [...m.entries()].sort((a, b) => {
      const tail = (k: string) =>
        k === EMPTY_GOAL ||
        k === EMPTY_GTM ||
        k === EMPTY_RELEASE ||
        k === DELAYED_BEYOND_QUARTER_KEY;
      const la = tail(a[0]) ? '\uffff' : a[0];
      const lb = tail(b[0]) ? '\uffff' : b[0];
      if (a[0] === DELAYED_BEYOND_QUARTER_KEY && b[0] !== DELAYED_BEYOND_QUARTER_KEY) return 1;
      if (b[0] === DELAYED_BEYOND_QUARTER_KEY && a[0] !== DELAYED_BEYOND_QUARTER_KEY) return -1;
      return la.localeCompare(lb, undefined, { sensitivity: 'base' });
    });
    return entries.map(([headerKey, rows]) => {
      const ordered = [...rows].sort((a, b) =>
        comparePlanVsActualItemsInGroup(
          groupBy,
          a,
          b,
          arrDisplayValue(a.ahaKey),
          arrDisplayValue(b.ahaKey),
          reportingScope,
        ),
      );
      return {
        header:
          headerKey === EMPTY_GOAL
            ? '(No goal)'
            : headerKey === EMPTY_GTM
              ? '(No GTM module)'
              : headerKey === EMPTY_RELEASE
                ? '(No release)'
                : groupBy === 'release'
                  ? releaseKeyLabel(headerKey, delayedBeyondLabel)
                  : headerKey,
        rows: ordered,
      };
    });
  }, [filteredItems, groupBy, reportingScope, delayedBeyondLabel, arrDisplayValue]);

  const quarterOptions = quarterSelectOptions();
  const progressOptions = quarterProgressWindowOptions(
    quarterStartDate,
    lastQuarterReleaseLaunchDate,
  );
  const progressValue = (() => {
    const selected = progressOptions.find((o) => o.value === quarterProgressWindow);
    if (selected && !selected.disabled) return quarterProgressWindow;
    const firstEnabled = progressOptions.find((o) => !o.disabled);
    return firstEnabled?.value ?? progressOptions[0].value;
  })();

  useEffect(() => {
    if (
      quarterProgressWindow === 'quarter-results' &&
      !isQuarterResultsWindowAvailable(quarterStartDate, new Date(), lastQuarterReleaseLaunchDate)
    ) {
      onQuarterProgressWindowChange(
        latestAvailableQuarterProgressWindow(quarterStartDate, lastQuarterReleaseLaunchDate),
      );
    }
  }, [
    quarterProgressWindow,
    quarterStartDate,
    lastQuarterReleaseLaunchDate,
    onQuarterProgressWindowChange,
  ]);

  const periodControls = (
    <Group align="flex-end" gap="sm" wrap="nowrap">
      <Select
        aria-label="Quarter"
        data={quarterOptions}
        value={quarterStartDate}
        onChange={(v) => v && onQuarterStartDateChange(v)}
        searchable
        allowDeselect={false}
        style={{ width: 130 }}
      />
      <Select
        aria-label="Quarter progress"
        data={progressOptions}
        value={progressValue}
        onChange={(v) => v && onQuarterProgressWindowChange(v as QuarterProgressWindow)}
        allowDeselect={false}
        style={{ width: 380 }}
        comboboxProps={{ withinPortal: true }}
      />
      {onRefreshReport ? (
        <Tooltip label="Reload table from snapshots and ClearGO epics (not AI narrative)">
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={onRefreshReport}
            loading={refreshReportPending}
          >
            Refresh report
          </Button>
        </Tooltip>
      ) : null}
    </Group>
  );

  const hasActiveFilter =
    search.trim().length > 0 ||
    statusFilter.length > 0 ||
    goalFilter.length > 0 ||
    gtmFilter.length > 0 ||
    releaseFilter.length > 0 ||
    pmCauseFilter.length > 0;

  const renderGtmCell = (row: PlanVsActualItem) => {
    const display = row.productArea ?? '';
    const rowSaving = Boolean(gtmSavePending && savingGtmAhaKey === row.ahaKey);
    if (!canEditGtm) {
      return <Table.Td className={classes.pvaColFirst}>{display || '—'}</Table.Td>;
    }
    const value = gtmTyping[row.ahaKey] !== undefined ? gtmTyping[row.ahaKey]! : display;
    return (
      <Table.Td className={classes.pvaColFirst} onClick={(e) => e.stopPropagation()}>
        <TextInput
          aria-label={`GTM module for ${row.featureName}`}
          placeholder="GTM module"
          size="xs"
          value={value}
          onChange={(e) =>
            setGtmTyping((prev) => ({ ...prev, [row.ahaKey]: e.currentTarget.value }))
          }
          onBlur={() => {
            const v = gtmTyping[row.ahaKey] ?? display;
            setGtmTyping((prev) => {
              const next = { ...prev };
              delete next[row.ahaKey];
              return next;
            });
            if (v.trim() && v.trim() !== display) void persistGtm(row, v);
          }}
          disabled={rowSaving}
        />
      </Table.Td>
    );
  };

  const renderArrCell = (row: PlanVsActualItem) => {
    const rowSaving = Boolean(
      (arrSavePending && savingArrAhaKey === row.ahaKey) ||
        (patchPending && patchingAhaKey === row.ahaKey),
    );
    const rowRegenerating = Boolean(regeneratePending && regeneratingAhaKey === row.ahaKey);
    return (
      <Table.Td className={classes.pvaColArr} onClick={(e) => e.stopPropagation()}>
        <TextInput
          aria-label={`ARR or accounts for ${row.featureName}`}
          placeholder="e.g. $1.2M (45)"
          size="xs"
          classNames={{ root: classes.pvaArrInput }}
          value={arrDisplayValue(row.ahaKey)}
          onChange={(e) => stageArrDraft(row.ahaKey, e.currentTarget.value)}
          onBlur={() => {
            const v = arrTyping[row.ahaKey] ?? arrDisplayValue(row.ahaKey);
            setArrTyping((prev) => {
              const next = { ...prev };
              delete next[row.ahaKey];
              return next;
            });
            void persistArr(row.ahaKey, v);
          }}
          disabled={rowSaving || rowRegenerating}
        />
      </Table.Td>
    );
  };

  const renderReleaseCell = (row: PlanVsActualItem) => {
    const label = formatPlanVsActualReleaseLabel(row.endRelease ?? row.startRelease);
    return (
      <Table.Td className={classes.pvaColRelease}>
        <Text size="sm">{label ?? '—'}</Text>
      </Table.Td>
    );
  };

  const renderStatusCell = (row: PlanVsActualItem) => (
    <Table.Td className={classes.pvaColStatus}>
      <Group gap={4} wrap="nowrap" align="center">
        <StatusIndicator category={row.statusCategory} label={row.statusLabel} />
        {shouldShowPlanVsActualPmCause(row.statusLabel) ? (
          <PlanVsActualPmCauseHint pmNoteCause={row.pmNoteCause} statusLabel={row.statusLabel} />
        ) : null}
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Open details"
          title="Open details"
          onClick={(e) => {
            e.stopPropagation();
            openDetail(row);
          }}
        >
          <IconChevronRight size={16} stroke={1.5} />
        </ActionIcon>
      </Group>
    </Table.Td>
  );

  const renderFeatureCell = (row: PlanVsActualItem) => (
    <Table.Td className={classes.pvaColFeature}>
      <UnstyledButton
        type="button"
        fz="sm"
        onClick={(e) => {
          e.stopPropagation();
          openDetail(row);
        }}
        className={`${classes.featureLink} ${classes.pvaFeatureInner}`}
      >
        {row.featureName}
      </UnstyledButton>
      <Anchor
        href={ahaEpicUrl(row.ahaKey)}
        target="_blank"
        rel="noopener noreferrer"
        className={classes.pvaAhaKeyLink}
        onClick={(e) => e.stopPropagation()}
      >
        {row.ahaKey}
      </Anchor>
    </Table.Td>
  );

  const tableByGtm = (
    <Stack gap="lg">
      {groupedSections.map((section) => (
        <Stack key={section.header} gap="xs">
          <Text fw={600} size="sm">
            {section.header}
          </Text>
          <Table striped highlightOnHover withTableBorder className={classes.pvaTable}>
            <Table.Thead>
              <Table.Tr>
                <SortHeader
                  label="Goal"
                  sortKey="goal"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColFirst}
                />
                <SortHeader
                  label="Feature"
                  sortKey="feature"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColFeature}
                />
                <SortHeader
                  label="Release"
                  sortKey="release"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColRelease}
                />
                <SortHeader
                  label="ARR / accounts"
                  sortKey="arr"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColArr}
                />
                <SortHeader
                  label="Status (end of period)"
                  sortKey="status"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColStatus}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {section.rows.map((row) => (
                <Table.Tr
                  key={row.ahaKey}
                  className={classes.clickableRow}
                  onClick={() => openDetail(row)}
                >
                  <Table.Td className={`${classes.pvaColFirst} ${classes.pvaColFirstPreline}`}>
                    {row.goal ?? '—'}
                  </Table.Td>
                  {renderFeatureCell(row)}
                  {renderReleaseCell(row)}
                  {renderArrCell(row)}
                  {renderStatusCell(row)}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}
    </Stack>
  );

  const tableByGoal = (
    <Stack gap="lg">
      {groupedSections.map((section) => (
        <Stack key={section.header} gap="xs">
          <Text fw={600} size="sm" style={{ whiteSpace: 'pre-line' }}>
            {section.header}
          </Text>
          <Table striped highlightOnHover withTableBorder className={classes.pvaTable}>
            <Table.Thead>
              <Table.Tr>
                <SortHeader
                  label="GTM module"
                  sortKey="gtmModule"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColFirst}
                />
                <SortHeader
                  label="Feature"
                  sortKey="feature"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColFeature}
                />
                <SortHeader
                  label="Release"
                  sortKey="release"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColRelease}
                />
                <SortHeader
                  label="ARR / accounts"
                  sortKey="arr"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColArr}
                />
                <SortHeader
                  label="Status (end of period)"
                  sortKey="status"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColStatus}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {section.rows.map((row) => (
                <Table.Tr
                  key={row.ahaKey}
                  className={classes.clickableRow}
                  onClick={() => openDetail(row)}
                >
                  {renderGtmCell(row)}
                  {renderFeatureCell(row)}
                  {renderReleaseCell(row)}
                  {renderArrCell(row)}
                  {renderStatusCell(row)}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}
    </Stack>
  );

  const tableByRelease = (
    <Stack gap="lg">
      {groupedSections.map((section) => (
        <Stack key={section.header} gap="xs">
          <Text fw={600} size="sm">
            {section.header}
          </Text>
          <Table striped highlightOnHover withTableBorder className={classes.pvaTable}>
            <Table.Thead>
              <Table.Tr>
                <SortHeader
                  label="Goal"
                  sortKey="goal"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColFirst}
                />
                <SortHeader
                  label="GTM module"
                  sortKey="gtmModule"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColFirst}
                />
                <SortHeader
                  label="Feature"
                  sortKey="feature"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColFeature}
                />
                <SortHeader
                  label="ARR / accounts"
                  sortKey="arr"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColArr}
                />
                <SortHeader
                  label="Status (end of period)"
                  sortKey="status"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSortColumn}
                  thClassName={classes.pvaColStatus}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {section.rows.map((row) => (
                <Table.Tr
                  key={row.ahaKey}
                  className={classes.clickableRow}
                  onClick={() => openDetail(row)}
                >
                  <Table.Td className={`${classes.pvaColFirst} ${classes.pvaColFirstPreline}`}>
                    {row.goal ?? '—'}
                  </Table.Td>
                  {renderGtmCell(row)}
                  {renderFeatureCell(row)}
                  {renderArrCell(row)}
                  {renderStatusCell(row)}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}
    </Stack>
  );

  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" gap="md" wrap="wrap">
          <Group align="flex-end" gap="sm" wrap="wrap" style={{ flex: '1 1 auto', minWidth: 0 }}>
            <TextInput
              placeholder="Search goal, GTM module, feature, PM reason, status…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              disabled={items.length === 0}
              style={{ flex: '1 1 220px', minWidth: 200 }}
            />
            <MultiSelect
              placeholder={goalFilter.length > 0 ? '' : 'All goals'}
              data={goalOptions}
              value={goalFilter}
              onChange={setGoalFilter}
              clearable
              searchable
              disabled={items.length === 0}
              style={{ flex: '0 1 200px', minWidth: 160 }}
              styles={FILTER_MULTISELECT_STYLES}
            />
            <MultiSelect
              placeholder={gtmFilter.length > 0 ? '' : 'All GTM modules'}
              data={gtmOptions}
              value={gtmFilter}
              onChange={setGtmFilter}
              clearable
              searchable
              disabled={items.length === 0}
              style={{ flex: '0 1 200px', minWidth: 160 }}
              styles={FILTER_MULTISELECT_STYLES}
            />
            <MultiSelect
              placeholder={releaseFilter.length > 0 ? '' : 'All releases'}
              data={releaseOptions}
              value={releaseFilter}
              onChange={setReleaseFilter}
              clearable
              searchable
              disabled={items.length === 0}
              style={{ flex: '0 1 180px', minWidth: 140 }}
              styles={FILTER_MULTISELECT_STYLES}
            />
            <MultiSelect
              placeholder={pmCauseFilter.length > 0 ? '' : 'All PM reasons'}
              data={pmCauseOptions}
              value={pmCauseFilter}
              onChange={setPmCauseFilter}
              clearable
              searchable
              disabled={items.length === 0}
              style={{ flex: '0 1 200px', minWidth: 160 }}
              styles={FILTER_MULTISELECT_STYLES}
            />
            <MultiSelect
              placeholder={statusFilter.length > 0 ? '' : 'All statuses'}
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              clearable
              disabled={items.length === 0}
              style={{ flex: '0 1 200px', minWidth: 160 }}
              styles={FILTER_MULTISELECT_STYLES}
            />
            <Select
              aria-label="Group rows by"
              data={[
                { value: 'goal', label: 'By goal' },
                { value: 'gtm', label: 'By GTM module' },
                { value: 'release', label: 'By release' },
              ]}
              value={groupBy}
              onChange={(v) => v && setGroupBy(v as PlanVsActualGroupBy)}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              style={{ flex: '0 0 auto', width: 168 }}
            />
          </Group>
          {periodControls}
        </Group>

        {loading ? (
          <Group justify="center" py="lg">
            <PurpleLoader />
          </Group>
        ) : items.length === 0 ? (
          <Text c="dimmed" size="sm">
            No roadmap snapshots found for this period.
          </Text>
        ) : (
          <>
            {missingGtmCount > 0 && missingGtmCount >= Math.ceil(items.length * 0.2) ? (
              <Alert color="blue" variant="light" title="GTM module missing on many rows">
                {missingGtmCount} of {items.length} rows have no GTM module in snapshot data. Values sync
                from the Aha roadmap pivot (weekly snapshot + Sunday GTM backfill). Ask Product Ops to run a
                one-time backfill if modules exist in Aha but not here.
              </Alert>
            ) : null}
            <Text size="xs" c="dimmed">
              {canSaveArr
                ? 'ARR / accounts saves for this period when you leave the field (shared for your team).'
                : 'ARR / accounts is stored in this browser only — you need save permission to persist for the team.'}
              {' '}
              {canEditGtm
                ? 'Click a GTM module cell to set it on all snapshot rows for that epic.'
                : null}
              {' '}
              For slips and removals, use the info icon beside status for Internal / External PM reason.
            </Text>
            {hasActiveFilter && (
              <Text size="xs" c="dimmed">
                Showing {filteredItems.length} of {items.length} rows
              </Text>
            )}

            {groupBy === 'goal'
              ? tableByGoal
              : groupBy === 'gtm'
                ? tableByGtm
                : tableByRelease}

            {filteredItems.length === 0 ? (
              <Text size="sm" c="dimmed">
                No rows match your filters.
              </Text>
            ) : null}
          </>
        )}
      </Stack>
    </Card>
  );
}
