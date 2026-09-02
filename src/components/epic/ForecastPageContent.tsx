"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
  Anchor,
} from '@mantine/core';
import { IconChartLine } from '@tabler/icons-react';
import { PurpleLoader } from '../PurpleLoader';
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

export function ForecastPageContent({ epicAhaId }: ForecastPageContentProps) {
  const [data, setData] = useState<ForecastCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>('base');
  const [rawMarkdown, setRawMarkdown] = useState<{ raw_markdown_forecast: string | null; raw_markdown_assumptions: string | null } | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const fetchForecast = async () => {
    try {
      const res = await fetchWithRateLimit(`/api/forecasts/${encodeURIComponent(epicAhaId)}/current`, { maxRetries: 1 });
      if (!res.ok) throw new Error(`Failed to load forecast (${res.status})`);
      const json = (await res.json()) as ForecastCurrentResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (epicAhaId) {
      fetchForecast();
    }
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

  const yearRows = useMemo(
    () =>
      (data?.periods ?? [])
        .filter((p) => p.period_type === 'year' && p.scenario === scenario)
        .sort((a, b) => a.sort_order - b.sort_order),
    [data, scenario]
  );
  const quarterRows = useMemo(
    () =>
      (data?.periods ?? [])
        .filter((p) => p.period_type === 'quarter' && p.scenario === scenario)
        .sort((a, b) => a.sort_order - b.sort_order),
    [data, scenario]
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
        <Title order={4}>Forecast</Title>
        <Alert icon={<IconChartLine size={18} />} color="gray" variant="light">
          <Text size="sm">No forecast has been generated for this epic ({epicAhaId}) yet.</Text>
        </Alert>
      </Stack>
    );
  }

  const { run, assumptions } = data;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Title order={4}>Forecast</Title>
        <Group gap="xs">
          {run.source === 'migrated_from_chrysalis' && (
            <Badge color="blue" variant="light">Migrated from Chrysalis repo</Badge>
          )}
          <Text size="xs" c="dimmed">
            Generated {new Date(run.created_at).toLocaleDateString()}
            {run.created_by ? ` by ${run.created_by}` : ''}
          </Text>
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

      <Paper withBorder p="md">
        <Title order={5} mb="sm">New Bookings by Year — {scenario[0].toUpperCase() + scenario.slice(1)}</Title>
        <Table striped withTableBorder={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Year</Table.Th>
              <Table.Th>Cross-Sell</Table.Th>
              <Table.Th>Net New</Table.Th>
              <Table.Th>Total Bookings</Table.Th>
              <Table.Th>Protected ARR</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {yearRows.length === 0 ? (
              <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">No annual figures extracted for this scenario.</Text></Table.Td></Table.Tr>
            ) : (
              yearRows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>{row.period_label}</Table.Td>
                  <Table.Td>{formatUsd(row.cross_sell_arr_usd)}</Table.Td>
                  <Table.Td>{formatUsd(row.net_new_arr_usd)}</Table.Td>
                  <Table.Td fw={600}>{formatUsd(row.total_arr_usd)}</Table.Td>
                  <Table.Td>{formatUsd(row.churn_reduction_arr_usd)}</Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
          {yearRows.length > 0 && (
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th>3-Year Total</Table.Th>
                <Table.Th>{formatUsd(yearRows.reduce((s, r) => s + r.cross_sell_arr_usd, 0))}</Table.Th>
                <Table.Th>{formatUsd(yearRows.reduce((s, r) => s + r.net_new_arr_usd, 0))}</Table.Th>
                <Table.Th>{formatUsd(yearRows.reduce((s, r) => s + r.total_arr_usd, 0))}</Table.Th>
                <Table.Th>{formatUsd(yearRows.reduce((s, r) => s + r.churn_reduction_arr_usd, 0))}</Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          )}
        </Table>
      </Paper>

      {quarterRows.length > 0 && (
        <Paper withBorder p="md">
          <Title order={5} mb="sm">Quarterly Detail — {scenario[0].toUpperCase() + scenario.slice(1)}</Title>
          <Table striped withTableBorder={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Quarter</Table.Th>
                <Table.Th>Cross-Sell</Table.Th>
                <Table.Th>Net New</Table.Th>
                <Table.Th>Total Bookings</Table.Th>
                <Table.Th>Protected ARR</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {quarterRows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>{row.period_label}</Table.Td>
                  <Table.Td>{formatUsd(row.cross_sell_arr_usd)}</Table.Td>
                  <Table.Td>{formatUsd(row.net_new_arr_usd)}</Table.Td>
                  <Table.Td fw={600}>{formatUsd(row.total_arr_usd)}</Table.Td>
                  <Table.Td>{formatUsd(row.churn_reduction_arr_usd)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

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
            {assumptions.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>{a.label}</Text>
                  {a.source_note && <Text size="xs" c="dimmed">{a.source_note}</Text>}
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
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {NARRATIVE_ORDER.filter((s) => narrativeBySection.has(s)).map((section) => (
        <Paper withBorder p="md" key={section}>
          <Title order={5} mb="sm">{NARRATIVE_TITLE[section]}</Title>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{narrativeBySection.get(section)!.content}</Text>
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
