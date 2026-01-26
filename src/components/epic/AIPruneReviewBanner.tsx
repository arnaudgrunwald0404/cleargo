'use client';

import { useState } from 'react';
import { Alert, Button, Group, Text, List, ThemeIcon, Stack, Collapse } from '@mantine/core';
import { IconInfoCircle, IconCheck, IconTrash, IconChevronDown, IconChevronUp, IconRobot } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';
import { notifications } from '@mantine/notifications';

interface AIPruneReviewBannerProps {
    epicId: string;
    suggestedItems: Array<{
        id: string;
        label: string;
        reason: string;
    }>;
    onActionComplete: () => void;
}

export function AIPruneReviewBanner({ epicId, suggestedItems, onActionComplete }: AIPruneReviewBannerProps) {
    const [opened, setOpened] = useState(false);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    if (suggestedItems.length === 0) return null;

    const handleApproveAll = async () => {
        setLoading(true);
        try {
            // Set status to NA for all suggested items
            const { error } = await supabase
                .from('epic_criterion_status')
                .update({
                    status: 'NA',
                    ai_prune_suggested: false,
                    notes: 'Automatically marked as N/A per AI suggestion review.'
                })
                .in('id', suggestedItems.map(item => item.id));

            if (error) throw error;

            notifications.show({
                title: 'Suggestions Approved',
                message: `Successfully marked ${suggestedItems.length} items as N/A.`,
                color: 'green',
            });
            onActionComplete();
        } catch (error) {
            console.error('Error approving suggestions:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to approve suggestions.',
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDismissAll = async () => {
        setLoading(true);
        try {
            // Just clear the suggestion flags
            const { error } = await supabase
                .from('epic_criterion_status')
                .update({ ai_prune_suggested: false })
                .in('id', suggestedItems.map(item => item.id));

            if (error) throw error;

            notifications.show({
                title: 'Suggestions Dismissed',
                message: 'AI suggestions cleared. Criteria kept as is.',
                color: 'blue',
            });
            onActionComplete();
        } catch (error) {
            console.error('Error dismissing suggestions:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to dismiss suggestions.',
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Alert
            icon={<IconRobot size="1.2rem" />}
            title="AI Checklist Suggestions"
            color="violet"
            variant="light"
            mb="md"
            styles={{
                title: { fontSize: '1.1rem', fontWeight: 700 }
            }}
        >
            <Stack gap="sm">
                <Group justify="space-between">
                    <Text size="sm">
                        AI analyzed this launch description and identified <b>{suggestedItems.length} items</b> that might be irrelevant for this specific project.
                    </Text>
                    <Group gap="xs">
                        <Button
                            variant="subtle"
                            color="violet"
                            size="compact-xs"
                            rightSection={opened ? <IconChevronUp size="0.8rem" /> : <IconChevronDown size="0.8rem" />}
                            onClick={() => setOpened((o) => !o)}
                        >
                            {opened ? 'Hide Details' : 'View Suggestions'}
                        </Button>
                        <Button
                            variant="outline"
                            color="gray"
                            size="compact-sm"
                            onClick={handleDismissAll}
                            disabled={loading}
                        >
                            Dismiss All
                        </Button>
                        <Button
                            variant="filled"
                            color="violet"
                            size="compact-sm"
                            leftSection={<IconCheck size="0.9rem" />}
                            onClick={handleApproveAll}
                            loading={loading}
                        >
                            Approve & Mark N/A
                        </Button>
                    </Group>
                </Group>

                <Collapse in={opened}>
                    <List
                        spacing="xs"
                        size="sm"
                        center
                        icon={
                            <ThemeIcon color="violet" size={20} radius="xl">
                                <IconInfoCircle size="0.8rem" />
                            </ThemeIcon>
                        }
                    >
                        {suggestedItems.map((item) => (
                            <List.Item key={item.id}>
                                <Text size="sm" span fw={500}>{item.label}:</Text> <Text size="sm" span c="dimmed" fs="italic">"{item.reason}"</Text>
                            </List.Item>
                        ))}
                    </List>
                </Collapse>
            </Stack>
        </Alert>
    );
}
