"use client";

import React, { useState } from 'react';
import {
  TextInput,
  Select,
  Textarea,
  Button,
  Stack,
  Group,
  NumberInput,
  Text,
  Alert,
  Divider,
  Combobox,
  useCombobox,
  InputBase,
} from '@mantine/core';
import { IconSparkles, IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type {
  CreateSuccessMetricDTO,
  MetricCategory,
  MeasurementType,
  MetricSource,
  LeadingOrLagging,
  MetricThresholds,
} from '@/lib/success/types';

interface MetricFormProps {
  initialData?: Partial<CreateSuccessMetricDTO>;
  onSubmit: (data: CreateSuccessMetricDTO) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function MetricForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: MetricFormProps) {
  const [formData, setFormData] = useState<CreateSuccessMetricDTO>({
    name: initialData?.name || '',
    category: initialData?.category || 'ADOPTION',
    description: initialData?.description || null,
    measurement_type: initialData?.measurement_type || 'PERCENTAGE',
    source: initialData?.source || 'MANUAL',
    pendo_event_id: initialData?.pendo_event_id || null,
    leading_or_lagging: initialData?.leading_or_lagging || 'LAGGING',
    thresholds: initialData?.thresholds || null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [naturalLanguageDescription, setNaturalLanguageDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pendoEvents, setPendoEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingPendoEvents, setLoadingPendoEvents] = useState(false);
  const [pendoError, setPendoError] = useState<string | null>(null);
  const [pendoSearchValue, setPendoSearchValue] = useState('');
  const hasFetchedPendoEvents = React.useRef(false);
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setPendoSearchValue('');
    },
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (formData.source === 'PENDO' && !formData.pendo_event_id?.trim()) {
      newErrors.pendo_event_id = 'Pendo event name is required when source is PENDO';
    }

    // Validate thresholds - if provided, at least one value must have a value
    if (formData.thresholds) {
      const t = formData.thresholds as MetricThresholds;
      const hasThresholds =
        t.min !== undefined || t.max !== undefined || t.target !== undefined;

      if (!hasThresholds) {
        newErrors.thresholds =
          'If thresholds are provided, at least one of min, max, or target must be set';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    try {
      // Normalize thresholds: if all values are empty, set to null
      const normalizedData = { ...formData };
      if (normalizedData.thresholds) {
        const t = normalizedData.thresholds as MetricThresholds;
        const hasAnyThreshold =
          t.min !== undefined || t.max !== undefined || t.target !== undefined;

        if (!hasAnyThreshold) {
          normalizedData.thresholds = null;
        }
      }

      await onSubmit(normalizedData);
    } catch (error: any) {
      console.error('Error submitting metric:', error);
    }
  };

  const updateThreshold = (
    field: 'min' | 'max' | 'target',
    value: number | undefined
  ) => {
    setFormData({
      ...formData,
      thresholds: {
        ...(formData.thresholds || {}),
        [field]: value,
      },
    });
  };

  const handleParseDescription = async () => {
    if (!naturalLanguageDescription.trim()) {
      setParseError('Please enter a description');
      return;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const response = await fetch('/api/settings/success-measurement/metrics/parse-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: naturalLanguageDescription }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse description');
      }

      const { metric } = await response.json();
      
      // Update form data with parsed values (use parsed values directly, with fallbacks only for required fields)
      setFormData({
        name: metric.name || 'Untitled Metric',
        category: metric.category || 'ADOPTION',
        description: metric.description || naturalLanguageDescription,
        measurement_type: metric.measurement_type || 'PERCENTAGE',
        source: metric.source || 'MANUAL',
        pendo_event_id: metric.pendo_event_id ?? null,
        leading_or_lagging: metric.leading_or_lagging || 'LAGGING',
        thresholds: metric.thresholds || null,
      });

      notifications.show({
        title: 'Description parsed',
        message: 'The form has been filled with the parsed information. Please review and adjust as needed.',
        color: 'blue',
      });

      // Clear the natural language description after successful parse
      setNaturalLanguageDescription('');
    } catch (error: any) {
      console.error('Error parsing description:', error);
      setParseError(error.message || 'Failed to parse description. Please try again.');
      notifications.show({
        title: 'Parse failed',
        message: error.message || 'Failed to parse description',
        color: 'red',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const isCreating = !initialData || !initialData.name;

  // Fetch Pendo events when source changes to PENDO
  React.useEffect(() => {
    if (formData.source === 'PENDO' && !hasFetchedPendoEvents.current) {
      hasFetchedPendoEvents.current = true;
      setLoadingPendoEvents(true);
      fetch('/api/settings/success-measurement/pendo/events')
        .then(async (res) => {
          const data = await res.json();
          console.log('Pendo events API response:', { status: res.status, ok: res.ok, data });
          
          // Handle HTTP error status codes
          if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
              console.log('Unauthorized to fetch Pendo events - manual entry available');
              setPendoEvents([]);
              return;
            }
            // For other errors, log but still allow manual entry
            console.warn('Error fetching Pendo events:', data.error || 'Unknown error');
            setPendoEvents([]);
            return;
          }

          // Handle case where Pendo integration is not configured (expected scenario)
          if (data.error) {
            // Show error message to user
            setPendoError(data.error);
            setPendoEvents([]);
            return;
          }

          // Clear any previous errors
          setPendoError(null);

          // Handle successful response with events
          if (data.events && Array.isArray(data.events)) {
            if (data.events.length > 0) {
              const eventOptions = data.events
                .filter((event: { name: string; id?: string; description?: string }) => event && event.name)
                .map((event: { name: string; id?: string; description?: string }) => ({
                  value: event.name,
                  label: event.name + (event.description ? ` - ${event.description}` : ''),
                }));
              console.log(`Setting ${eventOptions.length} Pendo event options`);
              setPendoEvents(eventOptions);
            } else {
              // Empty events array
              console.log('Pendo API returned empty events array');
              setPendoEvents([]);
            }
          } else if (data.warning) {
            // API returned a warning but empty events (e.g., API call failed)
            console.log('Pendo events unavailable:', data.warning);
            setPendoError(data.warning);
            setPendoEvents([]);
          } else {
            // Unexpected response format
            console.warn('Unexpected Pendo events response format:', data);
            setPendoEvents([]);
          }
        })
        .catch((error) => {
          console.error('Error fetching Pendo events:', error);
          setPendoError('Failed to fetch Pendo events. You can still enter event names manually.');
          setPendoEvents([]);
        })
        .finally(() => {
          setLoadingPendoEvents(false);
        });
    } else if (formData.source !== 'PENDO') {
      // Reset the ref and clear events when source changes away from PENDO
      hasFetchedPendoEvents.current = false;
      setPendoEvents([]);
      setPendoError(null);
    }
  }, [formData.source]);

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        {isCreating && (
          <>
            <Alert icon={<IconInfoCircle size={16} />} color="blue" title="Quick Start">
              Describe your metric in plain English, and we'll automatically fill in the form fields for you.
            </Alert>
            
            <Textarea
              label="Describe your metric"
              placeholder="e.g., 'I want to track the percentage of users who complete onboarding within 7 days. This is an adoption metric from Pendo event ID abc123. Target is 80% for tier 1.'"
              value={naturalLanguageDescription}
              onChange={(e) => {
                setNaturalLanguageDescription(e.target.value);
                setParseError(null);
              }}
              minRows={4}
              error={parseError}
            />
            
            <Group justify="flex-end">
              <Button
                type="button"
                leftSection={<IconSparkles size={16} />}
                onClick={handleParseDescription}
                loading={isParsing}
                disabled={!naturalLanguageDescription.trim()}
                variant="light"
              >
                Parse Description
              </Button>
            </Group>

            <Divider label="Or fill in manually" labelPosition="center" />
          </>
        )}
        <TextInput
          label="Name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
        />

        <Select
          label="Category"
          required
          data={[
            { value: 'ADOPTION', label: 'Adoption' },
            { value: 'REVENUE', label: 'Revenue' },
            { value: 'RETENTION', label: 'Retention' },
            { value: 'ENABLEMENT', label: 'Enablement' },
            { value: 'FRICTION', label: 'Friction' },
          ]}
          value={formData.category}
          onChange={(value) => setFormData({ ...formData, category: value as MetricCategory })}
        />

        <Textarea
          label="Description"
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
          minRows={3}
        />

        <Select
          label="Measurement Type"
          required
          data={[
            { value: 'PERCENTAGE', label: 'Percentage' },
            { value: 'COUNT', label: 'Count' },
            { value: 'DURATION', label: 'Duration' },
            { value: 'BOOLEAN', label: 'Boolean' },
          ]}
          value={formData.measurement_type}
          onChange={(value) => setFormData({ ...formData, measurement_type: value as MeasurementType })}
        />

        <Select
          label="Source"
          required
          data={[
            { value: 'PENDO', label: 'Pendo' },
            { value: 'SNOWFLAKE', label: 'Snowflake' },
            { value: 'MANUAL', label: 'Manual' },
          ]}
          value={formData.source}
          onChange={(value) => {
            setFormData({
              ...formData,
              source: value as MetricSource,
              pendo_event_id: value === 'PENDO' ? formData.pendo_event_id : null,
            });
          }}
        />

        {formData.source === 'PENDO' && (
          <div>
            <Text size="sm" fw={500} mb={5}>
              Pendo Event Name <span style={{ color: 'red' }}>*</span>
            </Text>
            <Combobox
              store={combobox}
              onOptionSubmit={(value) => {
                setFormData({ ...formData, pendo_event_id: value || null });
                setPendoSearchValue('');
                combobox.closeDropdown();
              }}
            >
              <Combobox.Target>
                <InputBase
                  component="button"
                  type="button"
                  pointer
                  rightSection={<Combobox.Chevron />}
                  rightSectionPointerEvents="none"
                  onClick={() => combobox.toggleDropdown()}
                  error={errors.pendo_event_id}
                  disabled={loadingPendoEvents}
                >
                  {formData.pendo_event_id ? (
                    <span>{pendoEvents.find(e => e.value === formData.pendo_event_id)?.label || formData.pendo_event_id}</span>
                  ) : (
                    <Text component="span" c="dimmed">
                      {loadingPendoEvents ? 'Loading events...' : pendoEvents.length > 0 ? 'Select an event' : 'Enter or select event name'}
                    </Text>
                  )}
                </InputBase>
              </Combobox.Target>

              <Combobox.Dropdown>
                <Combobox.Search
                  placeholder="Search events or enter custom name..."
                  value={pendoSearchValue}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setPendoSearchValue(value);
                    combobox.openDropdown();
                  }}
                />
                <Combobox.Options style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {pendoEvents
                    .filter((event) => {
                      const searchTerm = pendoSearchValue.toLowerCase();
                      if (!searchTerm) return true;
                      return event.label.toLowerCase().includes(searchTerm) ||
                             event.value.toLowerCase().includes(searchTerm);
                    })
                    .map((event) => (
                      <Combobox.Option value={event.value} key={event.value}>
                        {event.label}
                      </Combobox.Option>
                    ))}
                  {pendoSearchValue && 
                   !pendoEvents.some(e => {
                     const searchTerm = pendoSearchValue.toLowerCase();
                     return e.value.toLowerCase() === searchTerm || 
                            e.value.toLowerCase().includes(searchTerm) ||
                            e.label.toLowerCase().includes(searchTerm);
                   }) && (
                    <Combobox.Option value={pendoSearchValue}>
                      Use "{pendoSearchValue}" as event name
                    </Combobox.Option>
                  )}
                  {pendoEvents.length === 0 && !loadingPendoEvents && !pendoSearchValue && (
                    <Combobox.Option value="" disabled>
                      No events found. Type an event name to use it.
                    </Combobox.Option>
                  )}
                  {pendoEvents.length > 0 && pendoSearchValue && 
                   pendoEvents.filter((event) => {
                     const searchTerm = pendoSearchValue.toLowerCase();
                     return event.label.toLowerCase().includes(searchTerm) ||
                            event.value.toLowerCase().includes(searchTerm);
                   }).length === 0 && (
                    <Combobox.Option value={pendoSearchValue}>
                      Use "{pendoSearchValue}" as event name
                    </Combobox.Option>
                  )}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
            {errors.pendo_event_id && (
              <Text size="xs" c="red" mt={5}>{errors.pendo_event_id}</Text>
            )}
            {pendoError && (
              <Text size="xs" c="orange" mt={5}>
                {pendoError}
              </Text>
            )}
            {pendoEvents.length === 0 && !loadingPendoEvents && !pendoError && (
              <Text size="xs" c="dimmed" mt={5}>
                No events found. You can enter an event name manually.
              </Text>
            )}
            {pendoEvents.length > 0 && (
              <Text size="xs" c="dimmed" mt={5}>
                {pendoEvents.length} events available. You can also enter a custom event name.
              </Text>
            )}
          </div>
        )}

        <Select
          label="Leading or Lagging"
          required
          data={[
            { value: 'LEADING', label: 'Leading' },
            { value: 'LAGGING', label: 'Lagging' },
          ]}
          value={formData.leading_or_lagging}
          onChange={(value) => setFormData({ ...formData, leading_or_lagging: value as LeadingOrLagging })}
        />

        <div>
          <Text size="sm" fw={500} mb="xs">
            Thresholds (Optional)
          </Text>
          {errors.thresholds && (
            <Text size="xs" c="red" mb="xs">
              {errors.thresholds}
            </Text>
          )}

          <Group gap="xs">
            <NumberInput
              label="Min"
              value={formData.thresholds?.min}
              onChange={(value) =>
                updateThreshold('min', value ? Number(value) : undefined)
              }
              style={{ flex: 1 }}
            />
            <NumberInput
              label="Target"
              value={formData.thresholds?.target}
              onChange={(value) =>
                updateThreshold('target', value ? Number(value) : undefined)
              }
              style={{ flex: 1 }}
            />
            <NumberInput
              label="Max"
              value={formData.thresholds?.max}
              onChange={(value) =>
                updateThreshold('max', value ? Number(value) : undefined)
              }
              style={{ flex: 1 }}
            />
          </Group>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {initialData ? 'Update' : 'Create'} Metric
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

