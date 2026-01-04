"use client";

import React, { useEffect, useState } from 'react';
import {
  Card,
  Stack,
  Text,
  TextInput,
  Select,
  Button,
  Group,
  Alert,
  Badge,
} from '@mantine/core';
import { IconCheck, IconX, IconAlertCircle } from '@tabler/icons-react';
import { PurpleLoader } from '@/components/PurpleLoader';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';

interface PendoIntegration {
  id: string;
  environment: string;
  last_sync: string | null;
  status: 'connected' | 'disconnected' | 'error';
  created_at: string;
  updated_at: string;
}

export default function PendoIntegrationPage() {
  const [integration, setIntegration] = useState<PendoIntegration | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<'prod' | 'dev' | 'staging'>('prod');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntegration();
  }, []);

  const fetchIntegration = async () => {
    setLoading(true);
    try {
      const res = await fetchWithRateLimit('/api/settings/success-measurement/pendo', {
        maxRetries: 1,
      });
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
      // Test connection by attempting to configure (which tests the connection)
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
      } else {
        const errorData = await res.json();
        setTestResult(false);
        setError(errorData.error || 'Connection test failed');
      }
    } catch (error: any) {
      setTestResult(false);
      setError(error.message || 'Connection test failed');
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
      setApiKey(''); // Clear API key after saving
    } catch (error: any) {
      setError(error.message || 'Failed to save configuration');
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
    } catch (error: any) {
      setError(error.message || 'Failed to delete integration');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <PurpleLoader />
      </div>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="xl" fw={500}>
          Pendo Integration
        </Text>
        <Text size="sm" c="dimmed">
          Configure Pendo API integration for automated metric data collection
        </Text>
      </div>

      {integration && (
        <Card withBorder padding="md">
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text fw={500} mb="xs">
                  Integration Status
                </Text>
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
                  <Text size="sm" c="dimmed">
                    Last Sync
                  </Text>
                  <Text size="sm">
                    {new Date(integration.last_sync).toLocaleString()}
                  </Text>
                </div>
              )}
            </Group>
          </Stack>
        </Card>
      )}

      <Card withBorder padding="md">
        <Stack gap="md">
          <Text fw={500}>Configuration</Text>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}

          {testResult !== null && (
            <Alert
              icon={testResult ? <IconCheck size={16} /> : <IconX size={16} />}
              color={testResult ? 'green' : 'red'}
              title={testResult ? 'Connection Successful' : 'Connection Failed'}
            >
              {testResult
                ? 'Successfully connected to Pendo API'
                : 'Failed to connect to Pendo API. Please check your API key.'}
            </Alert>
          )}

          <TextInput
            label="Pendo API Key"
            description="Enter your Pendo API integration key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key..."
          />

          <Select
            label="Environment"
            description="Select Pendo environment"
            data={[
              { value: 'prod', label: 'Production' },
              { value: 'dev', label: 'Development' },
              { value: 'staging', label: 'Staging' },
            ]}
            value={environment}
            onChange={(value) => setEnvironment(value as 'prod' | 'dev' | 'staging')}
          />

          <Group>
            <Button
              variant="light"
              onClick={handleTestConnection}
              loading={testing}
              disabled={!apiKey}
            >
              Test Connection
            </Button>
            <Button onClick={handleSave} loading={submitting} disabled={!apiKey}>
              Save Configuration
            </Button>
            {integration && (
              <Button
                variant="outline"
                color="red"
                onClick={handleDelete}
                loading={submitting}
              >
                Remove Integration
              </Button>
            )}
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}

