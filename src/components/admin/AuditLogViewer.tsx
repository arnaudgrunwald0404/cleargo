'use client';
import { useEffect, useState } from 'react';
import { Table, Select, Button, Group, Text, Pagination, Paper, Badge } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { UserDisplay } from '../UserDisplay';

interface AuditLog {
  id: string;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  taken_at: string;
  json_diff: any;
  actor: {
    name: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  };
}

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [page, entityTypeFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });

      if (entityTypeFilter) {
        params.append('entity_type', entityTypeFilter);
      }

      const res = await fetch(`/api/admin/audit?${params}`);
      if (!res.ok) throw new Error('Failed to fetch audit logs');

      const result = await res.json();
      setLogs(result.data || []);
      setTotalPages(result.meta?.totalPages || 1);
    } catch (error) {
      console.error(error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load audit logs',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Actor', 'Entity Type', 'Entity ID', 'Changes'];
    const rows = logs.map((log) => {
      const actor = log.actor;
      const actorName =
        actor?.name ||
        (actor?.first_name && actor?.last_name
          ? `${actor.first_name} ${actor.last_name}`.trim()
          : actor?.first_name || actor?.last_name || actor?.email || 'Unknown');
      return [
        new Date(log.taken_at).toLocaleString(),
        actorName,
        log.entity_type,
        log.entity_id,
        JSON.stringify(log.json_diff),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Group>
          <Select
            placeholder="Filter by entity type"
            data={[
              { value: 'epic', label: 'Epic' },
              { value: 'criterion', label: 'Criterion' },
              { value: 'epic_criterion_status', label: 'Criterion Status' },
              { value: 'product', label: 'Product' },
            ]}
            value={entityTypeFilter}
            onChange={setEntityTypeFilter}
            clearable
            style={{ width: 200 }}
          />
        </Group>
        <Button onClick={exportToCSV} variant="outline" disabled={logs.length === 0}>
          Export to CSV
        </Button>
      </Group>

      <Paper withBorder>
        {loading ? (
          <Text p="md" c="dimmed">
            Loading...
          </Text>
        ) : logs.length === 0 ? (
          <Text p="md" c="dimmed">
            No audit logs found
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Actor</Table.Th>
                <Table.Th>Entity Type</Table.Th>
                <Table.Th>Entity ID</Table.Th>
                <Table.Th>Changes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logs.map((log) => (
                <Table.Tr key={log.id}>
                  <Table.Td>
                    <Text size="sm">{new Date(log.taken_at).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    <UserDisplay
                      email={log.actor?.email}
                      firstName={log.actor?.first_name}
                      lastName={log.actor?.last_name}
                      avatarUrl={log.actor?.avatar_url}
                      name={log.actor?.name}
                      size="sm"
                    />
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{log.entity_type}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                      {log.entity_id.substring(0, 8)}...
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" lineClamp={2} title={JSON.stringify(log.json_diff, null, 2)}>
                      {JSON.stringify(log.json_diff)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      )}
    </div>
  );
}
