"use client";

import React, { useState, useEffect } from 'react';
import {
  TextInput,
  Textarea,
  Select,
  Combobox,
  useCombobox,
  InputBase,
  Text,
  Group,
  Button,
} from '@mantine/core';
import type { MetricSource, SuccessMetric } from '@/lib/success/types';

interface MetricEventConfigProps {
  metric: SuccessMetric;
  epicPendoEventId: string | null;
  epicSnowflakeQuery: string | null;
  epicManualLabel: string | null;
  onPendoEventChange: (eventId: string | null) => void;
  onSnowflakeQueryChange: (query: string | null) => void;
  onManualLabelChange: (label: string | null) => void;
  onSave: () => Promise<void>;
  isSubmitting?: boolean;
}

export function MetricEventConfig({
  metric,
  epicPendoEventId,
  epicSnowflakeQuery,
  epicManualLabel,
  onPendoEventChange,
  onSnowflakeQueryChange,
  onManualLabelChange,
  onSave,
  isSubmitting = false,
}: MetricEventConfigProps) {
  const [pendoEvents, setPendoEvents] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingPendoEvents, setLoadingPendoEvents] = useState(false);
  const [pendoError, setPendoError] = useState<string | null>(null);
  const [pendoSearchValue, setPendoSearchValue] = useState('');
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setPendoSearchValue('');
    },
  });

  // Fetch Pendo events when metric source is PENDO
  useEffect(() => {
    if (metric.source === 'PENDO') {
      setLoadingPendoEvents(true);
      fetch('/api/settings/success-measurement/pendo/events')
        .then(async (res) => {
          const data = await res.json();
          
          if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
              setPendoEvents([]);
              return;
            }
            setPendoError(data.error || 'Failed to fetch Pendo events');
            setPendoEvents([]);
            return;
          }

          if (data.error) {
            setPendoError(data.error);
            setPendoEvents([]);
            return;
          }

          setPendoError(null);

          if (data.events && Array.isArray(data.events)) {
            const eventOptions = data.events
              .filter((event: { name: string; id?: string; description?: string }) => event && event.name)
              .map((event: { name: string; id?: string; description?: string }) => ({
                value: event.name,
                label: event.name + (event.description ? ` - ${event.description}` : ''),
              }));
            setPendoEvents(eventOptions);
          } else {
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
    }
  }, [metric.source]);

  const renderConfigBySource = () => {
    switch (metric.source) {
      case 'PENDO':
        return (
          <div>
            <Text size="sm" fw={500} mb={5}>
              Pendo Event Name (Epic-Specific)
            </Text>
            <Text size="xs" c="dimmed" mb="xs">
              Override the default event for this epic. Leave empty to use metric default: {metric.pendo_event_id || 'Not set'}
            </Text>
            <Combobox
              store={combobox}
              onOptionSubmit={(value) => {
                onPendoEventChange(value || null);
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
                  disabled={loadingPendoEvents}
                >
                  {epicPendoEventId ? (
                    <span>{pendoEvents.find(e => e.value === epicPendoEventId)?.label || epicPendoEventId}</span>
                  ) : (
                    <Text component="span" c="dimmed">
                      {loadingPendoEvents ? 'Loading events...' : pendoEvents.length > 0 ? 'Select an event or leave empty for default' : 'Enter or select event name'}
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
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
            {pendoError && (
              <Text size="xs" c="orange" mt={5}>
                {pendoError}
              </Text>
            )}
            <Group gap="xs" mt="xs">
              <Button
                size="xs"
                variant="subtle"
                onClick={() => onPendoEventChange(null)}
                disabled={!epicPendoEventId}
              >
                Clear (use default)
              </Button>
            </Group>
          </div>
        );

      case 'SNOWFLAKE':
        return (
          <div>
            <Textarea
              label="Snowflake Query (Epic-Specific)"
              description="Override the default query for this epic. Use :epicId and :snapshotDate as parameters."
              placeholder="SELECT value FROM metrics WHERE epic_id = :epicId AND date = :snapshotDate"
              value={epicSnowflakeQuery || ''}
              onChange={(e) => onSnowflakeQueryChange(e.target.value || null)}
              minRows={3}
            />
            <Group gap="xs" mt="xs">
              <Button
                size="xs"
                variant="subtle"
                onClick={() => onSnowflakeQueryChange(null)}
                disabled={!epicSnowflakeQuery}
              >
                Clear (use default)
              </Button>
            </Group>
          </div>
        );

      case 'MANUAL':
        return (
          <TextInput
            label="Manual Label (Epic-Specific)"
            description="Optional label/description for this metric in this epic"
            placeholder="e.g., 'Weekly manual entry'"
            value={epicManualLabel || ''}
            onChange={(e) => onManualLabelChange(e.target.value || null)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div>
      {renderConfigBySource()}
    </div>
  );
}
