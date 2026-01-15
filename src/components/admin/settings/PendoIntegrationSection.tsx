"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  TextInput,
  Select,
  Alert,
  Badge,
  Group,
  Stack,
  Text,
  Divider,
  List,
  Anchor,
} from "@mantine/core";
import { IconCheck, IconX, IconAlertCircle, IconInfoCircle, IconExternalLink } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

interface PendoIntegration {
  id: string;
  environment: string;
  last_sync: string | null;
  status: 'connected' | 'disconnected' | 'error';
  created_at: string;
  updated_at: string;
}

export default function PendoIntegrationSection() {
  const [integration, setIntegration] = useState<PendoIntegration | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<'prod' | 'dev' | 'staging'>('prod');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    fetchIntegration();
  }, []);

  const fetchIntegration = async () => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    
    fetchingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/settings/success-measurement/pendo');
      if (res.ok) {
        const data = await res.json();
        setIntegration(data.integration);
        if (data.integration) {
          setEnvironment(data.integration.environment || 'prod');
        }
      }
    } catch (error) {
      console.error('Failed to fetch Pendo integration:', error);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey) {
      setError('Please enter an API key first');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch('/api/settings/success-measurement/pendo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key_encrypted: apiKey,
          environment,
        }),
      });

      if (res.ok) {
        setTestResult(true);
        await fetchIntegration();
        notifications.show({
          title: 'Connection Test Successful',
          message: 'Successfully connected to Pendo API. You can now save the configuration.',
          color: 'green',
        });
      } else {
        const errorData = await res.json();
        const errorMessage = errorData.error || errorData.details || 'Connection test failed';
        setTestResult(false);
        setError(errorMessage);
        notifications.show({
          title: 'Connection Test Failed',
          message: errorMessage,
          color: 'red',
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Connection test failed. Please check your network connection.';
      setTestResult(false);
      setError(errorMessage);
      notifications.show({
        title: 'Connection Test Failed',
        message: errorMessage,
        color: 'red',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey) {
      setError('API key is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/settings/success-measurement/pendo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key_encrypted: apiKey,
          environment,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }

      await fetchIntegration();
      setApiKey('');
      setTestResult(null);
      notifications.show({
        title: 'Configuration Saved',
        message: 'Pendo integration has been successfully configured.',
        color: 'green',
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to save configuration';
      setError(errorMessage);
      notifications.show({
        title: 'Save Failed',
        message: errorMessage,
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to remove the Pendo integration?')) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/settings/success-measurement/pendo', {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete integration');
      }

      setIntegration(null);
      setApiKey('');
      setTestResult(null);
      notifications.show({
        title: 'Integration Removed',
        message: 'Pendo integration has been successfully removed.',
        color: 'green',
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to delete integration';
      setError(errorMessage);
      notifications.show({
        title: 'Delete Failed',
        message: errorMessage,
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pendo Integration</h2>
          <p className="text-sm text-gray-500">Configure Pendo API integration for automated metric data collection</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Information Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <Stack gap="sm">
            <Group gap="xs">
              <IconInfoCircle size={18} color="#2563eb" />
              <Text fw={500} size="sm">About Pendo Integration</Text>
            </Group>
            <Text size="sm" c="dimmed">
              The Pendo integration enables automatic fetching of event data for success metrics. 
              Once configured, you can select Pendo events when creating metrics, and the system will 
              automatically pull event data for scorecard calculations.
            </Text>
            <Divider />
            <div>
              <Text fw={500} size="sm" mb="xs">How to get your Pendo API Key:</Text>
              <List size="sm" spacing="xs" c="dimmed">
                <List.Item>Log in to your Pendo account</List.Item>
                <List.Item>Navigate to Settings → Integrations → API</List.Item>
                <List.Item>Generate a new API key or use an existing one</List.Item>
                <List.Item>Copy the API key and paste it below</List.Item>
              </List>
              <Text size="xs" c="dimmed" mt="xs">
                Need help?{' '}
                <Anchor 
                  href="https://support.pendo.io/hc/en-us/articles/360031862752-API-Key-Management" 
                  target="_blank" 
                  size="xs"
                >
                  View Pendo API documentation <IconExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                </Anchor>
              </Text>
            </div>
          </Stack>
        </div>

        {/* Integration Status */}
        {integration && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Text fw={500} mb="xs">Integration Status</Text>
                  <Group gap="xs">
                    <Badge
                      color={
                        integration.status === 'connected'
                          ? 'green'
                          : integration.status === 'error'
                          ? 'red'
                          : 'gray'
                      }
                    >
                      {integration.status.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">{integration.environment}</Badge>
                  </Group>
                </div>
                {integration.last_sync && (
                  <div>
                    <Text size="sm" c="dimmed">Last Sync</Text>
                    <Text size="sm">{new Date(integration.last_sync).toLocaleString()}</Text>
                  </div>
                )}
              </Group>
            </Stack>
          </div>
        )}

        {/* Configuration Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <Stack gap="md">
            <div>
              <Text fw={500} mb="xs">Configuration</Text>
              <Text size="sm" c="dimmed">
                Enter your Pendo API credentials to enable automatic event data collection
              </Text>
            </div>

            {testResult !== null && (
              <Alert
                icon={testResult ? <IconCheck size={16} /> : <IconX size={16} />}
                color={testResult ? 'green' : 'red'}
                title={testResult ? 'Connection Successful' : 'Connection Failed'}
                onClose={() => setTestResult(null)}
                withCloseButton
              >
                {testResult
                  ? 'Successfully connected to Pendo API. You can now save the configuration.'
                  : error || 'Failed to connect to Pendo API. Please check your API key and try again.'}
              </Alert>
            )}

            {error && testResult === null && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                title="Error"
                onClose={() => setError(null)}
                withCloseButton
              >
                {error}
              </Alert>
            )}

            <TextInput
              label="Pendo API Key"
              description="Your Pendo API integration key (will be encrypted when saved)"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
                setTestResult(null);
              }}
              placeholder="Enter API key..."
              required
              error={error && !apiKey ? 'API key is required' : undefined}
            />

            <Select
              label="Environment"
              description="Select the Pendo environment for this integration"
              data={[
                { value: 'prod', label: 'Production' },
                { value: 'dev', label: 'Development' },
                { value: 'staging', label: 'Staging' },
              ]}
              value={environment}
              onChange={(value) => setEnvironment(value as 'prod' | 'dev' | 'staging')}
            />

            <Divider />

            <Group>
              <Button
                variant="light"
                onClick={handleTestConnection}
                loading={testing}
                disabled={!apiKey || submitting}
                leftSection={<IconCheck size={16} />}
              >
                Test Connection
              </Button>
              <Button
                onClick={handleSave}
                loading={submitting}
                disabled={!apiKey || testing}
              >
                {integration ? 'Update Configuration' : 'Save Configuration'}
              </Button>
              {integration && (
                <Button
                  variant="outline"
                  color="red"
                  onClick={handleDelete}
                  loading={submitting}
                  disabled={testing}
                >
                  Remove Integration
                </Button>
              )}
            </Group>

            {integration && (
              <Alert color="blue" variant="light">
                <Text size="sm">
                  <strong>Note:</strong> After removing the integration, metrics using Pendo events will 
                  no longer automatically fetch data. You can still enter event names manually when creating metrics.
                </Text>
              </Alert>
            )}
          </Stack>
        </div>
      </div>
    </div>
  );
}
