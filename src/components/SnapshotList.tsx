import { useEffect, useState, useRef } from 'react';
import { Table, Badge, Text, Group, Paper } from '@mantine/core';
import { UserDisplay } from './UserDisplay';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import { PurpleLoader } from './PurpleLoader';

interface Snapshot {
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

interface SnapshotListProps {
    epicId: string;
    refreshTrigger: number; // Increment to refresh list
}

export default function SnapshotList({ epicId, refreshTrigger }: SnapshotListProps) {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastFetchRef = useRef<number>(0);

    useEffect(() => {
        // Debounce rapid successive calls (min 500ms between requests)
        const now = Date.now();
        const timeSinceLastFetch = now - lastFetchRef.current;
        
        if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
        }
        
        if (timeSinceLastFetch < 500) {
            fetchTimeoutRef.current = setTimeout(() => {
                fetchSnapshots();
            }, 500 - timeSinceLastFetch);
        } else {
            fetchSnapshots();
        }
        
        return () => {
            if (fetchTimeoutRef.current) {
                clearTimeout(fetchTimeoutRef.current);
            }
        };
    }, [epicId, refreshTrigger]);

    const fetchSnapshots = async () => {
        lastFetchRef.current = Date.now();
        try {
            const res = await fetchWithRateLimit(`/api/epics/${epicId}/snapshots`, {
                maxRetries: 1,
            });
            if (res.ok) {
                const data = await res.json();
                setSnapshots(data);
            }
        } catch (error) {
            console.error('Failed to fetch snapshots', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-4">
                <PurpleLoader size="sm" />
                <Text size="sm" c="dimmed">Loading history...</Text>
            </div>
        );
    }
    if (snapshots.length === 0) return <Text size="sm" c="dimmed">No snapshots taken yet.</Text>;

    return (
        <Paper withBorder p="md" radius="md">
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Verdict</Table.Th>
                        <Table.Th>Taken By</Table.Th>
                        <Table.Th>Notes</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {snapshots.map((snap) => (
                        <Table.Tr key={snap.id}>
                            <Table.Td>{new Date(snap.taken_at).toLocaleString()}</Table.Td>
                            <Table.Td>
                                <Badge variant="light" color="gray">{snap.decision_type.replace(/_/g, ' ')}</Badge>
                            </Table.Td>
                            <Table.Td>
                                <Badge
                                    color={
                                        snap.verdict === 'GO' ? 'green' :
                                            snap.verdict === 'NO_GO' ? 'red' : 'yellow'
                                    }
                                >
                                    {snap.verdict.replace(/_/g, ' ')}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <UserDisplay
                                    email={snap.creator?.email}
                                    firstName={snap.creator?.first_name}
                                    lastName={snap.creator?.last_name}
                                    avatarUrl={snap.creator?.avatar_url}
                                    name={snap.creator?.name}
                                    size="sm"
                                />
                            </Table.Td>
                            <Table.Td>
                                <Text size="sm" lineClamp={2} title={snap.notes}>{snap.notes || '-'}</Text>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
}
