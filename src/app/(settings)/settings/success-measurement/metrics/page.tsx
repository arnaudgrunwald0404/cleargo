"use client";

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Group,
  Drawer,
  Text,
  ActionIcon,
  Badge,
  Stack,
  Modal,
  Alert,
  Card,
  NumberInput,
  Select,
  TextInput,
  Textarea,
  Tabs,
  Paper,
  SimpleGrid,
  Tooltip,
  Switch,
} from '@mantine/core';
import { IconPlus, IconPencil, IconTrash, IconAlertCircle, IconHeart, IconTemplate, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { PurpleLoader } from '@/components/PurpleLoader';
import type { 
  HeartCategoryDefault, 
  HeartCustomMetricTemplate, 
  HeartMeasurementType,
  CreateCustomMetricTemplateDTO,
  UpdateCustomMetricTemplateDTO,
} from '@/lib/heart/types';

const HEART_CATEGORIES = [
  { id: 'happiness', name: 'Happiness', icon: '😊', description: 'User satisfaction and sentiment' },
  { id: 'engagement', name: 'Engagement', icon: '📈', description: 'Depth and frequency of feature usage' },
  { id: 'adoption', name: 'Adoption', icon: '🚀', description: 'Percentage of eligible users trying the feature' },
  { id: 'retention', name: 'Retention', icon: '🔄', description: 'Users returning to use the feature again' },
  { id: 'task_success', name: 'Task Success', icon: '✅', description: 'Users completing key workflows successfully' },
];

const MEASUREMENT_TYPES: { value: HeartMeasurementType; label: string; category: string }[] = [
  { value: 'events_per_user', label: 'Events per User', category: 'engagement' },
  { value: 'events_per_user_per_week', label: 'Events per User per Week', category: 'engagement' },
  { value: 'unique_users_percentage', label: 'Unique Users %', category: 'adoption' },
  { value: 'unique_users_count', label: 'Unique Users Count', category: 'adoption' },
  { value: 'return_rate_7_days', label: '7-day Return Rate', category: 'retention' },
  { value: 'return_rate_14_days', label: '14-day Return Rate', category: 'retention' },
  { value: 'return_rate_30_days', label: '30-day Return Rate', category: 'retention' },
  { value: 'completion_rate', label: 'Completion Rate', category: 'task_success' },
  { value: 'success_rate', label: 'Success Rate', category: 'task_success' },
  { value: 'survey_score', label: 'Survey Score', category: 'happiness' },
  { value: 'nps_score', label: 'NPS Score', category: 'happiness' },
];

export default function SuccessMetricsPage() {
  const [activeTab, setActiveTab] = useState<string | null>('defaults');
  const [loading, setLoading] = useState(true);
  
  // HEART Defaults state
  const [defaults, setDefaults] = useState<HeartCategoryDefault[]>([]);
  const [editingDefault, setEditingDefault] = useState<HeartCategoryDefault | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  
  // Custom Templates state
  const [templates, setTemplates] = useState<HeartCustomMetricTemplate[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HeartCustomMetricTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<HeartCustomMetricTemplate | null>(null);

  // Fetch HEART defaults
  const fetchDefaults = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/success-measurement/heart/defaults');
      if (!res.ok) throw new Error('Failed to fetch HEART defaults');
      const data = await res.json();
      setDefaults(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching defaults:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to load HEART category defaults',
        color: 'red',
      });
    }
  }, []);

  // Fetch custom templates
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/success-measurement/heart/templates');
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to load custom metric templates',
        color: 'red',
      });
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchDefaults(), fetchTemplates()]).finally(() => setLoading(false));
  }, [fetchDefaults, fetchTemplates]);

  // Save HEART default
  const handleSaveDefault = async () => {
    if (!editingDefault) return;
    setSavingDefault(true);
    try {
      const res = await fetch('/api/settings/success-measurement/heart/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDefault),
      });
      if (!res.ok) throw new Error('Failed to update default');
      
      notifications.show({
        title: 'Success',
        message: 'Default updated successfully',
        color: 'green',
      });
      setEditingDefault(null);
      fetchDefaults();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to update default',
        color: 'red',
      });
    } finally {
      setSavingDefault(false);
    }
  };

  // Create/Update custom template
  const handleSaveTemplate = async (data: CreateCustomMetricTemplateDTO | UpdateCustomMetricTemplateDTO) => {
    try {
      const isEdit = !!editingTemplate;
      const url = isEdit 
        ? `/api/settings/success-measurement/heart/templates/${editingTemplate.id}`
        : '/api/settings/success-measurement/heart/templates';
      
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save template');
      }

      notifications.show({
        title: 'Success',
        message: `Template ${isEdit ? 'updated' : 'created'} successfully`,
        color: 'green',
      });
      setShowTemplateForm(false);
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to save template',
        color: 'red',
      });
    }
  };

  // Delete template
  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setDeletingTemplate(templateToDelete.id);
    try {
      const res = await fetch(`/api/settings/success-measurement/heart/templates/${templateToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete template');
      
      notifications.show({
        title: 'Success',
        message: 'Template deleted successfully',
        color: 'green',
      });
      setDeleteModalOpen(false);
      setTemplateToDelete(null);
      fetchTemplates();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to delete template',
        color: 'red',
      });
    } finally {
      setDeletingTemplate(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <PurpleLoader size="lg" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div style={{
        maxWidth: 'var(--page-container-max-width)',
        margin: '0 auto',
        paddingLeft: 'var(--page-container-padding-x)',
        paddingRight: 'var(--page-container-padding-x)',
        paddingTop: 'var(--page-container-padding-top)',
        paddingBottom: 'var(--spacing-8)'
      }}
      className="sm:px-6 lg:px-8"
      >
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Group justify="space-between" mb="md">
                <div>
                  <h1 style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 'var(--font-size-page-title)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: 'var(--color-gray-900)'
                  }}>
                    Success Metrics
                  </h1>
                  <Text size="sm" c="dimmed" mt="xs">
                    Configure HEART framework defaults and create custom metric templates
                  </Text>
                </div>
              </Group>

              <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List mb="md">
                  <Tabs.Tab value="defaults" leftSection={<IconHeart size={16} />}>
                    HEART Defaults
                  </Tabs.Tab>
                  <Tabs.Tab value="templates" leftSection={<IconTemplate size={16} />}>
                    Custom Templates
                  </Tabs.Tab>
                </Tabs.List>

                {/* HEART Defaults Tab */}
                <Tabs.Panel value="defaults">
                  <Text size="sm" c="dimmed" mb="md">
                    Set default targets for each HEART category. These defaults are used when setting up metrics for new epics.
                  </Text>

                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    {HEART_CATEGORIES.map((category) => {
                      const categoryDefault = defaults.find(d => d.heart_category === category.id);
                      return (
                        <Card key={category.id} withBorder padding="md">
                          <Group justify="space-between" mb="sm">
                            <Group gap="xs">
                              <Text size="xl">{category.icon}</Text>
                              <div>
                                <Text fw={500}>{category.name}</Text>
                                <Text size="xs" c="dimmed">{category.description}</Text>
                              </div>
                            </Group>
                            <ActionIcon
                              variant="light"
                              color="blue"
                              onClick={() => setEditingDefault(categoryDefault || {
                                id: '',
                                heart_category: category.id as any,
                                default_target_value: null,
                                default_target_timeframe_days: null,
                                default_measurement_type: null,
                                guidance_text: null,
                                example_events: null,
                                updated_by: null,
                                created_at: '',
                                updated_at: '',
                              })}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Group>
                          
                          {categoryDefault ? (
                            <Stack gap="xs">
                              {categoryDefault.default_target_value && (
                                <Group gap="xs">
                                  <Badge color="blue" variant="light" size="sm">
                                    Target: {categoryDefault.default_target_value}%
                                  </Badge>
                                  {categoryDefault.default_target_timeframe_days && (
                                    <Badge color="gray" variant="light" size="sm">
                                      {categoryDefault.default_target_timeframe_days} days
                                    </Badge>
                                  )}
                                </Group>
                              )}
                              {categoryDefault.default_measurement_type && (
                                <Text size="xs" c="dimmed">
                                  Measurement: {MEASUREMENT_TYPES.find(m => m.value === categoryDefault.default_measurement_type)?.label}
                                </Text>
                              )}
                              {!categoryDefault.default_target_value && (
                                <Text size="xs" c="dimmed" fs="italic">No default configured</Text>
                              )}
                            </Stack>
                          ) : (
                            <Text size="xs" c="dimmed" fs="italic">No default configured</Text>
                          )}
                        </Card>
                      );
                    })}
                  </SimpleGrid>
                </Tabs.Panel>

                {/* Custom Templates Tab */}
                <Tabs.Panel value="templates">
                  <Group justify="space-between" mb="md">
                    <Text size="sm" c="dimmed">
                      Create reusable metric templates for metrics beyond the standard HEART categories.
                    </Text>
                    <Button
                      leftSection={<IconPlus size={16} />}
                      onClick={() => {
                        setEditingTemplate(null);
                        setShowTemplateForm(true);
                      }}
                    >
                      Create Template
                    </Button>
                  </Group>

                  {templates.length === 0 ? (
                    <Paper withBorder p="xl" ta="center">
                      <Text c="dimmed">No custom templates yet. Create one to add metrics beyond HEART.</Text>
                    </Paper>
                  ) : (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Template</Table.Th>
                          <Table.Th>Category</Table.Th>
                          <Table.Th>Measurement</Table.Th>
                          <Table.Th>Default Target</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th>Used</Table.Th>
                          <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {templates.map((template) => (
                          <Table.Tr key={template.id}>
                            <Table.Td>
                              <Group gap="xs">
                                <Text>{template.icon}</Text>
                                <div>
                                  <Text size="sm" fw={500}>{template.name}</Text>
                                  {template.description && (
                                    <Text size="xs" c="dimmed" lineClamp={1}>{template.description}</Text>
                                  )}
                                </div>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light">{template.category_label}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">
                                {MEASUREMENT_TYPES.find(m => m.value === template.measurement_type)?.label || template.measurement_type}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              {template.default_target_value ? (
                                <Text size="sm">
                                  {template.default_target_value}%
                                  {template.default_target_timeframe_days && ` / ${template.default_target_timeframe_days}d`}
                                </Text>
                              ) : (
                                <Text size="sm" c="dimmed">—</Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Badge color={template.is_active ? 'green' : 'gray'} variant="light">
                                {template.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Tooltip label={`Used on ${template.usage_count} epic(s)`}>
                                <Badge color="gray" variant="outline" size="sm">
                                  {template.usage_count}
                                </Badge>
                              </Tooltip>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <ActionIcon
                                  variant="light"
                                  color="blue"
                                  onClick={() => {
                                    setEditingTemplate(template);
                                    setShowTemplateForm(true);
                                  }}
                                >
                                  <IconPencil size={16} />
                                </ActionIcon>
                                <ActionIcon
                                  variant="light"
                                  color="red"
                                  onClick={() => {
                                    setTemplateToDelete(template);
                                    setDeleteModalOpen(true);
                                  }}
                                  loading={deletingTemplate === template.id}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Tabs.Panel>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* Edit HEART Default Modal */}
      <Modal
        opened={!!editingDefault}
        onClose={() => setEditingDefault(null)}
        title={
          <Group gap="xs">
            <Text size="xl">{HEART_CATEGORIES.find(c => c.id === editingDefault?.heart_category)?.icon}</Text>
            <Text fw={500}>Edit {HEART_CATEGORIES.find(c => c.id === editingDefault?.heart_category)?.name} Default</Text>
          </Group>
        }
        size="md"
      >
        {editingDefault && (
          <Stack gap="md">
            <NumberInput
              label="Default Target Value (%)"
              description="Target percentage to achieve"
              placeholder="e.g., 75"
              value={editingDefault.default_target_value ?? ''}
              onChange={(value) => setEditingDefault({
                ...editingDefault,
                default_target_value: typeof value === 'number' ? value : null,
              })}
              min={0}
              max={100}
            />
            
            <NumberInput
              label="Default Timeframe (days)"
              description="Days to achieve the target"
              placeholder="e.g., 30"
              value={editingDefault.default_target_timeframe_days ?? ''}
              onChange={(value) => setEditingDefault({
                ...editingDefault,
                default_target_timeframe_days: typeof value === 'number' ? value : null,
              })}
              min={1}
              max={365}
            />
            
            <Select
              label="Default Measurement Type"
              description="How this metric should be measured"
              placeholder="Select measurement type"
              data={MEASUREMENT_TYPES.filter(m => m.category === editingDefault.heart_category || editingDefault.heart_category === 'happiness').map(m => ({
                value: m.value,
                label: m.label,
              }))}
              value={editingDefault.default_measurement_type || null}
              onChange={(value) => setEditingDefault({
                ...editingDefault,
                default_measurement_type: value as HeartMeasurementType | null,
              })}
              clearable
            />
            
            <Textarea
              label="Guidance Text"
              description="Help text shown to users during setup"
              placeholder="Tips for configuring this metric..."
              value={editingDefault.guidance_text || ''}
              onChange={(e) => setEditingDefault({
                ...editingDefault,
                guidance_text: e.target.value || null,
              })}
              rows={3}
            />
            
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={() => setEditingDefault(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveDefault} loading={savingDefault} leftSection={<IconCheck size={16} />}>
                Save Default
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Create/Edit Template Drawer */}
      <Drawer
        opened={showTemplateForm}
        onClose={() => {
          setShowTemplateForm(false);
          setEditingTemplate(null);
        }}
        title={editingTemplate ? 'Edit Custom Template' : 'Create Custom Template'}
        position="right"
        size="lg"
      >
        <TemplateForm
          initialData={editingTemplate}
          onSubmit={handleSaveTemplate}
          onCancel={() => {
            setShowTemplateForm(false);
            setEditingTemplate(null);
          }}
        />
      </Drawer>

      {/* Delete Template Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setTemplateToDelete(null);
        }}
        title={
          <Group gap="xs">
            <IconTrash size={20} className="text-red-600" />
            <Text fw={500}>Delete Template</Text>
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete <strong>"{templateToDelete?.name}"</strong>?
          </Text>
          {templateToDelete && templateToDelete.usage_count > 0 && (
            <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light">
              This template is used by {templateToDelete.usage_count} epic(s). Deleting it won't remove existing metrics, but the template reference will be lost.
            </Alert>
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => {
              setDeleteModalOpen(false);
              setTemplateToDelete(null);
            }}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteTemplate}
              loading={deletingTemplate === templateToDelete?.id}
              leftSection={<IconTrash size={16} />}
            >
              Delete Template
            </Button>
          </Group>
        </Stack>
      </Modal>
    </main>
  );
}

// Template Form Component
function TemplateForm({
  initialData,
  onSubmit,
  onCancel,
}: {
  initialData: HeartCustomMetricTemplate | null;
  onSubmit: (data: CreateCustomMetricTemplateDTO | UpdateCustomMetricTemplateDTO) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [categoryLabel, setCategoryLabel] = useState(initialData?.category_label || '');
  const [icon, setIcon] = useState(initialData?.icon || '📊');
  const [measurementType, setMeasurementType] = useState<HeartMeasurementType | null>(
    initialData?.measurement_type || null
  );
  const [pendoEventPattern, setPendoEventPattern] = useState(initialData?.pendo_event_pattern || '');
  const [targetValue, setTargetValue] = useState<number | ''>(initialData?.default_target_value ?? '');
  const [timeframeDays, setTimeframeDays] = useState<number | ''>(initialData?.default_target_timeframe_days ?? '');
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name || !categoryLabel || !measurementType) {
      notifications.show({
        title: 'Validation Error',
        message: 'Name, category label, and measurement type are required',
        color: 'red',
      });
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name,
        description: description || null,
        category_label: categoryLabel,
        icon,
        measurement_type: measurementType,
        pendo_event_pattern: pendoEventPattern || null,
        default_target_value: typeof targetValue === 'number' ? targetValue : null,
        default_target_timeframe_days: typeof timeframeDays === 'number' ? timeframeDays : null,
        ...(initialData && { is_active: isActive }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="md">
      <TextInput
        label="Template Name"
        placeholder="e.g., Revenue Impact"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <Textarea
        label="Description"
        placeholder="Describe what this metric measures..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />

      <TextInput
        label="Category Label"
        description="How this category will appear in the UI"
        placeholder="e.g., Revenue, Time Saved, Efficiency"
        value={categoryLabel}
        onChange={(e) => setCategoryLabel(e.target.value)}
        required
      />

      <TextInput
        label="Icon"
        description="Emoji to display for this category"
        placeholder="📊"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        maxLength={4}
        style={{ width: 80 }}
      />

      <Select
        label="Measurement Type"
        description="How this metric will be calculated"
        placeholder="Select measurement type"
        data={MEASUREMENT_TYPES.map(m => ({
          value: m.value,
          label: m.label,
        }))}
        value={measurementType}
        onChange={(value) => setMeasurementType(value as HeartMeasurementType | null)}
        required
      />

      <TextInput
        label="Pendo Event Pattern"
        description="Regex pattern to help find matching events (optional)"
        placeholder="e.g., Revenue\\..*"
        value={pendoEventPattern}
        onChange={(e) => setPendoEventPattern(e.target.value)}
      />

      <Group grow>
        <NumberInput
          label="Default Target (%)"
          placeholder="e.g., 75"
          value={targetValue}
          onChange={(value) => setTargetValue(typeof value === 'number' ? value : '')}
          min={0}
          max={100}
        />
        <NumberInput
          label="Default Timeframe (days)"
          placeholder="e.g., 30"
          value={timeframeDays}
          onChange={(value) => setTimeframeDays(typeof value === 'number' ? value : '')}
          min={1}
          max={365}
        />
      </Group>

      {initialData && (
        <Switch
          label="Active"
          description="Inactive templates won't appear in the setup wizard"
          checked={isActive}
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
      )}

      <Group justify="flex-end" mt="xl">
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          {initialData ? 'Update Template' : 'Create Template'}
        </Button>
      </Group>
    </Stack>
  );
}
