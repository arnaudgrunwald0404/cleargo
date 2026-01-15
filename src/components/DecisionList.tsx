import { useEffect, useState, useRef, useCallback } from 'react';
import { Table, Badge, Text, Group, Paper, Button } from '@mantine/core';
import { UserDisplay } from './UserDisplay';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import { PurpleLoader } from './PurpleLoader';
import DecisionModal from './DecisionModal';

interface Decision {
    id: string;
    taken_at: string;
    decision_type: string;
    verdict: string;
    notes: string;
    creator: {
        name: string;
        email: string;
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
    };
    snapshot_data: any;
}

interface DecisionListProps {
    epicId: string;
    refreshTrigger: number; // Increment to refresh list
    onRefresh?: () => void; // Callback to trigger refresh
}

export default function DecisionList({ epicId, refreshTrigger, onRefresh }: DecisionListProps) {
    const [decisions, setDecisions] = useState<Decision[]>([]);
    const [loading, setLoading] = useState(true);
    const [decisionModalOpen, setDecisionModalOpen] = useState(false);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastFetchRef = useRef<number>(0);

    const fetchDecisions = useCallback(async () => {
        lastFetchRef.current = Date.now();
        try {
            const res = await fetchWithRateLimit(`/api/epics/${epicId}/decisions`, {
                maxRetries: 1,
            });
            if (res.ok) {
                const data = await res.json();
                setDecisions(data);
            }
        } catch (error) {
            console.error('Failed to fetch decisions', error);
        } finally {
            setLoading(false);
        }
    }, [epicId]);

    useEffect(() => {
        // Debounce rapid successive calls (min 500ms between requests)
        const now = Date.now();
        const timeSinceLastFetch = now - lastFetchRef.current;
        
        if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
        }
        
        if (timeSinceLastFetch < 500) {
            fetchTimeoutRef.current = setTimeout(() => {
                fetchDecisions();
            }, 500 - timeSinceLastFetch);
        } else {
            fetchDecisions();
        }
        
        return () => {
            if (fetchTimeoutRef.current) {
                clearTimeout(fetchTimeoutRef.current);
            }
        };
    }, [epicId, refreshTrigger, fetchDecisions]);

    const handleDecisionSuccess = () => {
        if (onRefresh) {
            onRefresh();
        }
        setDecisionModalOpen(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-4">
                <PurpleLoader size="sm" />
                <Text size="sm" c="dimmed">Loading history...</Text>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Group justify="space-between" align="center">
                <Text size="lg" fw={600}>Decision History</Text>
                <Button 
                    size="sm"
                    onClick={() => setDecisionModalOpen(true)}
                >
                    Log Decision
                </Button>
            </Group>

            {decisions.length === 0 ? (
                <Paper withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed">No decisions logged yet.</Text>
                </Paper>
            ) : (
                <Paper withBorder p="md" radius="md">
                    <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Verdict</Table.Th>
                        <Table.Th>Logged By</Table.Th>
                        <Table.Th>Notes</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {decisions.map((decision) => (
                        <Table.Tr key={decision.id}>
                            <Table.Td>{new Date(decision.taken_at).toLocaleString()}</Table.Td>
                            <Table.Td>
                                <Badge variant="light" color="gray">{decision.decision_type.replace(/_/g, ' ')}</Badge>
                            </Table.Td>
                            <Table.Td>
                                <Badge
                                    color={
                                        decision.verdict === 'GO' ? 'green' :
                                            decision.verdict === 'NO_GO' ? 'red' : 'yellow'
                                    }
                                >
                                    {decision.verdict.replace(/_/g, ' ')}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <UserDisplay
                                    email={decision.creator?.email}
                                    firstName={decision.creator?.first_name}
                                    lastName={decision.creator?.last_name}
                                    avatarUrl={decision.creator?.avatar_url}
                                    name={decision.creator?.name}
                                    size="sm"
                                />
                            </Table.Td>
                            <Table.Td>
                                <Text size="sm" lineClamp={2} title={decision.notes}>{decision.notes || '-'}</Text>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
            )}

            <DecisionModal
                epicId={epicId}
                opened={decisionModalOpen}
                onClose={() => setDecisionModalOpen(false)}
                onSuccess={handleDecisionSuccess}
            />
        </div>
    );
}
