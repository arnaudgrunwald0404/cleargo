'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Select,
  Stack,
  Textarea,
  Text,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useAddEpicComment } from '@/hooks/useAddEpicComment';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  PM_NOTE_CAUSE_OPTIONS,
  PM_NOTE_CAUSE_VALUES,
  type PmNoteCauseNew,
} from '@/lib/roadmap/pmNoteCause';

interface AddEpicNoteFormProps {
  ahaKey: string;
  /** ISO snapshot date for the movement we're annotating; undefined = general note. */
  movementDate?: string | null;
  fromRelease?: string | null;
  toRelease?: string | null;
  /** Called after a successful insert. */
  onCreated?: () => void;
  /** Optional cancel handler if rendered in a collapsible row. */
  onCancel?: () => void;
}

const CAUSE_SET = new Set<string>(PM_NOTE_CAUSE_VALUES);

/**
 * Inline form for PMs to attach a note to a release-movement (or post a
 * general note). Uses `useAddEpicComment` which writes to `epic_comment`
 * (RLS gates writes to product roles).
 *
 * Every PM note requires a classification (internal/external subtype).
 */
export function AddEpicNoteForm({
  ahaKey,
  movementDate,
  fromRelease,
  toRelease,
  onCreated,
  onCancel,
}: AddEpicNoteFormProps) {
  const { data: me } = useCurrentUser();
  const addNote = useAddEpicComment(me?.id ?? null);
  const [text, setText] = useState('');
  const [cause, setCause] = useState<PmNoteCauseNew | null>(null);

  const isMovement = Boolean(movementDate);
  const canSubmit =
    text.trim().length > 0 && cause !== null && CAUSE_SET.has(cause);

  const handleSubmit = async () => {
    if (!canSubmit || cause === null) return;
    await addNote.mutateAsync({
      ahaKey,
      commentText: text,
      category: isMovement ? 'movement' : 'general',
      movementCause: cause,
      movementDate: movementDate ?? null,
      fromRelease: fromRelease ?? null,
      toRelease: toRelease ?? null,
    });
    setText('');
    setCause(null);
    onCreated?.();
  };

  return (
    <Stack gap="xs" p="xs" style={{ background: 'var(--color-cast-iron-bg)', borderRadius: 6 }}>
      <div>
        <Text size="xs" mb={4} style={{ color: 'var(--color-gray-700)' }}>
          {isMovement
            ? 'What best describes why this epic moved release?'
            : 'What best describes the context for this note?'}
        </Text>
        <Select
          size="xs"
          placeholder="— Select —"
          data={PM_NOTE_CAUSE_OPTIONS}
          value={cause}
          onChange={(v) => setCause((v as PmNoteCauseNew) ?? null)}
          comboboxProps={{ withinPortal: true }}
          styles={{ input: { background: 'var(--color-white)' } }}
        />
      </div>
      <Textarea
        placeholder={
          isMovement
            ? 'Why did this epic move release? (visible to all roadmap viewers)'
            : 'Add a general note about this epic'
        }
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={2}
        maxRows={6}
        styles={{
          input: { background: 'var(--color-white)' },
        }}
      />
      {addNote.isError && (
        <Alert color="red" variant="light">
          {addNote.error instanceof Error ? addNote.error.message : 'Failed to save note.'}
        </Alert>
      )}
      <Group justify="flex-end" gap="xs">
        {onCancel && (
          <Button size="xs" variant="default" onClick={onCancel} disabled={addNote.isPending}>
            Cancel
          </Button>
        )}
        <Button
          size="xs"
          color="violet"
          leftSection={<IconCheck size={12} />}
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={addNote.isPending}
        >
          Save note
        </Button>
      </Group>
    </Stack>
  );
}
