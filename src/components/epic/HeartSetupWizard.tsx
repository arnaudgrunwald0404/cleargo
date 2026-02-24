"use client";

import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Button,
  ThemeIcon,
  Paper,
  Loader,
  Alert,
  Badge,
  Textarea,
  Checkbox,
} from '@mantine/core';
import {
  IconRocket,
  IconRobot,
  IconHandStop,
  IconAlertCircle,
  IconCheck,
  IconSparkles,
  IconBulb,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { HeartManualConfigForm } from './HeartManualConfigForm';
import type { HeartSetupMethod, HeartAgentRecommendation, EpicHeartConfig, EpicHeartMetric } from '@/lib/heart/types';

interface HeartSetupWizardProps {
  epicId: string;
  epicName: string;
  onSetupComplete: () => void;
}

type SetupStep = 'choose' | 'loading' | 'review' | 'manual' | 'complete';

export function HeartSetupWizard({
  epicId,
  epicName,
  onSetupComplete,
}: HeartSetupWizardProps) {
  const [step, setStep] = useState<SetupStep>('choose');
  const [selectedMethod, setSelectedMethod] = useState<HeartSetupMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<HeartAgentRecommendation | null>(null);
  const [config, setConfig] = useState<EpicHeartConfig | null>(null);
  const [metrics, setMetrics] = useState<EpicHeartMetric[]>([]);
  const [userContext, setUserContext] = useState('');
  const [availableEventNames, setAvailableEventNames] = useState<string[] | null>(null);
  const [trackOffline, setTrackOffline] = useState(false);

  // Load track_offline status from epic success config
  useEffect(() => {
    const loadTrackOfflineStatus = async () => {
      try {
        const res = await fetch(`/api/epics/${epicId}/success/config`);
        if (res.ok) {
          const config = await res.json();
          if (config && typeof config.track_offline === 'boolean') {
            setTrackOffline(config.track_offline);
          }
        }
      } catch (error) {
        // Silently fail - config might not exist yet
      }
    };
    loadTrackOfflineStatus();
  }, [epicId]);

  const handleTrackOfflineChange = async (checked: boolean) => {
    try {
      // Check if config exists - GET returns null with status 200 when config doesn't exist
      const configRes = await fetch(`/api/epics/${epicId}/success/config`);
      let method: 'POST' | 'PATCH' = 'POST';
      
      if (configRes.ok) {
        // Parse the response to check if config actually exists
        const configData = await configRes.json();
        method = configData ? 'PATCH' : 'POST';
      }
      
      const res = await fetch(`/api/epics/${epicId}/success/config`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_offline: checked }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update offline tracking setting');
      }

      // Confirm state was saved successfully by reading back from response
      const savedConfig = await res.json();
      if (savedConfig?.track_offline !== undefined) {
        setTrackOffline(savedConfig.track_offline);
      }
    } catch (error: any) {
      console.error('Error updating track_offline:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update offline tracking setting',
        color: 'red',
      });
      // Revert the checkbox state
      setTrackOffline(!checked);
    }
  };

  const handleMethodSelect = async (method: HeartSetupMethod) => {
    setSelectedMethod(method);
    setError(null);

    if (method === 'manual') {
      // Manual setup - create config then show manual form
      setLoading(true);
      setStep('loading');
      try {
        const res = await fetch(`/api/epics/${epicId}/heart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setup_method: 'manual' }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create HEART config');
        }

        const data = await res.json();
        setConfig(data.config);
        setStep('manual'); // Go to manual config form
      } catch (err: any) {
        setError(err.message);
        setStep('choose');
      } finally {
        setLoading(false);
      }
      return;
    }

    // AI-powered setup (auto or ai_assisted) — runs in background; poll for completion
    setLoading(true);
    setStep('loading');
    let isPolling = false;

    try {
      const res = await fetch(`/api/epics/${epicId}/heart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_method: method,
          ...(userContext.trim() && { user_context: userContext.trim() }),
        }),
      });

      const data = await res.json();

      if (res.status === 202 && data.job_id) {
        isPolling = true;
        // Background job started; poll setup-status until completed or failed
        const jobId = data.job_id as string;
        const pollIntervalMs = 2500;
        const pollTimeoutMs = 5 * 60 * 1000; // 5 minutes
        const startedAt = Date.now();
        let pollTimer: ReturnType<typeof setInterval> | null = null;

        const stopPolling = () => {
          isPolling = false;
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          setLoading(false);
        };

        const poll = async () => {
          if (Date.now() - startedAt > pollTimeoutMs) {
            stopPolling();
            setError('Setup is taking longer than expected. Please refresh and check HEART metrics, or try Manual setup.');
            setStep('choose');
            notifications.show({
              title: 'Setup Timeout',
              message: 'HEART setup did not finish in time. Refresh the page to see if it completed.',
              color: 'yellow',
            });
            return;
          }
          const statusRes = await fetch(
            `/api/epics/${epicId}/heart/setup-status?job_id=${encodeURIComponent(jobId)}`
          );
          const statusData = await statusRes.json();
          if (!statusRes.ok) {
            stopPolling();
            setError(statusData.error || 'Failed to get setup status');
            setStep('choose');
            return;
          }
          if (statusData.status === 'completed') {
            stopPolling();
            setAvailableEventNames(null);
            setConfig(statusData.config ?? null);
            setMetrics(Array.isArray(statusData.metrics) ? statusData.metrics : []);
            setRecommendations(statusData.recommendations ?? null);
            if (method === 'auto') {
              setStep('complete');
              notifications.show({
                title: 'HEART Metrics Configured',
                message: `${(statusData.metrics?.length ?? 0)} metrics automatically configured.`,
                color: 'green',
                icon: <IconSparkles size={16} />,
              });
            } else {
              if (statusData.recommendations) {
                setStep('review');
              } else {
                setStep('complete');
                notifications.show({
                  title: 'Setup Complete',
                  message: 'AI could not generate recommendations. You can configure metrics manually.',
                  color: 'yellow',
                });
              }
            }
            onSetupComplete?.();
            return;
          }
          if (statusData.status === 'failed') {
            stopPolling();
            const err = statusData.error || 'HEART setup failed.';
            setError(err);
            setAvailableEventNames(statusData.availableEventNames ?? null);
            setStep('choose');
            if (statusData.recommendations || statusData.availableEventNames?.length) {
              notifications.show({
                title: 'No Metrics Found',
                message: statusData.availableEventNames?.length
                  ? 'Add specific Pendo event names to your context above and try again, or use Manual setup.'
                  : 'AI could not find relevant Pendo events. Try manual setup or check product area configuration.',
                color: 'yellow',
              });
            } else {
              notifications.show({
                title: 'Setup Failed',
                message: err,
                color: 'red',
              });
            }
            return;
          }
          // still pending or running; next poll will run on timer
        };

        await poll(); // first poll immediately
        pollTimer = setInterval(poll, pollIntervalMs);
        return;
      }

      // Non-202 response: error (e.g. 400, 409, 502)
      if (!res.ok) {
        if (res.status === 422 && data.error) {
          setAvailableEventNames(data.availableEventNames ?? null);
          setError(data.error);
          setStep('choose');
          notifications.show({
            title: 'No Metrics Found',
            message: data.availableEventNames?.length
              ? 'Add specific Pendo event names to your context above and try again, or use Manual setup.'
              : 'AI could not find relevant Pendo events. Try manual setup or check product area configuration.',
            color: 'yellow',
          });
          return;
        }
        setAvailableEventNames(null);
        throw new Error(data.error || 'Failed to setup HEART metrics');
      }

      // Legacy 200 response (sync path; should not happen for auto/ai_assisted on Netlify)
      setAvailableEventNames(null);
      setConfig(data.config);
      setMetrics(data.metrics || []);
      setRecommendations(data.recommendations);
      if (method === 'auto') {
        setStep('complete');
        notifications.show({
          title: 'HEART Metrics Configured',
          message: `${data.metrics?.length || 0} metrics automatically configured.`,
          color: 'green',
          icon: <IconSparkles size={16} />,
        });
      } else {
        if (data.recommendations) {
          setStep('review');
        } else {
          setStep('complete');
          notifications.show({
            title: 'Setup Complete',
            message: 'AI could not generate recommendations. You can configure metrics manually.',
            color: 'yellow',
          });
        }
      }
      onSetupComplete?.();
    } catch (err: any) {
      setError(err.message);
      setStep('choose');
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  const handleApplyRecommendations = async () => {
    if (!recommendations || !config) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/epics/${epicId}/heart/apply-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendations }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to apply recommendations');
      }

      const data = await res.json();
      setMetrics(data.metrics);
      setStep('complete');
      notifications.show({
        title: 'Metrics Configured',
        message: `${data.metricsCreated} metrics created based on AI recommendations.`,
        color: 'green',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Choose method step
  if (step === 'choose') {
    return (
      <Card style={{ backgroundColor: 'transparent' }}>
        <Stack gap="none">
          <Paper radius="md" style={{ backgroundColor: 'transparent' }}>
            <Text size="lg" fw={600} c="dark" mb="sm">
              Configure HEART Metrics
            </Text>
            <Checkbox
              label="No automated metric for this epic, will track offline"
              description="Epics with this option enabled will not be counted in the digest as missing metrics"
              checked={trackOffline}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setTrackOffline(checked);
                // Update the epic success config immediately
                handleTrackOfflineChange(checked);
              }}
              mb="md"
            />
          </Paper>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              <Text size="sm" component="span">{error}</Text>
              {availableEventNames && availableEventNames.length > 0 && (
                <Text size="xs" c="dimmed" mt="xs" component="div">
                  Pendo events considered ({availableEventNames.length}): {availableEventNames.slice(0, 8).join(', ')}
                  {availableEventNames.length > 8 && ` … +${availableEventNames.length - 8} more`}. Add event names to your context above and try again, or use Manual setup.
                </Text>
              )}
            </Alert>
          )}

          <Paper  p="md" radius="md" style={{ backgroundColor: 'var(--color-platinum)', borderColor: 'var(--color-gray-300)', opacity: trackOffline ? 0.5 : 1 }}>
            <Group gap="xs" mb="xs">
           
          
          <ThemeIcon size="sm" style={{ backgroundColor: 'var(--color-brass)', color: 'var(--color-cast-iron)' }}>
                <IconBulb size={14} />
              </ThemeIcon>
              <Text size="md" fw={600} c="dark">
                Add context for the AI (optional)
              </Text>
            </Group>
            <Text size="sm" c="dimmed" mb="sm">
              Give the AI direction on what to look for—for example, event names, product area, or success criteria. This helps it pick the right metrics.
            </Text>
            <Textarea
              placeholder="e.g. Look for events related to the new reporting dashboard; prefer events under Product Analytics. We care most about adoption in the first 30 days."
              value={userContext}
              onChange={(e) => setUserContext(e.currentTarget.value)}
              minRows={2}
              maxRows={4}
              autosize
              color="dark.gray"
              disabled={trackOffline}
            />
            <Text size="sm" c="dimmed" mt="xs">
              Whatever you type here is passed to the AI when you click <strong>Fully Automatic</strong> or <strong>AI-Assisted</strong> below. Manual setup does not use this.
            </Text>
          </Paper>

          <Stack gap="md">
            {/* Fully Automatic */}
            <Paper
              withBorder
              p="md"
              radius="md"
              bg="white"
              style={{ 
                cursor: trackOffline ? 'not-allowed' : 'pointer', 
                borderColor: 'var(--color-gray-300)',
                opacity: trackOffline ? 0.5 : 1,
                pointerEvents: trackOffline ? 'none' : 'auto'
              }}
              onClick={() => !trackOffline && handleMethodSelect('auto')}
            >
              <Group>
                <ThemeIcon size="xl" radius="md" color="green">
                  <IconRocket size={24} />
                </ThemeIcon>
                <div style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Text fw={600} c="dark">Fully Automatic</Text>
                    <Badge size="xs" color="green">Recommended</Badge>
                    {userContext.trim() && (
                      <Badge size="xs" color="blue" variant="light">Uses your context above</Badge>
                    )}
                  </Group>
                  <Text size="sm" c="dimmed">
                    AI analyzes your feature and Pendo data, then automatically configures all HEART metrics.
                    You can always adjust later.
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Best for: Quick setup, trust the defaults
                  </Text>
                </div>
              </Group>
            </Paper>

            {/* AI-Assisted */}
            <Paper
              withBorder
              p="md"
              radius="md"
              bg="white"
              style={{ 
                cursor: trackOffline ? 'not-allowed' : 'pointer', 
                borderColor: 'var(--color-gray-300)',
                opacity: trackOffline ? 0.5 : 1,
                pointerEvents: trackOffline ? 'none' : 'auto'
              }}
              onClick={() => !trackOffline && handleMethodSelect('ai_assisted')}
            >
              <Group>
                <ThemeIcon size="xl" radius="md" color="blue">
                  <IconRobot size={24} />
                </ThemeIcon>
                <div style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Text fw={600} c="dark">AI-Assisted</Text>
                    {userContext.trim() && (
                      <Badge size="xs" color="blue" variant="light">Uses your context above</Badge>
                    )}
                  </Group>
                  <Text size="sm" c="dimmed">
                    AI recommends metrics for each HEART category. You review and approve/modify each one before they're applied.
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Best for: Guided setup with control
                  </Text>
                </div>
              </Group>
            </Paper>

            {/* Manual */}
            <Paper
              withBorder
              p="md"
              radius="md"
              bg="white"
              style={{ 
                cursor: trackOffline ? 'not-allowed' : 'pointer', 
                borderColor: 'var(--color-gray-300)',
                opacity: trackOffline ? 0.5 : 1,
                pointerEvents: trackOffline ? 'none' : 'auto'
              }}
              onClick={() => !trackOffline && handleMethodSelect('manual')}
            >
              <Group>
                <ThemeIcon size="xl" radius="md" color="gray">
                  <IconHandStop size={24} />
                </ThemeIcon>
                <div style={{ flex: 1 }}>
                  <Text fw={600} c="dark">Manual</Text>
                  <Text size="sm" c="dimmed">
                    Configure each HEART category yourself. Use Pendo events, manual entry, or external data sources.
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Best for: Full control, custom data sources, no Pendo dependency
                  </Text>
                </div>
              </Group>
            </Paper>
          </Stack>
        </Stack>
      </Card>
    );
  }

  // Loading step
  if (step === 'loading') {
    return (
      <Card withBorder padding="lg">
        <Stack align="center" gap="md" py="xl">
          <Loader size="lg" />
          <div style={{ textAlign: 'center' }}>
            <Text size="lg" fw={500}>
              {selectedMethod === 'manual' ? 'Setting Up Configuration...' :
               selectedMethod === 'auto' ? 'Configuring HEART Metrics...' : 'Analyzing Feature...'}
            </Text>
            <Text size="sm" c="dimmed" mt="xs">
              {selectedMethod === 'manual'
                ? 'Creating your HEART metrics configuration...'
                : selectedMethod === 'auto'
                ? 'AI is analyzing your feature and setting up metrics automatically.'
                : 'AI is reviewing your feature description and available data.'}
            </Text>
          </div>
          {selectedMethod !== 'manual' && (
            <Stack gap="xs" mt="md">
              <Group gap="xs">
                <IconCheck size={16} color="green" />
                <Text size="sm">Fetching epic details</Text>
              </Group>
              <Group gap="xs">
                <IconCheck size={16} color="green" />
                <Text size="sm">Loading data sources</Text>
              </Group>
              <Group gap="xs">
                <Loader size={16} />
                <Text size="sm">Generating recommendations...</Text>
              </Group>
            </Stack>
          )}
        </Stack>
      </Card>
    );
  }

  // Review step (AI-assisted only)
  if (step === 'review' && recommendations) {
    return (
      <Card withBorder padding="lg">
        <Stack gap="lg">
          <div>
            <Text size="lg" fw={600} mb="xs">
              Review AI Recommendations
            </Text>
            <Text size="sm" c="dimmed">
              The AI has suggested the following HEART metrics for "{epicName}". Review and approve to apply them.
            </Text>
          </div>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}

          <Stack gap="md">
            {/* Engagement */}
            {recommendations.engagement && (
              <RecommendationCard
                category="Engagement"
                icon="📈"
                eventIds={recommendations.engagement.eventIds}
                measurementType={recommendations.engagement.measurementType}
                rationale={recommendations.engagement.rationale}
              />
            )}

            {/* Adoption */}
            {recommendations.adoption && (
              <RecommendationCard
                category="Adoption"
                icon="🚀"
                eventIds={recommendations.adoption.eventIds}
                measurementType={recommendations.adoption.measurementType}
                targetValue={recommendations.adoption.targetValue}
                targetTimeframeDays={recommendations.adoption.targetTimeframeDays}
                rationale={recommendations.adoption.rationale}
              />
            )}

            {/* Retention */}
            {recommendations.retention && (
              <RecommendationCard
                category="Retention"
                icon="🔄"
                eventIds={recommendations.retention.eventIds}
                measurementType={recommendations.retention.measurementType}
                rationale={recommendations.retention.rationale}
              />
            )}

            {/* Task Success */}
            {recommendations.taskSuccess && (
              <RecommendationCard
                category="Task Success"
                icon="✅"
                eventIds={recommendations.taskSuccess.eventIds}
                measurementType={recommendations.taskSuccess.measurementType}
                rationale={recommendations.taskSuccess.rationale}
              />
            )}

            {/* Happiness */}
            {recommendations.happiness && (
              <Paper withBorder p="md" bg="gray.0">
                <Group gap="xs" mb="xs">
                  <Text size="lg">😊</Text>
                  <Text fw={600}>Happiness</Text>
                  <Badge size="xs" color="yellow">Survey Required</Badge>
                </Group>
                <Text size="sm" c="dimmed" mb="xs">
                  {recommendations.happiness.rationale}
                </Text>
                <Text size="sm">
                  <strong>Suggested Question:</strong> "{recommendations.happiness.suggestedQuestion}"
                </Text>
                <Text size="xs" c="dimmed" mt="xs">
                  Surveys require CS approval to activate. Coming soon.
                </Text>
              </Paper>
            )}

            {!recommendations.engagement && !recommendations.adoption && !recommendations.retention && !recommendations.taskSuccess && (
              <Alert icon={<IconAlertCircle size={16} />} color="yellow">
                AI could not find relevant Pendo events for this feature. You may need to configure metrics manually.
              </Alert>
            )}
          </Stack>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setStep('choose')}>
              Back
            </Button>
            <Button
              onClick={handleApplyRecommendations}
              loading={loading}
              disabled={!recommendations.engagement && !recommendations.adoption && !recommendations.retention && !recommendations.taskSuccess}
            >
              Apply Recommendations
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  // Manual config step
  if (step === 'manual' && config) {
    return (
      <HeartManualConfigForm
        epicId={epicId}
        configId={config.id}
        existingMetrics={metrics}
        onSave={() => {
          setStep('complete');
          notifications.show({
            title: 'HEART Metrics Configured',
            message: 'Your manual configuration has been saved.',
            color: 'green',
          });
        }}
        onCancel={async () => {
          // Delete the config that was created so user can start fresh
          try {
            await fetch(`/api/epics/${epicId}/heart`, { method: 'DELETE' });
          } catch (err) {
            console.error('Failed to clean up HEART config on cancel:', err);
          }
          setConfig(null);
          setStep('choose');
        }}
      />
    );
  }

  // Complete step
  if (step === 'complete') {
    return (
      <Card withBorder padding="lg">
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={60} radius="xl" color="green">
            <IconCheck size={32} />
          </ThemeIcon>
          <div style={{ textAlign: 'center' }}>
            <Text size="lg" fw={600}>
              HEART Metrics Configured!
            </Text>
            <Text size="sm" c="dimmed" mt="xs">
              {metrics.length > 0
                ? `${metrics.length} metrics are now tracking. Data will start populating within 24 hours.`
                : 'Your HEART config is ready. Add metrics to start tracking.'}
            </Text>
          </div>
          <Button onClick={onSetupComplete} mt="md">
            View Dashboard
          </Button>
        </Stack>
      </Card>
    );
  }

  return null;
}

// Recommendation card component
function RecommendationCard({
  category,
  icon,
  eventIds,
  measurementType,
  targetValue,
  targetTimeframeDays,
  rationale,
}: {
  category: string;
  icon: string;
  eventIds: string[];
  measurementType: string;
  targetValue?: number | null;
  targetTimeframeDays?: number | null;
  rationale: string;
}) {
  return (
    <Paper withBorder p="md">
      <Group gap="xs" mb="xs">
        <Text size="lg">{icon}</Text>
        <Text fw={600}>{category}</Text>
        <Badge size="xs" color="green">AI Suggested</Badge>
      </Group>
      <Text size="sm" c="dimmed" mb="xs">
        {rationale}
      </Text>
      <Stack gap="xs">
        <Text size="sm">
          <strong>Event(s):</strong> {eventIds.join(', ')}
        </Text>
        <Text size="sm">
          <strong>Measurement:</strong> {measurementType.replace(/_/g, ' ')}
        </Text>
        {targetValue !== undefined && targetValue !== null && (
          <Text size="sm">
            <strong>Target:</strong> {targetValue}%
            {targetTimeframeDays && ` within ${targetTimeframeDays} days`}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
