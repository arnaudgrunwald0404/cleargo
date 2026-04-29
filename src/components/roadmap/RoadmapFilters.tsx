'use client';

import {
  ActionIcon,
  Badge,
  Button,
  Group,
  MultiSelect,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAdjustments,
  IconChevronDown,
  IconPackage,
  IconSearch,
  IconX,
} from '@tabler/icons-react';

export type RoadmapViewMode = 'simple' | 'expanded';
export type RoadmapChangeFilter = 'all' | 'new' | 'changed' | 'unchanged';

export interface RoadmapFiltersValue {
  search: string;
  status: string | null;
  owner: string | null;
  goal: string | null;
  pod: string | null;
  changeType: RoadmapChangeFilter;
  selectedReleases: string[];
}

interface RoadmapFiltersProps {
  value: RoadmapFiltersValue;
  onChange: (next: RoadmapFiltersValue) => void;
  availableStatuses: string[];
  availableOwners: string[];
  availableGoals: string[];
  availablePods: string[];
  availableReleases: { name: string; isPast?: boolean }[];
  defaultSelectedReleases: string[];
  viewMode: RoadmapViewMode;
  onViewModeChange: (mode: RoadmapViewMode) => void;
  /** Optional right-hand-side controls (e.g. snapshot date picker). */
  rightActions?: React.ReactNode;
}

/**
 * Top-of-page filter bar for the Roadmap Snapshot view: search input on
 * the left, a popover for status / owner / goal / change-type filters,
 * a multi-select release filter, and a Simple/Expanded view toggle.
 */
export function RoadmapFilters({
  value,
  onChange,
  availableStatuses,
  availableOwners,
  availableGoals,
  availablePods,
  availableReleases,
  defaultSelectedReleases,
  viewMode,
  onViewModeChange,
  rightActions,
}: RoadmapFiltersProps) {
  const update = (patch: Partial<RoadmapFiltersValue>) => onChange({ ...value, ...patch });

  const isDefaultRelease =
    value.selectedReleases.length === defaultSelectedReleases.length &&
    new Set(value.selectedReleases).size === defaultSelectedReleases.length &&
    value.selectedReleases.every((r) => defaultSelectedReleases.includes(r));

  const activeFilterCount =
    (value.search.trim() ? 1 : 0) +
    (value.status ? 1 : 0) +
    (value.owner ? 1 : 0) +
    (value.goal ? 1 : 0) +
    (value.pod ? 1 : 0) +
    (value.changeType !== 'all' ? 1 : 0) +
    (!isDefaultRelease ? 1 : 0);

  const reset = () =>
    onChange({
      search: '',
      status: null,
      owner: null,
      goal: null,
      pod: null,
      changeType: 'all',
      selectedReleases: defaultSelectedReleases,
    });

  return (
    <Group gap="sm" wrap="wrap" align="flex-end">
      <TextInput
        placeholder="Search name, key, or release"
        leftSection={<IconSearch size={16} />}
        value={value.search}
        onChange={(e) => update({ search: e.currentTarget.value })}
        rightSection={
          value.search ? (
            <ActionIcon variant="subtle" color="gray" onClick={() => update({ search: '' })}>
              <IconX size={14} />
            </ActionIcon>
          ) : null
        }
        w={{ base: '100%', sm: 280 }}
      />

      <Popover position="bottom-start" width={320} withArrow shadow="md">
        <Popover.Target>
          <Button
            variant="default"
            leftSection={<IconAdjustments size={16} />}
            rightSection={
              activeFilterCount > 0 ? (
                <Badge size="xs" color="violet" variant="filled">
                  {activeFilterCount}
                </Badge>
              ) : null
            }
          >
            Filters
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Text fw={600} size="sm" style={{ color: 'var(--color-gray-900)' }}>
              Filter snapshot
            </Text>

            <Select
              size="xs"
              label="Status"
              placeholder="Any status"
              clearable
              searchable
              data={availableStatuses.map((s) => ({ value: s, label: s }))}
              value={value.status}
              onChange={(v) => update({ status: v })}
            />

            <Select
              size="xs"
              label="Owner"
              placeholder="Any owner"
              clearable
              searchable
              data={availableOwners.map((s) => ({ value: s, label: s }))}
              value={value.owner}
              onChange={(v) => update({ owner: v })}
            />

            <Select
              size="xs"
              label="Pod"
              placeholder="Any pod"
              clearable
              searchable
              data={availablePods.map((s) => ({ value: s, label: s }))}
              value={value.pod}
              onChange={(v) => update({ pod: v })}
            />

            <Select
              size="xs"
              label="Goal"
              placeholder="Any goal"
              clearable
              searchable
              data={availableGoals.map((s) => ({ value: s, label: s }))}
              value={value.goal}
              onChange={(v) => update({ goal: v })}
            />

            <Select
              size="xs"
              label="Change type"
              data={[
                { value: 'all', label: 'All items' },
                { value: 'new', label: 'Only new this week' },
                { value: 'changed', label: 'Only changed' },
                { value: 'unchanged', label: 'Only unchanged' },
              ]}
              value={value.changeType}
              onChange={(v) => update({ changeType: (v as RoadmapChangeFilter) ?? 'all' })}
            />

            <Group justify="space-between" mt="xs">
              <Button size="xs" variant="subtle" onClick={reset} disabled={activeFilterCount === 0}>
                Reset
              </Button>
              <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
                {activeFilterCount} active
              </Text>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <Popover position="bottom-start" width={360} withArrow shadow="md" trapFocus>
        <Popover.Target>
          <Button
            variant="default"
            leftSection={<IconPackage size={16} />}
            rightSection={<IconChevronDown size={14} />}
            styles={{ root: { fontWeight: 500 } }}
          >
            {isDefaultRelease
              ? `Next ${defaultSelectedReleases.length} releases`
              : value.selectedReleases.length === 0
                ? 'All releases'
                : `${value.selectedReleases.length} of ${availableReleases.length} releases`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm" style={{ color: 'var(--color-gray-900)' }}>
                Releases
              </Text>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => update({ selectedReleases: defaultSelectedReleases })}
                disabled={isDefaultRelease}
              >
                Reset to next {defaultSelectedReleases.length}
              </Button>
            </Group>
            <MultiSelect
              size="xs"
              placeholder="Pick releases…"
              searchable
              clearable
              maxDropdownHeight={280}
              data={availableReleases.map((r) => ({
                value: r.name,
                label: r.isPast ? `${r.name} (past)` : r.name,
              }))}
              value={value.selectedReleases}
              onChange={(v) => update({ selectedReleases: v })}
              maxValues={50}
            />
            <Text size="xs" style={{ color: 'var(--color-gray-500)' }}>
              {availableReleases.length} releases available · default shows the next{' '}
              {defaultSelectedReleases.length} upcoming
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <SegmentedControl
        value={viewMode}
        onChange={(v) => onViewModeChange(v as RoadmapViewMode)}
        data={[
          { label: 'Simple', value: 'simple' },
          { label: 'Expanded', value: 'expanded' },
        ]}
        styles={{
          root: {
            background: 'var(--color-gray-100)',
            border: '1px solid var(--color-gray-200)',
          },
          label: {
            color: 'var(--color-gray-600)',
            fontWeight: 500,
          },
          indicator: {
            background: 'var(--color-white)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
          },
        }}
      />

      {rightActions}
    </Group>
  );
}
