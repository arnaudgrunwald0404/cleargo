"use client";

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Collapse,
  Group,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChartLine, IconPencil, IconDeviceFloppy, IconX, IconSparkles, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { PurpleLoader } from '../PurpleLoader';
import { MarkdownLite } from '@/components/MarkdownLite';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

interface ForecastPageContentProps {
  epicAhaId: string;
}

type Scenario = 'bear' | 'base' | 'bull';
type Confidence = 'confirmed' | 'hypothesis' | 'low_confidence';

interface ForecastRun {
  id: string;
  epic_aha_id: string;
  source: 'migrated_from_chrysalis' | 'generated';
  status: string;
  is_current: boolean;
  created_at: string;
  created_by: string | null;
}

interface ForecastAssumption {
  id: string;
  key: string;
  label: string;
  value_bear: string | null;
  value_base: string | null;
  value_bull: string | null;
  confidence: Confidence;
  source_note: string | null;
  sort_order: number;
  overridden_by?: string | null;
  overridden_at?: string | null;
}

interface ForecastPeriod {
  id: string;
  scenario: Scenario;
  period_type: 'month' | 'quarter' | 'year';
  period_label: string;
  cross_sell_arr_usd: number;
  net_new_arr_usd: number;
  churn_reduction_arr_usd: number;
  total_arr_usd: number;
  sort_order: number;
}

type NarrativeSection = 'why_we_believe' | 'friction_points' | 'tactical_roadmap' | 'risks' | 'methodology_notes';

interface ForecastNarrative {
  id: string;
  section: NarrativeSection;
  content: string;
  sort_order: number;
}

interface ForecastCurrentResponse {
  run: ForecastRun | null;
  assumptions: ForecastAssumption[];
  periods: ForecastPeriod[];
  narrative: ForecastNarrative[];
}

interface ForecastVersion {
  id: string;
  source: 'migrated_from_chrysalis' | 'generated';
  status: string;
  is_current: boolean;
  created_at: string;
  created_by: string | null;
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: 'Confirmed',
  hypothesis: 'Hypothesis',
  low_confidence: 'Low confidence',
};

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  confirmed: 'green',
  hypothesis: 'yellow',
  low_confidence: 'gray',
};

const CONFIDENCE_OPTIONS = (Object.keys(CONFIDENCE_LABEL) as Confidence[]).map((value) => ({
  value,
  label: CONFIDENCE_LABEL[value],
}));

const NARRATIVE_TITLE: Record<NarrativeSection, string> = {
  why_we_believe: 'Why We Believe This',
  friction_points: 'Friction Points',
  tactical_roadmap: 'Tactical Roadmap',
  risks: 'Risks',
  methodology_notes: 'Methodology Notes',
};

const NARRATIVE_ORDER: NarrativeSection[] = [
  'why_we_believe',
  'friction_points',
  'tactical_roadmap',
  'risks',
  'methodology_notes',
];

