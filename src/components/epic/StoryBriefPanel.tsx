'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Badge,
  Alert,
  Card,
  Textarea,
  TextInput,
  Select,
  Button,
  ActionIcon,
  Divider,
  Accordion,
  List,
} from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconTrash, IconRobot } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { canRolesPerform } from '@/lib/permissions';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import { PurpleLoader } from '../PurpleLoader';
import {
  useStoryBrief,
  useGenerateStoryBrief,
  useSaveStoryBriefEdits,
  useRatifyStoryBrief,
} from '@/hooks/useStoryBrief';
import type { StoryBriefContent } from '@/lib/story-brief/generator';

interface StoryBriefPanelProps {
  epicId: string;
}

function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}
function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function StoryBriefPanel({ epicId }: StoryBriefPanelProps) {
  const { data, isLoading, error } = useStoryBrief(epicId);
  const generateMutation = useGenerateStoryBrief(epicId);
  const saveMutation = useSaveStoryBriefEdits(epicId);
  const ratifyMutation = useRatifyStoryBrief(epicId);

  const [roles, setRoles] = useState<string[]>([]);
  const [sourceNotes, setSourceNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<StoryBriefContent | null>(null);
  const [changeNote, setChangeNote] = useState('');

  useEffect(() => {
    fetchWithRateLimit('/api/me', { maxRetries: 1 })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRoles((data?.user?.roles || []) as string[]))
      .catch(() => setRoles([]));
  }, []);

  const brief = data?.brief ?? null;
  const changeLog = data?.changeLog ?? [];

  // Sync the working draft from the fetched brief during render (not in an effect) whenever the
  // brief changes underneath us and we're not mid-edit — the React-recommended way to "adjust
  // state when a prop changes" without an extra render pass.
  const [syncedUpdatedAt, setSyncedUpdatedAt] = useState<string | null>(null);
  if (brief && !editing && brief.updated_at !== syncedUpdatedAt) {
    setSyncedUpdatedAt(brief.updated_at);
    setDraftContent(brief.content);
  }

  const canGenerate = canRolesPerform(roles, 'storyBrief.generate');
  const canEdit = canRolesPerform(roles, 'storyBrief.edit');
  const canRatify = canRolesPerform(roles, 'storyBrief.ratify');

  const readyToRatify = useMemo(() => {
    const list = draftContent?.open_decisions ?? [];
    return list.length === 0 || list.every((d) => d.status === 'resolved' || d.status === 'deferred');
  }, [draftContent]);

  const handleGenerate = async (confirmOverwrite = false) => {
    try {
      await generateMutation.mutateAsync({ sourceNotes: sourceNotes.trim() || undefined, confirmOverwrite });
      notifications.show({ title: 'Story Brief drafted', message: 'Review and edit before ratifying.', color: 'green' });
      setEditing(false);
    } catch (rawErr) {
      const err = rawErr as Error & { code?: string };
      if (err?.code === 'RATIFIED_OVERWRITE') {
        if (window.confirm(`${err.message}\n\nRegenerate anyway?`)) {
          await handleGenerate(true);
        }
        return;
      }
      notifications.show({ title: 'Generation failed', message: err?.message || 'Unknown error', color: 'red' });
    }
  };

  const handleSaveEdits = async () => {
    if (!draftContent) return;
    if (!changeNote.trim()) {
      notifications.show({ title: 'Note required', message: 'Describe what changed and why before saving.', color: 'yellow' });
      return;
    }
    try {
      await saveMutation.mutateAsync({ content: draftContent, note: changeNote.trim() });
      notifications.show({ title: 'Story Brief updated', message: 'Edits saved.', color: 'green' });
      setEditing(false);
      setChangeNote('');
    } catch (rawErr) {
      const err = rawErr as Error;
      notifications.show({ title: 'Save failed', message: err?.message || 'Unknown error', color: 'red' });
    }
  };

  const handleRatify = async () => {
    try {
      await ratifyMutation.mutateAsync();
      notifications.show({ title: 'Story Brief ratified', message: 'Promoted to v1.0.', color: 'green' });
    } catch (rawErr) {
      const err = rawErr as Error;
      notifications.show({ title: 'Ratification blocked', message: err?.message || 'Unknown error', color: 'red' });
    }
  };

  if (isLoading) return <PurpleLoader size="md" />;
  if (error) return <Alert color="red">{(error as Error).message}</Alert>;

  const validation = brief?.validation_snapshot as
    | { gap_detected?: boolean; gap_description?: string | null; jira_available?: boolean; aha_available?: boolean }
    | undefined;

  return (
    <Stack gap="lg">
      {brief && (
        <Card withBorder padding="md">
          <Group justify="space-between" wrap="wrap">
            <Group gap="xs">
              <Badge color={brief.status === 'ratified' ? 'green' : 'gray'} size="lg">
                {brief.brief_version}
              </Badge>
              <Text fw={600}>{brief.status === 'ratified' ? 'Ratified' : 'Draft'}</Text>
            </Group>
            <TextInput
              placeholder="Story code (e.g. AGENT)"
              value={brief.story_code || ''}
              readOnly
              size="xs"
              w={180}
            />
          </Group>
        </Card>
      )}

      {validation && (
        <Alert
          color={validation.gap_detected ? 'red' : validation.jira_available === false ? 'yellow' : 'green'}
          icon={<IconAlertTriangle size="1.1rem" />}
          title="Delivery validation (Aha vs. Jira)"
        >
          {validation.gap_detected
            ? validation.gap_description
            : validation.jira_available === false
              ? 'Jira validation unavailable — treat this brief as lower confidence.'
              : 'No delivery gap detected between Aha and Jira.'}
        </Alert>
      )}

      {canGenerate && (
        <Card withBorder padding="md">
          <Stack gap="sm">
            <Text fw={600}>Generate / regenerate from notes</Text>
            <Text size="sm" c="dimmed">
              Paste your call notes or transcript — this is the primary source for why-we-prioritized-it, the
              value story, personas, open decisions, and soft commitments. Aha/Jira facts are always used to
              ground and fact-check what is built and the scope in/out.
            </Text>
            <Textarea
              value={sourceNotes}
              onChange={(e) => setSourceNotes(e.currentTarget.value)}
              minRows={4}
              autosize
              placeholder="Paste notes or a call transcript (optional)..."
            />
            <Group justify="flex-end">
              <Button
                leftSection={<IconRobot size="1rem" />}
                onClick={() => handleGenerate(false)}
                loading={generateMutation.isPending}
              >
                {brief ? 'Regenerate' : 'Generate Story Brief'}
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      {brief && draftContent && (
        <>
          <Group justify="space-between">
            <Text fw={700} size="lg">
              8-section brief
            </Text>
            {canEdit && (
              <Button variant={editing ? 'filled' : 'outline'} size="xs" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Stop editing' : 'Edit'}
              </Button>
            )}
          </Group>

          <Accordion multiple defaultValue={['what_we_are_building']}>
            <Accordion.Item value="what_we_are_building">
              <Accordion.Control>1. What we are building</Accordion.Control>
              <Accordion.Panel>
                <NarrativeSection
                  narrative={draftContent.what_we_are_building.narrative}
                  openFlags={draftContent.what_we_are_building.open_flags}
                  editing={editing}
                  onChange={(narrative) =>
                    setDraftContent({
                      ...draftContent,
                      what_we_are_building: { ...draftContent.what_we_are_building, narrative },
                    })
                  }
                />
                <Select
                  mt="sm"
                  label="UI / workflow disruption"
                  data={['none', 'moderate', 'significant']}
                  value={draftContent.what_we_are_building.disruption_assessment}
                  disabled={!editing}
                  onChange={(v) =>
                    v &&
                    setDraftContent({
                      ...draftContent,
                      what_we_are_building: {
                        ...draftContent.what_we_are_building,
                        disruption_assessment: v as 'none' | 'moderate' | 'significant',
                      },
                    })
                  }
                />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="why_we_prioritized_it">
              <Accordion.Control>2. Why we prioritized it</Accordion.Control>
              <Accordion.Panel>
                <NarrativeSection
                  narrative={draftContent.why_we_prioritized_it.narrative}
                  openFlags={draftContent.why_we_prioritized_it.open_flags}
                  editing={editing}
                  onChange={(narrative) =>
                    setDraftContent({
                      ...draftContent,
                      why_we_prioritized_it: { ...draftContent.why_we_prioritized_it, narrative },
                    })
                  }
                />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="value_story">
              <Accordion.Control>3. The value story</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  {(['working_narrative', 'vignette', 'roi_hypothesis', 'platform_pull_through'] as const).map(
                    (field) => (
                      <Textarea
                        key={field}
                        label={field.replace(/_/g, ' ')}
                        value={draftContent.value_story[field]}
                        readOnly={!editing}
                        autosize
                        minRows={2}
                        onChange={(e) =>
                          setDraftContent({
                            ...draftContent,
                            value_story: { ...draftContent.value_story, [field]: e.currentTarget.value },
                          })
                        }
                      />
                    )
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="launch_scope">
              <Accordion.Control>4. Launch scope — in / out</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  <ListEditor
                    title="IN this story"
                    editing={editing}
                    items={draftContent.launch_scope.in_scope}
                    fields={[
                      { key: 'item', label: 'Item' },
                      { key: 'note', label: 'Note' },
                    ]}
                    onChange={(in_scope) =>
                      setDraftContent({ ...draftContent, launch_scope: { ...draftContent.launch_scope, in_scope } })
                    }
                    newItem={{ item: '', note: '' }}
                  />
                  <ListEditor
                    title="NOT in this story"
                    editing={editing}
                    items={draftContent.launch_scope.out_of_scope}
                    fields={[
                      { key: 'item', label: 'Item' },
                      { key: 'reason', label: 'Reason' },
                    ]}
                    onChange={(out_of_scope) =>
                      setDraftContent({
                        ...draftContent,
                        launch_scope: { ...draftContent.launch_scope, out_of_scope },
                      })
                    }
                    newItem={{ item: '', reason: '' }}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="personas">
              <Accordion.Control>5. Personas & segments</Accordion.Control>
              <Accordion.Panel>
                <ListEditor
                  editing={editing}
                  items={draftContent.personas}
                  fields={[
                    { key: 'persona', label: 'Persona / segment' },
                    { key: 'trigger_and_need', label: 'Trigger & need' },
                    { key: 'lead_message', label: 'Lead message / motion' },
                  ]}
                  onChange={(personas) => setDraftContent({ ...draftContent, personas })}
                  newItem={{ persona: '', trigger_and_need: '', lead_message: '' }}
                />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="open_decisions">
              <Accordion.Control>
                6. Open decisions (gate items)
                {!readyToRatify && (
                  <Badge ml="sm" color="orange" size="sm">
                    Blocks ratification
                  </Badge>
                )}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {draftContent.open_decisions.map((d, i) => (
                    <Card key={i} withBorder padding="sm">
                      <Group grow align="flex-start">
                        <TextInput
                          label="Item"
                          value={d.item}
                          readOnly={!editing}
                          onChange={(e) =>
                            setDraftContent({
                              ...draftContent,
                              open_decisions: updateAt(draftContent.open_decisions, i, { item: e.currentTarget.value }),
                            })
                          }
                        />
                        <TextInput
                          label="Owner"
                          value={d.owner}
                          readOnly={!editing}
                          onChange={(e) =>
                            setDraftContent({
                              ...draftContent,
                              open_decisions: updateAt(draftContent.open_decisions, i, { owner: e.currentTarget.value }),
                            })
                          }
                        />
                        <TextInput
                          label="Blocks"
                          value={d.blocks}
                          readOnly={!editing}
                          onChange={(e) =>
                            setDraftContent({
                              ...draftContent,
                              open_decisions: updateAt(draftContent.open_decisions, i, { blocks: e.currentTarget.value }),
                            })
                          }
                        />
                        <Select
                          label="Gate"
                          data={['naming', 'pricing', 'launch_window', 'other']}
                          value={d.gate_type}
                          disabled={!editing}
                          onChange={(v) =>
                            v &&
                            setDraftContent({
                              ...draftContent,
                              open_decisions: updateAt(draftContent.open_decisions, i, {
                                gate_type: v as 'naming' | 'pricing' | 'launch_window' | 'other',
                              }),
                            })
                          }
                        />
                        <Select
                          label="Status"
                          data={['open', 'resolved', 'deferred']}
                          value={d.status}
                          disabled={!editing}
                          onChange={(v) =>
                            v &&
                            setDraftContent({
                              ...draftContent,
                              open_decisions: updateAt(draftContent.open_decisions, i, {
                                status: v as 'open' | 'resolved' | 'deferred',
                              }),
                            })
                          }
                        />
                        {editing && (
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            mt={24}
                            onClick={() =>
                              setDraftContent({
                                ...draftContent,
                                open_decisions: removeAt(draftContent.open_decisions, i),
                              })
                            }
                          >
                            <IconTrash size="1rem" />
                          </ActionIcon>
                        )}
                      </Group>
                    </Card>
                  ))}
                  {editing && (
                    <Button
                      variant="light"
                      size="xs"
                      leftSection={<IconPlus size="0.9rem" />}
                      onClick={() =>
                        setDraftContent({
                          ...draftContent,
                          open_decisions: [
                            ...draftContent.open_decisions,
                            { item: '', owner: '', blocks: '', gate_type: 'other', status: 'open' },
                          ],
                        })
                      }
                    >
                      Add decision
                    </Button>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="soft_commitments">
              <Accordion.Control>7. Soft commitments & known audience expectations</Accordion.Control>
              <Accordion.Panel>
                <StringListEditor
                  editing={editing}
                  items={draftContent.soft_commitments}
                  onChange={(soft_commitments) => setDraftContent({ ...draftContent, soft_commitments })}
                  placeholder='e.g. "None identified"'
                />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="downstream_deliverables">
              <Accordion.Control>8. Downstream deliverables this brief feeds</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <StringListEditor
                    editing={editing}
                    items={draftContent.downstream_deliverables.chain}
                    onChange={(chain) =>
                      setDraftContent({
                        ...draftContent,
                        downstream_deliverables: { ...draftContent.downstream_deliverables, chain },
                      })
                    }
                    placeholder="e.g. Messaging & positioning doc"
                  />
                  <Textarea
                    label="Enablement plan"
                    value={draftContent.downstream_deliverables.enablement_plan}
                    readOnly={!editing}
                    autosize
                    onChange={(e) =>
                      setDraftContent({
                        ...draftContent,
                        downstream_deliverables: {
                          ...draftContent.downstream_deliverables,
                          enablement_plan: e.currentTarget.value,
                        },
                      })
                    }
                  />
                  <Textarea
                    label="Marketing plan"
                    value={draftContent.downstream_deliverables.marketing_plan}
                    readOnly={!editing}
                    autosize
                    onChange={(e) =>
                      setDraftContent({
                        ...draftContent,
                        downstream_deliverables: {
                          ...draftContent.downstream_deliverables,
                          marketing_plan: e.currentTarget.value,
                        },
                      })
                    }
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          {editing && (
            <Card withBorder padding="md">
              <Stack gap="sm">
                <TextInput
                  label="What changed and why (required)"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.currentTarget.value)}
                  placeholder="e.g. Updated scope after Sourcing Agent legal hold"
                />
                <Group justify="flex-end">
                  <Button onClick={handleSaveEdits} loading={saveMutation.isPending}>
                    Save edits
                  </Button>
                </Group>
              </Stack>
            </Card>
          )}

          <Group justify="flex-end">
            {canRatify && brief.status !== 'ratified' && (
              <Button
                color="green"
                disabled={!readyToRatify}
                title={readyToRatify ? undefined : 'Resolve or defer every open decision before ratifying'}
                onClick={handleRatify}
                loading={ratifyMutation.isPending}
              >
                Ratify to v1.0
              </Button>
            )}
          </Group>

          <Divider label="Change / decision log" />
          <List spacing="xs" size="sm">
            {changeLog.length === 0 && <Text size="sm" c="dimmed">No changes recorded yet.</Text>}
            {changeLog.map((entry) => (
              <List.Item key={entry.id}>
                <Text size="sm" span fw={600}>
                  {new Date(entry.created_at).toLocaleString()} — {entry.action}
                </Text>{' '}
                <Text size="sm" span c="dimmed">
                  by {entry.actor_email || 'system'}
                  {entry.note ? `: "${entry.note}"` : ''}
                </Text>
              </List.Item>
            ))}
          </List>
        </>
      )}

      {!brief && !canGenerate && (
        <Alert color="gray">No Story Brief has been generated for this epic yet.</Alert>
      )}
    </Stack>
  );
}

function NarrativeSection({
  narrative,
  openFlags,
  editing,
  onChange,
}: {
  narrative: string;
  openFlags: string[];
  editing: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Stack gap="xs">
      <Textarea value={narrative} readOnly={!editing} autosize minRows={3} onChange={(e) => onChange(e.currentTarget.value)} />
      {openFlags.length > 0 && (
        <Alert color="yellow" icon={<IconAlertTriangle size="1rem" />} title="Flagged — not fact-checked">
          <List size="sm">
            {openFlags.map((flag, i) => (
              <List.Item key={i}>{flag}</List.Item>
            ))}
          </List>
        </Alert>
      )}
    </Stack>
  );
}

function StringListEditor({
  items,
  editing,
  onChange,
  placeholder,
}: {
  items: string[];
  editing: boolean;
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <Stack gap="xs">
      {items.map((value, i) => (
        <Group key={i} gap="xs">
          <TextInput
            style={{ flex: 1 }}
            value={value}
            readOnly={!editing}
            placeholder={placeholder}
            onChange={(e) => onChange(updateStringAt(items, i, e.currentTarget.value))}
          />
          {editing && (
            <ActionIcon color="red" variant="subtle" onClick={() => onChange(removeAt(items, i))}>
              <IconTrash size="1rem" />
            </ActionIcon>
          )}
        </Group>
      ))}
      {editing && (
        <Button variant="light" size="xs" leftSection={<IconPlus size="0.9rem" />} onClick={() => onChange([...items, ''])}>
          Add
        </Button>
      )}
      {items.length === 0 && !editing && <Text size="sm" c="dimmed">None identified.</Text>}
    </Stack>
  );
}

function updateStringAt(items: string[], index: number, value: string): string[] {
  return items.map((item, i) => (i === index ? value : item));
}

function ListEditor<T extends Record<string, string>>({
  title,
  items,
  fields,
  editing,
  onChange,
  newItem,
}: {
  title?: string;
  items: T[];
  fields: Array<{ key: keyof T; label: string }>;
  editing: boolean;
  onChange: (items: T[]) => void;
  newItem: T;
}) {
  return (
    <Stack gap="xs">
      {title && <Text fw={600} size="sm">{title}</Text>}
      {items.map((row, i) => (
        <Card key={i} withBorder padding="sm">
          <Group grow align="flex-start">
            {fields.map((f) => (
              <TextInput
                key={String(f.key)}
                label={f.label}
                value={row[f.key]}
                readOnly={!editing}
                onChange={(e) => onChange(updateAt(items, i, { [f.key]: e.currentTarget.value } as Partial<T>))}
              />
            ))}
            {editing && (
              <ActionIcon color="red" variant="subtle" mt={24} onClick={() => onChange(removeAt(items, i))}>
                <IconTrash size="1rem" />
              </ActionIcon>
            )}
          </Group>
        </Card>
      ))}
      {editing && (
        <Button variant="light" size="xs" leftSection={<IconPlus size="0.9rem" />} onClick={() => onChange([...items, newItem])}>
          Add
        </Button>
      )}
      {items.length === 0 && !editing && <Text size="sm" c="dimmed">None.</Text>}
    </Stack>
  );
}
