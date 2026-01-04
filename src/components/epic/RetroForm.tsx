"use client";

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Stack,
  Select,
  Textarea,
  Group,
  Text,
  TextInput,
  ActionIcon,
  Card,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { PurpleLoader } from '../PurpleLoader';
import type { EpicRetro, DayMarker, RetroOutcome, ActionItem } from '@/lib/success/types';

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface RetroFormProps {
  opened: boolean;
  onClose: () => void;
  epicId: string;
  dayMarker: DayMarker;
  initialData?: Partial<EpicRetro>;
  onSubmit: (data: {
    day_marker: DayMarker;
    outcome: RetroOutcome;
    blockers?: string[];
    assumptions_wrong?: string;
    repeat_next_time?: string;
    change_next_time?: string;
    action_items?: ActionItem[];
  }, submit: boolean) => Promise<void>;
  isSubmitting?: boolean;
}

export function RetroForm({
  opened,
  onClose,
  epicId,
  dayMarker,
  initialData,
  onSubmit,
  isSubmitting = false,
}: RetroFormProps) {
  const [outcome, setOutcome] = useState<RetroOutcome | ''>(initialData?.outcome || '');
  const [blockers, setBlockers] = useState<string[]>(initialData?.blockers || []);
  const [assumptionsWrong, setAssumptionsWrong] = useState<string>(initialData?.assumptions_wrong || '');
  const [repeatNextTime, setRepeatNextTime] = useState<string>(initialData?.repeat_next_time || '');
  const [changeNextTime, setChangeNextTime] = useState<string>(initialData?.change_next_time || '');
  const [actionItems, setActionItems] = useState<ActionItem[]>(initialData?.action_items || []);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (opened) {
      fetchUsers();
    }
  }, [opened]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        const usersArray = Array.isArray(data) ? data : (data.users || []);
        setUsers(Array.isArray(usersArray) ? usersArray : []);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const addBlocker = () => {
    setBlockers([...blockers, '']);
  };

  const removeBlocker = (index: number) => {
    setBlockers(blockers.filter((_, i) => i !== index));
  };

  const updateBlocker = (index: number, value: string) => {
    const newBlockers = [...blockers];
    newBlockers[index] = value;
    setBlockers(newBlockers);
  };

  const addActionItem = () => {
    setActionItems([
      ...actionItems,
      {
        owner: '',
        text: '',
        dueDate: new Date().toISOString().split('T')[0],
      },
    ]);
  };

  const removeActionItem = (index: number) => {
    setActionItems(actionItems.filter((_, i) => i !== index));
  };

  const updateActionItem = (index: number, field: keyof ActionItem, value: string | boolean) => {
    const newItems = [...actionItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setActionItems(newItems);
  };

  const handleSubmit = async (submit: boolean) => {
    if (submit && !outcome) {
      alert('Outcome is required when submitting');
      return;
    }

    try {
      await onSubmit(
        {
          day_marker: dayMarker,
          outcome: outcome as RetroOutcome,
          blockers: blockers.filter(b => b.trim()),
          assumptions_wrong: assumptionsWrong.trim() || undefined,
          repeat_next_time: repeatNextTime.trim() || undefined,
          change_next_time: changeNextTime.trim() || undefined,
          action_items: actionItems.filter(item => item.owner && item.text),
        },
        submit
      );
      onClose();
    } catch (error: any) {
      console.error('Error submitting retro:', error);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`T+${dayMarker} Retrospective`}
      size="xl"
    >
      <Stack gap="md">
        <Select
          label="Outcome"
          description="Did we achieve the expected success?"
          required
          data={[
            { value: 'YES', label: 'Yes - We achieved expected success' },
            { value: 'PARTIAL', label: 'Partial - Some success, but not fully' },
            { value: 'NO', label: 'No - We did not achieve expected success' },
          ]}
          value={outcome}
          onChange={(value) => setOutcome(value as RetroOutcome | '')}
        />

        <div>
          <Text size="sm" fw={500} mb="xs">
            Blockers
          </Text>
          {blockers.map((blocker, index) => (
            <Group key={index} gap="xs" mb="xs">
              <TextInput
                value={blocker}
                onChange={(e) => updateBlocker(index, e.target.value)}
                placeholder="Describe blocker..."
                style={{ flex: 1 }}
              />
              <ActionIcon
                color="red"
                variant="light"
                onClick={() => removeBlocker(index)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            size="xs"
            onClick={addBlocker}
          >
            Add Blocker
          </Button>
        </div>

        <Textarea
          label="Assumptions That Were Wrong"
          description="What assumptions did we make that turned out to be incorrect?"
          value={assumptionsWrong}
          onChange={(e) => setAssumptionsWrong(e.target.value)}
          minRows={3}
        />

        <Textarea
          label="What to Repeat Next Time"
          description="What worked well that we should do again?"
          value={repeatNextTime}
          onChange={(e) => setRepeatNextTime(e.target.value)}
          minRows={3}
        />

        <Textarea
          label="What to Change Next Time"
          description="What should we do differently next time?"
          value={changeNextTime}
          onChange={(e) => setChangeNextTime(e.target.value)}
          minRows={3}
        />

        <div>
          <Text size="sm" fw={500} mb="xs">
            Action Items
          </Text>
          {actionItems.map((item, index) => (
            <Card key={index} withBorder padding="sm" mb="xs">
              <Stack gap="xs">
                <Group gap="xs">
                  <Select
                    label="Owner"
                    placeholder="Select owner..."
                    data={users.map(u => ({
                      value: u.id,
                      label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
                    }))}
                    value={item.owner}
                    onChange={(value) => updateActionItem(index, 'owner', value || '')}
                    searchable
                    style={{ flex: 1 }}
                    disabled={loadingUsers}
                  />
                  <TextInput
                    label="Due Date"
                    type="date"
                    value={item.dueDate || ''}
                    onChange={(e) => updateActionItem(index, 'dueDate', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => removeActionItem(index)}
                    mt="xl"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <TextInput
                  label="Action Item"
                  value={item.text}
                  onChange={(e) => updateActionItem(index, 'text', e.target.value)}
                  placeholder="Describe the action item..."
                />
              </Stack>
            </Card>
          ))}
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            size="xs"
            onClick={addActionItem}
          >
            Add Action Item
          </Button>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSubmit(false)}
            loading={isSubmitting}
          >
            Save Draft
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            loading={isSubmitting}
            disabled={!outcome}
          >
            Submit
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

