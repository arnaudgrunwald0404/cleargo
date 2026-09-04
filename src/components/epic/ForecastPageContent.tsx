"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
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
import { IconChartLine, IconPencil, IconDeviceFloppy, IconX, IconSparkles } from '@tabler/icons-react';
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

export function ForecastPageContent({ epicAhaId }: ForecastPageContentProps) {
  const [data, setData] = useState<ForecastCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>('base');
  const [rawMarkdown, setRawMarkdown] = useState<{ raw_markdown_forecast: string | null; raw_markdown_assumptions: string | null } | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const [versions, setVersions] = useState<ForecastVersion[]>([]);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null); // null = current

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editAssumptions, setEditAssumptions] = useState<ForecastAssumption[]>([]);
  const [editPeriods, setEditPeriods] = useState<ForecastPeriod[]>([]);

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
                <Table.Tr key={row.id}>
                  <Table.Td>{row.period_label}</Table.Td>
                  <Table.Td>{formatUsd(row.cross_sell_arr_usd)}</Table.Td>
                  <Table.Td>{formatUsd(row.net_new_arr_usd)}</Table.Td>
                  <Table.Td fw={600}>{formatUsd(row.total_arr_usd)}</Table.Td>
                  <Table.Td>{formatUsd(row.churn_reduction_arr_usd)}</Table.Td>
                </Table.Tr>
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

      {renderPeriodTable('New Bookings by Year', yearRows, 'No annual figures for this scenario.')}
      {(quarterRows.length > 0 || editMode) &&
        renderPeriodTable('Quarterly Detail', quarterRows, 'No quarterly figures for this scenario.')}

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