function formatUsd(cents: number): string {
  const abs = Math.abs(cents);
  if (abs === 0) return '$0';
  if (abs >= 1_000_000) return `${cents < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${cents < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  return `${cents < 0 ? '-' : ''}$${abs}`;
}

function scenarioLabel(s: Scenario): string {
  return s[0].toUpperCase() + s.slice(1);
}

/** Best-effort numeric parse of a free-text assumption value like "$7,500" or "15%" or "1,368". */
function parseNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function assumptionValueForScenario(a: ForecastAssumption, scenario: Scenario): string | null {
  return scenario === 'bear' ? a.value_bear : scenario === 'base' ? a.value_base : a.value_bull;
}

/**
 * Finds the assumption whose key or label best matches one of the given keyword patterns.
 * Generated forecasts use fixed canonical keys (see orchestrator.ts); migrated forecasts have
 * LLM-improvised keys per product, so this matches loosely on substrings rather than exact keys.
 */
function findAssumptionLike(assumptions: ForecastAssumption[], patterns: string[]): ForecastAssumption | undefined {
  return assumptions.find((a) => {
    const key = a.key.toLowerCase();
    const label = a.label.toLowerCase();
    return patterns.some((p) => key.includes(p) || label.includes(p));
  });
}

function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * The engine (src/lib/forecast/engine.ts) computes and stores month, quarter, AND year rows for
 * every generated run — the monthly figures that literally sum into a year/quarter row are
 * already sitting in `allPeriods`, just not otherwise displayed. This finds them so the
 * explanation panel can show the real arithmetic instead of an approximation.
 */
function getConstituentMonths(row: ForecastPeriod, allPeriods: ForecastPeriod[]): ForecastPeriod[] {
  const monthRows = allPeriods.filter((p) => p.period_type === 'month' && p.scenario === row.scenario);
  if (row.period_type === 'year') {
    return monthRows
      .filter((p) => p.period_label.startsWith(`${row.period_label}-`))
      .sort((a, b) => a.period_label.localeCompare(b.period_label));
  }
  if (row.period_type === 'quarter') {
    const match = row.period_label.match(/^Q(\d)\s+(\d{4})$/);
    if (!match) return [];
    const quarter = Number(match[1]);
    const year = match[2];
    const startMonth = (quarter - 1) * 3 + 1;
    const monthLabels = [0, 1, 2].map((i) => `${year}-${String(startMonth + i).padStart(2, '0')}`);
    return monthRows
      .filter((p) => monthLabels.includes(p.period_label))
      .sort((a, b) => a.period_label.localeCompare(b.period_label));
  }
  return [];
}

export function ForecastPageContent({ epicAhaId }: ForecastPageContentProps) {
  const [data, setData] = useState<ForecastCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>('base');
  const [periodView, setPeriodView] = useState<'year' | 'quarter'>('year');
  const [rawMarkdown, setRawMarkdown] = useState<{ raw_markdown_forecast: string | null; raw_markdown_assumptions: string | null } | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const [versions, setVersions] = useState<ForecastVersion[]>([]);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null); // null = current

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editAssumptions, setEditAssumptions] = useState<ForecastAssumption[]>([]);
  const [editPeriods, setEditPeriods] = useState<ForecastPeriod[]>([]);

  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!generationJobId) return;
    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start > 5 * 60 * 1000) {
        clearInterval(interval);
        setGenerating(false);
        setGenerationJobId(null);
        notifications.show({ color: 'red', message: 'Forecast generation timed out after 5 minutes.' });
        return;
      }
      try {
        const res = await fetchWithRateLimit(
          `/api/forecasts/${encodeURIComponent(epicAhaId)}/generate-status?job_id=${encodeURIComponent(generationJobId)}`,
          { maxRetries: 1 }
        );
        if (!res.ok) return;
        const job = (await res.json()) as { status: string; error_message?: string | null };
        if (job.status === 'completed') {
          clearInterval(interval);
          setGenerating(false);
          setGenerationJobId(null);
          notifications.show({ color: 'green', message: 'Forecast generated.' });
          await Promise.all([fetchForecastAfterCompletion(), fetchVersions()]);
        } else if (job.status === 'failed') {
          clearInterval(interval);
          setGenerating(false);
          setGenerationJobId(null);
          notifications.show({ color: 'red', message: job.error_message ?? 'Forecast generation failed.' });
        }
      } catch {
        // transient poll failure — try again next tick
      }
    }, 2500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationJobId]);

  const startGeneration = async () => {
    setGenerating(true);
    let handedOffToPolling = false;
    try {
      const res = await fetchWithRateLimit(`/api/forecasts/${encodeURIComponent(epicAhaId)}/generate`, {
        method: 'POST',
        maxRetries: 1,
      });
      if (res.status === 202) {
        const { job_id } = (await res.json()) as { job_id: string };
        handedOffToPolling = true;
        setGenerationJobId(job_id); // the polling effect above takes over from here
        return;
      }
      if (!res.ok) throw new Error(`Failed to start generation (${res.status})`);
      notifications.show({ color: 'green', message: 'Forecast generated.' });
      await Promise.all([fetchForecast(null), fetchVersions()]);
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Failed to generate forecast' });
    } finally {
      if (!handedOffToPolling) setGenerating(false);
    }
  };

  // Returns what it fetched (or null on failure) so callers — e.g. the generation-completion
  // handler below — can check the result directly instead of racing React's state updates.
  const fetchForecast = async (runId: string | null): Promise<ForecastCurrentResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const qs = runId ? `?runId=${encodeURIComponent(runId)}` : '';
      const res = await fetchWithRateLimit(`/api/forecasts/${encodeURIComponent(epicAhaId)}/current${qs}`, { maxRetries: 1 });
      if (!res.ok) throw new Error(`Failed to load forecast (${res.status})`);
      const json = (await res.json()) as ForecastCurrentResponse;
      setData(json);
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forecast');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async () => {
    try {
      const res = await fetchWithRateLimit(`/api/forecasts/${encodeURIComponent(epicAhaId)}/versions`, { maxRetries: 1 });
      if (!res.ok) return;
      const json = (await res.json()) as { runs: ForecastVersion[] };
      setVersions(json.runs ?? []);
    } catch {
      // Version history is a nice-to-have; failing silently keeps the main forecast usable.
    }
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Loads a just-completed run, retrying once after a short delay if the read doesn't show it
  // yet (the completion write and this read go through separate Supabase clients — background
  // function vs. this route — so there's a narrow window where a read-immediately-after-write
  // could land before it's visible).
  const fetchForecastAfterCompletion = async () => {
    const first = await fetchForecast(null);
    if (!first?.run) {
      await sleep(1500);
      await fetchForecast(null);
    }
  };

  useEffect(() => {
    if (!epicAhaId) return;
    fetchForecast(null);
    fetchVersions();

    // The Forecast tab is conditionally rendered by its parent (mounted only while active), so
    // switching tabs away and back — or a plain reload — mid-generation drops any in-flight
    // polling interval and its local state. Check for a pending/running job on every mount and
    // resume the generating UI + polling if one exists, instead of showing a stale empty state
    // until the job finishes server-side and the user happens to refresh again.
    fetchWithRateLimit(`/api/forecasts/${encodeURIComponent(epicAhaId)}/generate-status`, { maxRetries: 1 })
      .then(async (res) => {
        if (!res.ok) return;
        const job = (await res.json()) as { id: string; status: string } | null;
        if (job && (job.status === 'pending' || job.status === 'running')) {
          setGenerating(true);
          setGenerationJobId(job.id);
        }
      })
      .catch(() => {
        // Best-effort resume check — not critical if it fails.
      });
  }, [epicAhaId]);

  const loadRawMarkdown = () => {
    if (rawMarkdown || rawLoading) {
      setShowRaw((v) => !v);
      return;
    }
    setRawLoading(true);
    fetchWithRateLimit(`/api/forecasts/${encodeURIComponent(epicAhaId)}/current/raw`, { maxRetries: 1 })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load source document (${res.status})`);
        setRawMarkdown(await res.json());
        setShowRaw(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load source document'))
      .finally(() => setRawLoading(false));
  };

  const selectVersion = (runId: string | null) => {
    setEditMode(false);
    setViewingRunId(runId);
    fetchForecast(runId);
  };

  const startEditing = () => {
    if (!data) return;
    setEditAssumptions(data.assumptions.map((a) => ({ ...a })));
    setEditPeriods(data.periods.map((p) => ({ ...p })));
    setEditMode(true);
  };

  const cancelEditing = () => {
    setEditMode(false);
    setEditAssumptions([]);
    setEditPeriods([]);
  };

  const updateAssumptionField = (id: string, field: 'value_bear' | 'value_base' | 'value_bull' | 'confidence', value: string) => {
    setEditAssumptions((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const updatePeriodField = (
    id: string,
    field: 'cross_sell_arr_usd' | 'net_new_arr_usd' | 'churn_reduction_arr_usd' | 'total_arr_usd',
    value: number
  ) => {
    setEditPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const saveNewVersion = async () => {
    setSaving(true);
    try {
      const res = await fetchWithRateLimit(`/api/forecasts/${encodeURIComponent(epicAhaId)}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assumptions: editAssumptions.map((a) => ({
            id: a.id,
            key: a.key,
            label: a.label,
            value_bear: a.value_bear,
            value_base: a.value_base,
            value_bull: a.value_bull,
            confidence: a.confidence,
            source_note: a.source_note,
          })),
          periods: editPeriods.map((p) => ({
            scenario: p.scenario,
            period_type: p.period_type,
            period_label: p.period_label,
            cross_sell_arr_usd: p.cross_sell_arr_usd,
            net_new_arr_usd: p.net_new_arr_usd,
            churn_reduction_arr_usd: p.churn_reduction_arr_usd,
            total_arr_usd: p.total_arr_usd,
          })),
        }),
        maxRetries: 1,
      });
      if (!res.ok) throw new Error(`Failed to save new version (${res.status})`);
      notifications.show({ color: 'green', message: 'New forecast version saved.' });
      setEditMode(false);
      setViewingRunId(null);
      await Promise.all([fetchForecast(null), fetchVersions()]);
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Failed to save new version' });
    } finally {
      setSaving(false);
    }
  };

  const displayAssumptions = editMode ? editAssumptions : data?.assumptions ?? [];
  const displayPeriods = useMemo(() => (editMode ? editPeriods : data?.periods ?? []), [editMode, editPeriods, data]);

  const yearRows = useMemo(
    () =>
      displayPeriods
        .filter((p) => p.period_type === 'year' && p.scenario === scenario)
        .sort((a, b) => a.sort_order - b.sort_order),
    [displayPeriods, scenario]
  );
  const quarterRows = useMemo(
    () =>
      displayPeriods
        .filter((p) => p.period_type === 'quarter' && p.scenario === scenario)
        .sort((a, b) => a.sort_order - b.sort_order),
    [displayPeriods, scenario]
  );
  const narrativeBySection = useMemo(() => {
    const map = new Map<NarrativeSection, ForecastNarrative>();
    (data?.narrative ?? []).forEach((n) => map.set(n.section, n));
    return map;
  }, [data]);

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <PurpleLoader size="md" />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert color="red" variant="light">
        <Text size="sm">{error}</Text>
      </Alert>
    );
  }

  if (!data?.run) {
    return (
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={4}>Forecast</Title>
          <Button
            size="xs"
            variant="light"
            color="grape"
            leftSection={<IconSparkles size={14} />}
            onClick={startGeneration}
            loading={generating}
          >
            {generating ? 'Generating…' : 'Generate Forecast'}
          </Button>
        </Group>
        <Alert icon={<IconChartLine size={18} />} color="gray" variant="light">
          <Text size="sm">
            No forecast has been generated for this epic ({epicAhaId}) yet. Click <b>Generate Forecast</b> to
            run market research, pricing, and the revenue model from scratch — this can take a minute or two.
          </Text>
        </Alert>
      </Stack>
    );
  }

  const { run } = data;
  const isViewingHistorical = viewingRunId !== null && viewingRunId !== run.id;

  // Generated forecasts use fixed canonical assumption keys (see orchestrator.ts) so a real
  // formula can be shown; migrated forecasts have LLM-improvised keys per product and no stored
  // formula at all (the numbers came from extracting a hand-built document — see the Phase 3
  // commit for why those aren't force-fit into one recompute). Either way we only ever derive
  // *from the row's own stored numbers* — never re-simulate the ramp — so nothing shown here can
  // drift from what's actually displayed in the table.
  const renderRowExplanation = (row: ForecastPeriod) => {
    const assumptions = data.assumptions;
    const acvA = findAssumptionLike(assumptions, ['acv']);
    const poolA = findAssumptionLike(assumptions, ['eligible_pool', 'eligible pool']);
    const penetrationA = findAssumptionLike(assumptions, ['penetration']);
    const rampA = findAssumptionLike(assumptions, ['ramp']);
    const crossSellShareA = findAssumptionLike(assumptions, ['cross_sell_share', 'cross-sell share']);
    const atRiskA = findAssumptionLike(assumptions, ['at_risk', 'at-risk']);
    const protectionA = findAssumptionLike(assumptions, ['protection_rate', 'protection rate']);

    const inputRows = [acvA, poolA, penetrationA, rampA, crossSellShareA, atRiskA, protectionA].filter(
      (a): a is ForecastAssumption => Boolean(a)
    );

    const total = row.cross_sell_arr_usd + row.net_new_arr_usd;
    const crossSellPct = total > 0 ? (row.cross_sell_arr_usd / total) * 100 : null;
    const netNewPct = total > 0 ? (row.net_new_arr_usd / total) * 100 : null;

    const acv = parseNumeric(acvA ? assumptionValueForScenario(acvA, scenario) : null);
    const impliedAcvMonths = acv && acv > 0 ? total / (acv / 12) : null;

    const atRisk = parseNumeric(atRiskA ? assumptionValueForScenario(atRiskA, scenario) : null);
    const protectedPctOfAtRisk = atRisk && atRisk > 0 ? (row.churn_reduction_arr_usd / atRisk) * 100 : null;

    // For a generated run, the exact months that sum into this row are already in the fetched
    // data (see getConstituentMonths above) — show the real arithmetic, not an approximation.
    const constituentMonths = row.period_type !== 'month' ? getConstituentMonths(row, data.periods) : [];

    return (
      <Stack gap="sm" py="sm" px="md">
        {inputRows.length > 0 && (
          <div>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={4}>
              Inputs used — {scenarioLabel(scenario)}
            </Text>
            <Table withTableBorder={false} withColumnBorders={false} verticalSpacing={2}>
              <Table.Tbody>
                {inputRows.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td style={{ border: 'none' }}>
                      <Text size="xs">{a.label}</Text>
                    </Table.Td>
                    <Table.Td style={{ border: 'none' }}>
                      <Text size="xs" fw={600}>{assumptionValueForScenario(a, scenario) ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td style={{ border: 'none' }}>
                      <Badge size="xs" color={CONFIDENCE_COLOR[a.confidence]} variant="light">
                        {CONFIDENCE_LABEL[a.confidence]}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}

        <div>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={4}>
            This row&apos;s numbers
          </Text>
          <Text size="xs">
            Cross-sell {formatUsd(row.cross_sell_arr_usd)}{crossSellPct !== null ? ` (${crossSellPct.toFixed(0)}% of bookings)` : ''} + net-new{' '}
            {formatUsd(row.net_new_arr_usd)}{netNewPct !== null ? ` (${netNewPct.toFixed(0)}%)` : ''} = total bookings {formatUsd(total)}.
          </Text>

          {constituentMonths.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <Text size="xs" c="dimmed" mb={4}>
                The engine computes bookings month by month as adopting accounts ramp in, then sums them into this
                row. Here are the actual months:
              </Text>
              <Table withTableBorder={false} withColumnBorders={false} verticalSpacing={2}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ border: 'none' }}><Text size="xs" fw={600}>Month</Text></Table.Th>
                    <Table.Th style={{ border: 'none' }}><Text size="xs" fw={600}>Cross-Sell</Text></Table.Th>
                    <Table.Th style={{ border: 'none' }}><Text size="xs" fw={600}>Net New</Text></Table.Th>
                    <Table.Th style={{ border: 'none' }}><Text size="xs" fw={600}>Total</Text></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {constituentMonths.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td style={{ border: 'none' }}><Text size="xs">{formatMonthLabel(m.period_label)}</Text></Table.Td>
                      <Table.Td style={{ border: 'none' }}><Text size="xs">{formatUsd(m.cross_sell_arr_usd)}</Text></Table.Td>
                      <Table.Td style={{ border: 'none' }}><Text size="xs">{formatUsd(m.net_new_arr_usd)}</Text></Table.Td>
                      <Table.Td style={{ border: 'none' }}><Text size="xs">{formatUsd(m.total_arr_usd)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Th style={{ border: 'none' }}><Text size="xs" fw={700}>Sum</Text></Table.Th>
                    <Table.Th style={{ border: 'none' }}>
                      <Text size="xs" fw={700}>{formatUsd(constituentMonths.reduce((s, m) => s + m.cross_sell_arr_usd, 0))}</Text>
                    </Table.Th>
                    <Table.Th style={{ border: 'none' }}>
                      <Text size="xs" fw={700}>{formatUsd(constituentMonths.reduce((s, m) => s + m.net_new_arr_usd, 0))}</Text>
                    </Table.Th>
                    <Table.Th style={{ border: 'none' }}>
                      <Text size="xs" fw={700}>{formatUsd(constituentMonths.reduce((s, m) => s + m.total_arr_usd, 0))}</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
              <Text size="xs" c="dimmed" mt={4}>
                Each month = cumulative adopting accounts (eligible pool × penetration × ramp fraction reached that
                month) × ACV ÷ 12, split cross-sell/net-new by the cross-sell share above. Small rounding differences
                vs. the row total above are expected — each month is rounded independently.
              </Text>
            </div>
          ) : (
            impliedAcvMonths !== null && (
              <Text size="xs" mt={4}>
                Total bookings ÷ (ACV ÷ 12) ≈ <b>{impliedAcvMonths.toFixed(1)} months</b> of full-rate ACV realized this
                period — consistent with accounts ramping in through the period rather than a flat headcount at a single
                point in time. (Monthly detail isn&apos;t available for this run — see &quot;view original migrated document&quot;
                below for the full reasoning.)
              </Text>
            )
          )}

          {row.churn_reduction_arr_usd > 0 && (
            <Text size="xs" mt={4}>
              Protected ARR {formatUsd(row.churn_reduction_arr_usd)}
              {protectedPctOfAtRisk !== null ? ` is ${protectedPctOfAtRisk.toFixed(0)}% of the ${formatUsd(atRisk!)} at-risk pool` : ''} — tracked
              separately from bookings, never summed into the total above.
            </Text>
          )}
        </div>

        <Text size="xs" c="dimmed">
          {run.source === 'generated'
            ? 'Computed by the deterministic ramp × price × volume engine from the assumptions above (src/lib/forecast/engine.ts).'
            : 'Extracted from the original migrated forecast document — the assumptions above are as stated there. Open "view original migrated document" below for the full reasoning.'}
        </Text>
      </Stack>
    );
  };

  const renderPeriodTable = (title: string, rows: ForecastPeriod[], emptyLabel: string) => (
    <Paper withBorder p="md">
      <Title order={5} mb="sm">{title} — {scenarioLabel(scenario)}</Title>
      <Table striped withTableBorder={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{title.includes('Quarter') ? 'Quarter' : 'Year'}</Table.Th>
            <Table.Th>Cross-Sell</Table.Th>
            <Table.Th>Net New</Table.Th>
            <Table.Th>Total Bookings</Table.Th>
            <Table.Th>Protected ARR</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">{emptyLabel}</Text></Table.Td></Table.Tr>
          ) : (
            rows.map((row) =>
              editMode ? (
                <Table.Tr key={row.id}>
                  <Table.Td>{row.period_label}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={row.cross_sell_arr_usd}
                      onChange={(v) => updatePeriodField(row.id, 'cross_sell_arr_usd', Number(v) || 0)}
                      prefix="$"
                      thousandSeparator=","
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={row.net_new_arr_usd}
                      onChange={(v) => updatePeriodField(row.id, 'net_new_arr_usd', Number(v) || 0)}
                      prefix="$"
                      thousandSeparator=","
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={row.total_arr_usd}
                      onChange={(v) => updatePeriodField(row.id, 'total_arr_usd', Number(v) || 0)}
                      prefix="$"
                      thousandSeparator=","
                      fw={600}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={row.churn_reduction_arr_usd}
                      onChange={(v) => updatePeriodField(row.id, 'churn_reduction_arr_usd', Number(v) || 0)}
                      prefix="$"
                      thousandSeparator=","
                    />
                  </Table.Td>
                </Table.Tr>
              ) : (
                <React.Fragment key={row.id}>
                  <Table.Tr
                    onClick={() => setExpandedPeriodId((prev) => (prev === row.id ? null : row.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        {expandedPeriodId === row.id ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                        {row.period_label}
                      </Group>
                    </Table.Td>
                    <Table.Td>{formatUsd(row.cross_sell_arr_usd)}</Table.Td>
                    <Table.Td>{formatUsd(row.net_new_arr_usd)}</Table.Td>
                    <Table.Td fw={600}>{formatUsd(row.total_arr_usd)}</Table.Td>
                    <Table.Td>{formatUsd(row.churn_reduction_arr_usd)}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td colSpan={5} p={0} style={{ border: expandedPeriodId === row.id ? undefined : 'none' }}>
                      <Collapse in={expandedPeriodId === row.id}>
                        <div style={{ background: 'var(--color-surface, #f9fafb)' }}>{renderRowExplanation(row)}</div>
                      </Collapse>
                    </Table.Td>
                  </Table.Tr>
                </React.Fragment>
              )
            )
          )}
        </Table.Tbody>
        {!editMode && rows.length > 0 && (
          <Table.Tfoot>
            <Table.Tr>
              <Table.Th>Total</Table.Th>
              <Table.Th>{formatUsd(rows.reduce((s, r) => s + r.cross_sell_arr_usd, 0))}</Table.Th>
              <Table.Th>{formatUsd(rows.reduce((s, r) => s + r.net_new_arr_usd, 0))}</Table.Th>
              <Table.Th>{formatUsd(rows.reduce((s, r) => s + r.total_arr_usd, 0))}</Table.Th>
              <Table.Th>{formatUsd(rows.reduce((s, r) => s + r.churn_reduction_arr_usd, 0))}</Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        )}
      </Table>
    </Paper>
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Title order={4}>Forecast</Title>
        <Group gap="xs" wrap="wrap">
          {run.source === 'migrated_from_chrysalis' && (
            <Badge color="blue" variant="light">Migrated from Chrysalis repo</Badge>
          )}
          {isViewingHistorical && <Badge color="orange" variant="light">Viewing historical version</Badge>}
          <Text size="xs" c="dimmed">
            {new Date(run.created_at).toLocaleDateString()}
            {run.created_by ? ` · ${run.created_by}` : ''}
          </Text>
          {versions.length > 1 && (
            <Select
              size="xs"
              w={220}
              value={viewingRunId ?? versions.find((v) => v.is_current)?.id ?? null}
              data={versions.map((v) => ({
                value: v.id,
                label: `${new Date(v.created_at).toLocaleDateString()} — ${v.source === 'migrated_from_chrysalis' ? 'migrated' : 'edited'}${v.is_current ? ' (current)' : ''}`,
              }))}
              onChange={(v) => v && selectVersion(v === versions.find((x) => x.is_current)?.id ? null : v)}
            />
          )}
          {!editMode ? (
            <Group gap={4}>
              <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={startEditing} disabled={isViewingHistorical || generating}>
                Edit
              </Button>
              <Button
                size="xs"
                variant="light"
                color="grape"
                leftSection={<IconSparkles size={14} />}
                onClick={startGeneration}
                loading={generating}
                disabled={isViewingHistorical}
              >
                {generating ? 'Generating…' : 'Generate Forecast'}
              </Button>
            </Group>
          ) : (
            <Group gap={4}>
              <Button size="xs" color="green" leftSection={<IconDeviceFloppy size={14} />} loading={saving} onClick={saveNewVersion}>
                Save New Version
              </Button>
              <Button size="xs" variant="subtle" color="gray" leftSection={<IconX size={14} />} onClick={cancelEditing} disabled={saving}>
                Cancel
              </Button>
            </Group>
          )}
        </Group>
      </Group>

      <Group justify="space-between" wrap="wrap">
        <SegmentedControl
          value={scenario}
          onChange={(v) => setScenario(v as Scenario)}
          data={[
            { label: 'Bear', value: 'bear' },
            { label: 'Base', value: 'base' },
            { label: 'Bull', value: 'bull' },
          ]}
          style={{ maxWidth: 300 }}
        />
        <SegmentedControl
          value={periodView}
          onChange={(v) => setPeriodView(v as 'year' | 'quarter')}
          data={[
            { label: 'Yearly', value: 'year' },
            { label: 'Quarterly', value: 'quarter' },
          ]}
          style={{ maxWidth: 220 }}
        />
      </Group>

      {periodView === 'year'
        ? renderPeriodTable('New Bookings by Year', yearRows, 'No annual figures for this scenario.')
        : renderPeriodTable('Quarterly Detail', quarterRows, 'No quarterly figures for this scenario.')}

      <Paper withBorder p="md">
        <Title order={5} mb="sm">Assumptions</Title>
        <Table striped withTableBorder={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Assumption</Table.Th>
              <Table.Th>Bear</Table.Th>
              <Table.Th>Base</Table.Th>
              <Table.Th>Bull</Table.Th>
              <Table.Th>Confidence</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {displayAssumptions.map((a) =>
              editMode ? (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{a.label}</Text>
                    {a.source_note && <Text size="xs" c="dimmed">{a.source_note}</Text>}
                  </Table.Td>
                  <Table.Td>
                    <TextInput size="xs" value={a.value_bear ?? ''} onChange={(e) => updateAssumptionField(a.id, 'value_bear', e.currentTarget.value)} />
                  </Table.Td>
                  <Table.Td>
                    <TextInput size="xs" value={a.value_base ?? ''} onChange={(e) => updateAssumptionField(a.id, 'value_base', e.currentTarget.value)} />
                  </Table.Td>
                  <Table.Td>
                    <TextInput size="xs" value={a.value_bull ?? ''} onChange={(e) => updateAssumptionField(a.id, 'value_bull', e.currentTarget.value)} />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      w={140}
                      data={CONFIDENCE_OPTIONS}
                      value={a.confidence}
                      onChange={(v) => v && updateAssumptionField(a.id, 'confidence', v)}
                    />
                  </Table.Td>
                </Table.Tr>
              ) : (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{a.label}</Text>
                    {a.source_note && <Text size="xs" c="dimmed">{a.source_note}</Text>}
                    {a.overridden_by && (
                      <Text size="xs" c="orange">Edited by {a.overridden_by}{a.overridden_at ? ` on ${new Date(a.overridden_at).toLocaleDateString()}` : ''}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>{a.value_bear ?? '—'}</Table.Td>
                  <Table.Td fw={600}>{a.value_base ?? '—'}</Table.Td>
                  <Table.Td>{a.value_bull ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={CONFIDENCE_COLOR[a.confidence]} variant="light" size="sm">
                      {CONFIDENCE_LABEL[a.confidence]}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              )
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      {NARRATIVE_ORDER.filter((s) => narrativeBySection.has(s)).map((section) => (
        <Paper withBorder p="md" key={section}>
          <Title order={5} mb="sm">{NARRATIVE_TITLE[section]}</Title>
          <MarkdownLite content={narrativeBySection.get(section)!.content} />
        </Paper>
      ))}

      <Group>
        <Anchor size="sm" onClick={loadRawMarkdown} style={{ cursor: 'pointer' }}>
          {rawLoading ? 'Loading…' : showRaw ? 'Hide original migrated document' : 'View original migrated document'}
        </Anchor>
      </Group>
      {showRaw && rawMarkdown && (
        <Paper withBorder p="md" style={{ maxHeight: 500, overflow: 'auto' }}>
          <Text size="xs" c="dimmed" mb="xs">
            Archived verbatim from the Chrysalis product-requirements repo at migration time — the
            record of truth if anything above looks off.
          </Text>
          <Text size="xs" component="pre" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
            {rawMarkdown.raw_markdown_forecast}
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
