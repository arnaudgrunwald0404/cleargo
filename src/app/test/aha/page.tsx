'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Button,
  Stack,
  Paper,
  Text,
  Group,
  JsonInput,
  Select,
  TextInput,
  Alert,
  Code,
  Tabs,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconRefresh } from '@tabler/icons-react';

export default function AhaTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [epicId, setEpicId] = useState('');
  const [customFields, setCustomFields] = useState(`{
  "gtm_visibility": "Tier 2",
  "estimated_ga_release_pm_owned": "2025-12-15"
}`);

  const testConnection = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/aha?action=test-connection');
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Connection test failed');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const listProducts = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/aha?action=products');
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to list products');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const listEpics = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/aha?action=list');
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to list epics');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getEpicDetails = async () => {
    if (!epicId) {
      setError('Please enter an Epic ID');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/test/aha?action=get&epicId=${encodeURIComponent(epicId)}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to fetch epic');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getEpicFields = async () => {
    if (!epicId) {
      setError('Please enter an Epic ID');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/test/aha?action=fields&epicId=${encodeURIComponent(epicId)}`
      );
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to fetch epic fields');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const testWriteBack = async () => {
    if (!epicId) {
      setError('Please enter an Epic ID');
      return;
    }

    let parsedFields;
    try {
      parsedFields = JSON.parse(customFields);
    } catch (err) {
      setError('Invalid JSON in custom fields');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/aha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epicId,
          customFields: parsedFields,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Write-back failed');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1}>Aha! Integration Test Console</Title>
          <Text c="dimmed" mt="xs">
            Test Aha! API connectivity, data retrieval, and write-back functionality
          </Text>
        </div>

        <Tabs defaultValue="read">
          <Tabs.List>
            <Tabs.Tab value="read">Read Data</Tabs.Tab>
            <Tabs.Tab value="write">Write Back</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="read" pt="lg">
            <Stack gap="md">
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <div>
                    <Text fw={500} mb="xs">
                      Connection Test
                    </Text>
                    <Text size="sm" c="dimmed" mb="md">
                      Verify API credentials and connectivity to Aha!
                    </Text>
                    <Button
                      onClick={testConnection}
                      loading={loading}
                      leftSection={<IconRefresh size={16} />}
                    >
                      Test Connection
                    </Button>
                  </div>
                </Stack>
              </Paper>

              <Paper p="md" withBorder>
                <Stack gap="md">
                  <div>
                    <Text fw={500} mb="xs">
                      List Products/Workspaces
                    </Text>
                    <Text size="sm" c="dimmed" mb="md">
                      Discover available products (workspaces) in your Aha! account
                    </Text>
                    <Button
                      onClick={listProducts}
                      loading={loading}
                      leftSection={<IconRefresh size={16} />}
                    >
                      List Products
                    </Button>
                  </div>
                </Stack>
              </Paper>

              <Paper p="md" withBorder>
                <Stack gap="md">
                  <div>
                    <Text fw={500} mb="xs">
                      List Epics
                    </Text>
                    <Text size="sm" c="dimmed" mb="md">
                      Fetch the first 10 epics from Aha!
                    </Text>
                    <Button
                      onClick={listEpics}
                      loading={loading}
                      leftSection={<IconRefresh size={16} />}
                    >
                      List Epics
                    </Button>
                  </div>
                </Stack>
              </Paper>

              <Paper p="md" withBorder>
                <Stack gap="md">
                  <div>
                    <Text fw={500} mb="xs">
                      Get Epic Details
                    </Text>
                    <Text size="sm" c="dimmed" mb="md">
                      Fetch detailed information for a specific epic
                    </Text>
                    <TextInput
                      label="Epic ID or Reference Number"
                      placeholder="e.g., EPIC-123 or epic-id"
                      value={epicId}
                      onChange={(e) => setEpicId(e.target.value)}
                      mb="md"
                    />
                    <Group>
                      <Button
                        onClick={getEpicDetails}
                        loading={loading}
                        leftSection={<IconRefresh size={16} />}
                      >
                        Get Full Epic
                      </Button>
                      <Button
                        onClick={getEpicFields}
                        loading={loading}
                        variant="light"
                        leftSection={<IconRefresh size={16} />}
                      >
                        Get Custom Fields Only
                      </Button>
                    </Group>
                  </div>
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="write" pt="lg">
            <Paper p="md" withBorder>
              <Stack gap="md">
                <div>
                  <Text fw={500} mb="xs">
                    Write-Back Test
                  </Text>
                  <Text size="sm" c="dimmed" mb="md">
                    Test writing custom field values back to an Aha! epic
                  </Text>
                </div>

                <TextInput
                  label="Epic ID or Reference Number"
                  placeholder="e.g., EPIC-123"
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  required
                />

                <JsonInput
                  label="Custom Fields (JSON)"
                  description="Enter the custom field keys and values to write back"
                  placeholder='{"field_key": "value"}'
                  value={customFields}
                  onChange={setCustomFields}
                  minRows={8}
                  maxRows={12}
                  formatOnBlur
                  autosize
                />

                <Alert color="blue" icon={<IconAlertCircle size={16} />}>
                  <Text size="sm">
                    <strong>Write-back field keys (Phase 1):</strong>
                    <br />
                    <strong>Readiness fields:</strong>
                    <br />
                    • launch_readiness_status (Go/Conditional Go/No Go)
                    <br />
                    • launch_readiness_score_pct (0-100)
                    <br />
                    • launch_risk (Low/Medium/High)
                    <br />
                    • launch_go_no_go_decision_date (YYYY-MM-DD)
                    <br />
                    • launch_console_url (URL)
                    <br />
                    <strong>Core launch fields:</strong>
                    <br />
                    • launch_tier (Tier 1/Tier 2/Tier 3)
                    <br />• estimated_ga_release_pm_owned (YYYY-MM-DD)
                  </Text>
                </Alert>

                <Button onClick={testWriteBack} loading={loading} color="orange">
                  Execute Write-Back
                </Button>
              </Stack>
            </Paper>
          </Tabs.Panel>
        </Tabs>

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />} title="Error">
            {error}
          </Alert>
        )}

        {result && (
          <Paper p="md" withBorder>
            <Group mb="md">
              <IconCheck size={20} color="green" />
              <Text fw={500}>Response</Text>
            </Group>
            <Code block style={{ maxHeight: '500px', overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </Code>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
