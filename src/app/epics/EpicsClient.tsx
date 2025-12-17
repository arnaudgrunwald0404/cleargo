'use client';
import { useEffect, useState } from 'react';
import { Epic } from '@/types/epics';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TextInput,
  Select,
  Group,
  Card,
  Box,
  ActionIcon,
  Badge,
  Button,
  Title,
  Text,
  Alert,
  Stack,
} from '@mantine/core';
import {
  IconSearch,
  IconX,
  IconFilter,
  IconDownload,
  IconAlertCircle,
  IconCheck,
} from '@tabler/icons-react';

interface EpicsClientProps {
  initialEpics?: Epic[];
}

export default function EpicsClient({ initialEpics = [] }: EpicsClientProps) {
  const router = useRouter();
  const [epics, setEpics] = useState<Epic[]>(initialEpics);
  const [releaseSchedule, setReleaseSchedule] = useState<
    Array<{ release_name: string; launch_date: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [ahaId, setAhaId] = useState('');

  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    tier: 'ALL',
    status: 'ALL',
    risk: 'ALL',
  });
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    // Only load additional data if we don't have initial epics
    if (initialEpics.length === 0) {
      loadData();
    } else {
      // Still load releases
      fetch('/api/releases', { credentials: 'include' }).then((releasesRes) => {
        if (releasesRes.ok) {
          releasesRes.json().then((data) => setReleaseSchedule(data || []));
        }
      });
    }
  }, [initialEpics.length]);

  async function loadData() {
    try {
      setLoading(true);

      // Fast auth check: if not signed in, send to home/Welcome
      const me = await fetch('/api/me', { credentials: 'include' });
      if (me.status === 401) {
        router.push('/');
        return;
      }

      const [epicsRes, releasesRes] = await Promise.all([
        fetch('/api/epics', { credentials: 'include' }),
        fetch('/api/releases', { credentials: 'include' }),
      ]);

      if (epicsRes.status === 401) {
        router.push('/');
        return;
      }
      if (!epicsRes.ok) throw new Error('Failed to fetch epics');
      const epicsData = await epicsRes.json();
      setEpics(epicsData);

      if (releasesRes.ok) {
        const releasesData = await releasesRes.json();
        setReleaseSchedule(releasesData || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImportSuccess(null);
    setImportLoading(true);

    try {
      const res = await fetch('/api/epics/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ aha_id: ahaId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.existingEpicId) {
          // Epic already exists - redirect to it
          router.push(`/epics/${data.existingEpicId}`);
          return;
        }
        throw new Error(data.error || 'Failed to import epic');
      }

      // Success - add the new epic to the list and show success message
      setEpics([data.epic, ...epics]);
      setImportSuccess(`Successfully imported "${data.epic.name}"`);
      setAhaId('');

      // Redirect to the new epic after a brief delay
      setTimeout(() => {
        router.push(`/epics/${data.epic.id}`);
      }, 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImportLoading(false);
    }
  }

  const filteredEpics = epics.filter((l) => {
    if (filters.search && !l.name.toLowerCase().includes(filters.search.toLowerCase()))
      return false;
    if (filters.tier !== 'ALL' && l.tier !== filters.tier) return false;
    if (filters.status !== 'ALL' && l.status !== filters.status) return false;
    if (filters.risk !== 'ALL' && (l.risk_level || 'LOW') !== filters.risk) return false;
    return true;
  });

  // Extract release name from epic's aha_fields
  const getReleaseName = (epic: Epic): string | null => {
    if (!epic.aha_fields || typeof epic.aha_fields !== 'object') return null;
    const fields = epic.aha_fields as any;

    // Check standard fields
    if (fields.standard_fields && typeof fields.standard_fields === 'object') {
      const standardFields = fields.standard_fields;
      const releaseName = standardFields?.aha_release_name || standardFields?.release?.name || null;
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

  // Create a map of release names to dates from release schedule
  const releaseDateMap = new Map<string, string | null>();
  releaseSchedule.forEach((release) => {
    if (release.release_name) {
      releaseDateMap.set(release.release_name, release.launch_date);
    }
  });

  // Group epics by release
  const releaseGroupsMap = new Map<string, Epic[]>();
  const ungroupedEpics: Epic[] = [];

  filteredEpics.forEach((epic) => {
    const releaseName = getReleaseName(epic);
    if (releaseName) {
      if (!releaseGroupsMap.has(releaseName)) {
        releaseGroupsMap.set(releaseName, []);
      }
      releaseGroupsMap.get(releaseName)!.push(epic);
    } else {
      ungroupedEpics.push(epic);
    }
  });

  // Convert to array and sort by release date
  const releaseGroups: Array<{ releaseName: string; releaseDate: string | null; epics: Epic[] }> =
    Array.from(releaseGroupsMap.entries()).map(([releaseName, epics]) => ({
      releaseName,
      releaseDate: releaseDateMap.get(releaseName) || null,
      epics,
    }));

  // Sort release groups by date (ascending), with null dates at the end
  releaseGroups.sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return 0;
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
  });

  // Add ungrouped epics as a separate group at the end
  if (ungroupedEpics.length > 0) {
    releaseGroups.push({
      releaseName: 'Ungrouped',
      releaseDate: null,
      epics: ungroupedEpics,
    });
  }

  if (loading) return <div className="pt-24 p-8">Loading...</div>;

  return (
    <div className="pt-24 pb-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <Group justify="space-between" align="flex-start" mb="xl">
        <Box>
          <Title order={1} mb="xs" style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>
            Epics
          </Title>
          <Text size="sm" c="dimmed" style={{ fontFamily: "'Public Sans', sans-serif" }}>
            Epics appear here if: Launch Candidate = true OR tags contain &quot;LaunchConsole&quot;
          </Text>
        </Box>
        <Button
          leftSection={<IconDownload size={16} />}
          onClick={() => {
            setShowImport(!showImport);
            setError(null);
            setImportSuccess(null);
          }}
          variant={showImport ? 'subtle' : 'filled'}
          color="indigo"
        >
          {showImport ? 'Cancel' : 'Import from Aha'}
        </Button>
      </Group>

      {/* Modern Search and Filters */}
      <Box
        style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        }}
        mb="md"
      >
        <Group justify="space-between" align="center" mb={showFilters ? 'md' : 0}>
          <Group gap="md" style={{ flex: 1 }}>
            <TextInput
              placeholder="Search epics..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              leftSection={<IconSearch size={16} />}
              rightSection={
                filters.search && (
                  <ActionIcon
                    size="sm"
                    variant="transparent"
                    onClick={() => setFilters({ ...filters, search: '' })}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )
              }
              style={{ flex: 1, maxWidth: 400 }}
            />
            <ActionIcon
              variant={showFilters ? 'filled' : 'subtle'}
              color="indigo"
              onClick={() => setShowFilters(!showFilters)}
              size="lg"
            >
              <IconFilter size={18} />
            </ActionIcon>
          </Group>
          {(filters.tier !== 'ALL' ||
            filters.status !== 'ALL' ||
            filters.risk !== 'ALL' ||
            filters.search) && (
            <Badge
              variant="light"
              color="indigo"
              size="lg"
              rightSection={
                <ActionIcon
                  size="xs"
                  color="indigo"
                  radius="xl"
                  variant="transparent"
                  onClick={() =>
                    setFilters({ search: '', tier: 'ALL', status: 'ALL', risk: 'ALL' })
                  }
                >
                  <IconX size={12} />
                </ActionIcon>
              }
            >
              {
                [
                  filters.search && 'Search',
                  filters.tier !== 'ALL' && filters.tier,
                  filters.status !== 'ALL' && filters.status,
                  filters.risk !== 'ALL' && filters.risk,
                ].filter(Boolean).length
              }{' '}
              active
            </Badge>
          )}
        </Group>

        {showFilters && (
          <Group gap="md" mt="md">
            <Select
              label="Tier"
              placeholder="All Tiers"
              value={filters.tier}
              onChange={(value) => setFilters({ ...filters, tier: value || 'ALL' })}
              data={[
                { value: 'ALL', label: 'All Tiers' },
                { value: 'TIER_1', label: 'Tier 1' },
                { value: 'TIER_2', label: 'Tier 2' },
                { value: 'TIER_3', label: 'Tier 3' },
              ]}
              clearable
              style={{ flex: 1 }}
            />
            <Select
              label="Status"
              placeholder="All Statuses"
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value || 'ALL' })}
              data={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'PLANNED', label: 'Planned' },
                { value: 'PRE_LAUNCH', label: 'Pre-Launch' },
                { value: 'LAUNCHING', label: 'Launching' },
                { value: 'LAUNCHED', label: 'Launched' },
              ]}
              clearable
              style={{ flex: 1 }}
            />
            <Select
              label="Risk Level"
              placeholder="All Risks"
              value={filters.risk}
              onChange={(value) => setFilters({ ...filters, risk: value || 'ALL' })}
              data={[
                { value: 'ALL', label: 'All Risks' },
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
              ]}
              clearable
              style={{ flex: 1 }}
            />
          </Group>
        )}
      </Box>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="xl">
          {error}
        </Alert>
      )}

      {releaseGroups.length === 0 ? (
        <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
          <div className="px-4 py-8 text-center text-gray-500">
            No epics found matching filters.
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {releaseGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {group.releaseName}
                {group.releaseDate && (
                  <span className="ml-2 text-base font-normal text-gray-600">
                    - {new Date(group.releaseDate).toLocaleDateString()}
                  </span>
                )}
              </h2>
              <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                <table className="min-w-full divide-y divide-purple-200 table-fixed">
                  <colgroup>
                    <col className="w-auto" />
                    <col className="w-24" />
                    <col className="w-auto" />
                    <col className="w-32" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col className="w-24" />
                  </colgroup>
                  <thead className="bg-purple-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Tier
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">
                        Product
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Readiness
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-24">
                        Risk
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-24">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-purple-200">
                    {group.epics.map((epic) => (
                      <tr key={epic.id} className="hover:bg-purple-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/epics/${epic.id}`}
                            prefetch={false}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {epic.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              epic.tier === 'TIER_1'
                                ? 'bg-purple-100 text-purple-800'
                                : epic.tier === 'TIER_2'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {epic.tier.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {(epic as any).product?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">
                          {epic.target_launch_date
                            ? new Date(epic.target_launch_date).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            {epic.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700 whitespace-nowrap w-24">
                          {epic.readiness_score
                            ? `${Math.round(epic.readiness_score * 100)}%`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap w-24">
                          {epic.risk_level && (
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                epic.risk_level === 'HIGH'
                                  ? 'bg-red-100 text-red-800'
                                  : epic.risk_level === 'MEDIUM'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {epic.risk_level}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap w-24">
                          <Link
                            href={`/epics/${epic.id}`}
                            prefetch={false}
                            className="text-sm text-gray-600 hover:text-gray-900"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showImport && (
        <Card shadow="sm" padding="lg" radius="md" withBorder mb="xl">
          <Title order={2} mb="lg" style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>
            Import Epic from Aha
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            Enter the Aha epic reference number (e.g., &quot;EPIC-123&quot;) to import it into the
            Launch Console.
          </Text>
          {importSuccess && (
            <Alert icon={<IconCheck size={16} />} title="Success" color="green" mb="md">
              {importSuccess}
            </Alert>
          )}
          <form onSubmit={handleImport}>
            <Stack gap="md">
              <TextInput
                label="Aha Epic ID"
                placeholder="e.g., EPIC-123"
                required
                value={ahaId}
                onChange={(e) => setAhaId(e.target.value)}
                disabled={importLoading}
              />

              <Group justify="flex-end" mt="md">
                <Button
                  variant="subtle"
                  onClick={() => {
                    setShowImport(false);
                    setError(null);
                    setImportSuccess(null);
                    setAhaId('');
                  }}
                  disabled={importLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="indigo"
                  leftSection={<IconDownload size={16} />}
                  loading={importLoading}
                >
                  Import Epic
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      )}
    </div>
  );
}
