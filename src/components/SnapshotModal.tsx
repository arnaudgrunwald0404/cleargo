import { useState } from 'react';
import { Button, Modal, Select, Textarea, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';

interface SnapshotModalProps {
    epicId: string;
    opened: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function SnapshotModal({ epicId, opened, onClose, onSuccess }: SnapshotModalProps) {
    const [decisionType, setDecisionType] = useState<string | null>('GO_NO_GO_MEETING');
    const [verdict, setVerdict] = useState<string | null>('GO');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!decisionType || !verdict) return;

        setSubmitting(true);
        try {
            const res = await fetch(`/api/epics/${epicId}/snapshots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    decision_type: decisionType,
                    verdict,
                    notes,
                }),
            });

            if (!res.ok) throw new Error('Failed to create snapshot');

            notifications.show({
                title: 'Snapshot created',
                message: 'The decision snapshot has been saved.',
                color: 'green',
            });
            onSuccess();
            onClose();
            // Reset form
            setNotes('');
        } catch (error) {
            console.error(error);
            notifications.show({
                title: 'Error',
                message: 'Failed to create snapshot',
                color: 'red',
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Take Decision Snapshot" size="lg">
            <div className="space-y-4">
                <Select
                    label="Decision Type"
                    placeholder="Select type"
                    data={[
                        { value: 'GO_NO_GO_MEETING', label: 'Go/No-Go Meeting' },
                        { value: 'ADHOC_CHECK', label: 'Ad-hoc Check' },
                        { value: 'FINAL_APPROVAL', label: 'Final Approval' },
                    ]}
                    value={decisionType}
                    onChange={setDecisionType}
                    required
                />

                <Select
                    label="Verdict"
                    placeholder="Select verdict"
                    data={[
                        { value: 'GO', label: 'GO' },
                        { value: 'CONDITIONAL_GO', label: 'CONDITIONAL GO' },
                        { value: 'NO_GO', label: 'NO GO' },
                    ]}
                    value={verdict}
                    onChange={setVerdict}
                    required
                />

                <Textarea
                    label="Notes"
                    placeholder="Add context, conditions, or reasoning..."
                    minRows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                />

                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} loading={submitting}>Save Snapshot</Button>
                </Group>
            </div>
        </Modal>
    );
}
