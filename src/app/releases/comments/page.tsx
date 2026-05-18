"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  Group,
  Select,
  TextInput,
  Button,
  Tabs,
  Title,
  Text,
  Box,
  Badge,
  SegmentedControl,
} from '@mantine/core';
import { IconRefresh, IconChecks } from '@tabler/icons-react';
import { CommentsList } from '@/components/CommentsList';
import { CommentsThreadList } from '@/components/CommentsThreadList';
import { PurpleLoader } from '@/components/PurpleLoader';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import { useRouter } from 'next/navigation';
import { CommentsModal } from '@/components/CommentsModal';

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  updated_at?: string | null;
  status_at_comment?: string | null;
  previous_status?: string | null;
  created_by?: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  is_read: boolean;
  read_at?: string | null;
  mentioned_user_ids?: string[];
  epic: {
    id: string;
    name: string;
  } | null;
  criterion: {
    id: string;
    label: string;
    category?: string | null;
  } | null;
  launch_criterion_status_id: string;
}

type EpicsResponse = Array<{ id: string; name: string }>;

export default function CommentsPage() {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [myEpicsUnreadCount, setMyEpicsUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<string>('my-epics');
  const [epics, setEpics] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedEpicId, setSelectedEpicId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [selectedCommentForModal, setSelectedCommentForModal] = useState<{
    epicId: string;
    taskId: string;
    taskLabel: string;
  } | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'threads'>('threads');
  const [threadFilter, setThreadFilter] = useState<'all' | 'mine'>('all');

  // Fetch current user email
  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.email) setCurrentUserEmail(data.user.email);
        if (data.user?.id) setCurrentUserId(data.user.id);
      })
      .catch((err) => console.error('Failed to fetch user email:', err));
  }, []);

  // Fetch my-epics unread count (independent of active tab)
  const fetchMyEpicsUnreadCount = useCallback(async () => {
    try {
      const response = await fetchWithRateLimit('/api/comments/all?myEpicsOnly=true&unread=true', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setMyEpicsUnreadCount(data.unread_count || 0);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchMyEpicsUnreadCount();
  }, [fetchMyEpicsUnreadCount]);

  // Fetch epics for filter dropdown
  useEffect(() => {
    fetchEpics();
  }, []);

  const fetchEpics = async () => {
    try {
      const response = await fetchWithRateLimit('/api/epics', {
        credentials: 'include',
      });
      if (response.ok) {
        const data: EpicsResponse = await response.json();
        const epicsArray = Array.isArray(data) ? data : [];
        const epicOptions = [
          { value: '', label: 'All Epics' },
          ...epicsArray.map((epic) => ({
            value: epic.id,
            label: epic.name,
          })),
        ];
        setEpics(epicOptions);
      }
    } catch (error) {
      console.error('Failed to fetch epics:', error);
    }
  };

  // Fetch comments
  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === 'unread') {
        params.append('unread', 'true');
      }
      if (activeTab === 'my-epics') {
        params.append('myEpicsOnly', 'true');
      }
      if (selectedEpicId) {
        params.append('epicId', selectedEpicId);
      }
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }

      const response = await fetchWithRateLimit(`/api/comments/all?${params.toString()}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
        setUnreadCount(data.unread_count || 0);
      } else {
        console.error('Failed to fetch comments');
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedEpicId, startDate, endDate]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleMarkRead = async (commentIds: string[]) => {
    const idSet = new Set(commentIds);

    // Optimistic update: mark comments as read locally for instant UI response
    setComments((prev) =>
      prev.map((c) => (idSet.has(c.id) ? { ...c, is_read: true, read_at: new Date().toISOString() } : c))
    );
    setUnreadCount((prev) => Math.max(0, prev - commentIds.length));

    try {
      const response = await fetchWithRateLimit('/api/comments/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment_ids: commentIds }),
        credentials: 'include',
      });

      if (response.ok) {
        fetchMyEpicsUnreadCount();
      } else {
        console.error('Failed to mark comments as read');
        await fetchComments();
      }
    } catch (error) {
      console.error('Error marking comments as read:', error);
      await fetchComments();
    }
  };

  const handleNavigateToEpic = (epicId: string) => {
    router.push(`/epics/${epicId}`);
  };

  const handleOpenCommentsModal = (epicId: string, taskId: string, taskLabel: string) => {
    setSelectedCommentForModal({ epicId, taskId, taskLabel });
    setCommentsModalOpen(true);
  };

  const handleCloseCommentsModal = () => {
    setCommentsModalOpen(false);
    setSelectedCommentForModal(null);
    // Refresh comments after closing modal (they may have been marked as read)
    fetchComments();
    fetchMyEpicsUnreadCount();
  };

  const filteredComments = useMemo(() => {
    let result = comments;
    if (activeTab === 'unread') {
      result = result.filter((c) => !c.is_read);
    }
    if (selectedStatus) {
      result = result.filter((c) => c.status_at_comment === selectedStatus);
    }
    if (threadFilter === 'mine' && currentUserId) {
      const byLcs = new Map<string, Comment[]>();
      for (const c of result) {
        const list = byLcs.get(c.launch_criterion_status_id) ?? [];
        list.push(c);
        byLcs.set(c.launch_criterion_status_id, list);
      }
      const myLcsIds = new Set<string>();
      for (const [lcsId, threadComments] of byLcs) {
        const sorted = [...threadComments].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const iStarted = sorted[0]?.created_by?.id === currentUserId;
        const isMentioned = threadComments.some(
          (c) => c.mentioned_user_ids?.includes(currentUserId)
        );
        if (iStarted || isMentioned) myLcsIds.add(lcsId);
      }
      result = result.filter((c) => myLcsIds.has(c.launch_criterion_status_id));
    }
    return result;
  }, [comments, activeTab, selectedStatus, threadFilter, currentUserId]);

  const STATUS_OPTIONS = [
    { value: 'GO', label: 'GO' },
    { value: 'CONDITIONAL', label: 'CONDITIONAL' },
    { value: 'NO_GO', label: 'NO GO' },
  ];

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        fontFamily: 'var(--font-body)',
        backgroundColor: 'var(--color-platinum)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)',
          paddingTop: 'var(--page-container-padding-top)',
        }}
        className="sm:px-6 lg:px-8"
      >
        <div className="mb-8">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title
                order={1}
                className="text-4xl font-bold mb-2"
                style={{
                  fontFamily: 'var(--font-marcellus), serif',
                  color: 'var(--color-gray-900)',
                  fontSize: 'var(--font-size-4xl)',
                  fontWeight: 'var(--font-weight-bold)',
                  margin: 0,
                }}
              >
                Comments
              </Title>
              <Text
                size="lg"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--color-gray-500)',
                  fontSize: 'var(--font-size-lg)',
                  marginTop: '0.5rem',
                }}
              >
                View and manage comments across all epics
              </Text>
            </div>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={fetchComments}
              variant="light"
              loading={loading}
            >
              Refresh
            </Button>
          </Group>
        </div>

        <Stack gap="md">
          {/* Tabs */}
          <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'all')}>
            <Tabs.List>
              <Tabs.Tab value="my-epics">
                My Epics
                {myEpicsUnreadCount > 0 && (
                  <Badge size="xs" color="blue" ml="xs">
                    {myEpicsUnreadCount}
                  </Badge>
                )}
              </Tabs.Tab>
              <Tabs.Tab value="all">
                All Comments
                {comments.length > 0 && (
                  <Badge size="xs" variant="light" ml="xs">
                    {comments.length}
                  </Badge>
                )}
              </Tabs.Tab>
              <Tabs.Tab value="unread">
                Unread
                {unreadCount > 0 && (
                  <Badge size="xs" color="blue" ml="xs">
                    {unreadCount}
                  </Badge>
                )}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="all" pt="md">
              <Stack gap="md">
                {/* Filters */}
                <Group mb="lg" align="flex-end" gap="sm">
                  <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                    Filters:
                  </Text>
                  <Box
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: '16px',
                      padding: '8px 0',
                    }}
                  >
                    <Select
                      placeholder="All Epics"
                      data={epics}
                      value={selectedEpicId}
                      onChange={(value) => setSelectedEpicId(value || '')}
                      clearable
                      style={{ minWidth: 200 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <Select
                      placeholder="All Statuses"
                      data={STATUS_OPTIONS}
                      value={selectedStatus}
                      onChange={(value) => setSelectedStatus(value || '')}
                      clearable
                      style={{ minWidth: 160 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <TextInput
                      type="date"
                      label="Start Date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.currentTarget.value)}
                      style={{ minWidth: 150 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <TextInput
                      type="date"
                      label="End Date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.currentTarget.value)}
                      style={{ minWidth: 150 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    {(selectedEpicId || selectedStatus || startDate || endDate) && (
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                          setSelectedEpicId('');
                          setSelectedStatus('');
                          setStartDate('');
                          setEndDate('');
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </Box>
                </Group>

                <Group mb="md" justify="space-between">
                  <Group gap="md">
                    <Group gap="xs">
                      <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                        View:
                      </Text>
                      <SegmentedControl
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'table' | 'threads')}
                        data={[
                          { label: 'Table', value: 'table' },
                          { label: 'Threads', value: 'threads' },
                        ]}
                        size="xs"
                      />
                    </Group>
                    <Group gap="xs">
                      <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                        Show:
                      </Text>
                      <SegmentedControl
                        value={threadFilter}
                        onChange={(v) => setThreadFilter(v as 'all' | 'mine')}
                        data={[
                          { label: 'All', value: 'all' },
                          { label: 'My threads', value: 'mine' },
                        ]}
                        size="xs"
                      />
                    </Group>
                  </Group>
                  {filteredComments.some((c) => !c.is_read) && (
                    <Button
                      size="xs"
                      variant="filled"
                      color="blue"
                      leftSection={<IconChecks size={14} />}
                      onClick={() =>
                        handleMarkRead(
                          filteredComments.filter((c) => !c.is_read).map((c) => c.id)
                        )
                      }
                    >
                      Mark all as read
                    </Button>
                  )}
                </Group>

                {/* Comments List */}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <PurpleLoader />
                  </div>
                ) : viewMode === 'threads' ? (
                  <CommentsThreadList
                    comments={filteredComments}
                    onMarkRead={handleMarkRead}
                    onNavigateToEpic={handleNavigateToEpic}
                    onOpenThread={handleOpenCommentsModal}
                    loading={loading}
                    previewRepliesCount={3}
                  />
                ) : (
                  <CommentsList
                    comments={filteredComments}
                    onMarkRead={handleMarkRead}
                    onNavigateToEpic={handleNavigateToEpic}
                    onOpenCommentsModal={handleOpenCommentsModal}
                    loading={loading}
                    showBulkActions={true}
                  />
                )}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="unread" pt="md">
              <Stack gap="md">
                {/* Filters */}
                <Group mb="lg" align="flex-end" gap="sm">
                  <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                    Filters:
                  </Text>
                  <Box
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: '16px',
                      padding: '8px 0',
                    }}
                  >
                    <Select
                      placeholder="All Epics"
                      data={epics}
                      value={selectedEpicId}
                      onChange={(value) => setSelectedEpicId(value || '')}
                      clearable
                      style={{ minWidth: 200 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <Select
                      placeholder="All Statuses"
                      data={STATUS_OPTIONS}
                      value={selectedStatus}
                      onChange={(value) => setSelectedStatus(value || '')}
                      clearable
                      style={{ minWidth: 160 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <TextInput
                      type="date"
                      label="Start Date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.currentTarget.value)}
                      style={{ minWidth: 150 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <TextInput
                      type="date"
                      label="End Date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.currentTarget.value)}
                      style={{ minWidth: 150 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
{(selectedEpicId || selectedStatus || startDate || endDate) && (
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                          setSelectedEpicId('');
                          setSelectedStatus('');
                          setStartDate('');
                          setEndDate('');
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </Box>
                </Group>

                <Group mb="md" justify="space-between">
                  <Group gap="md">
                    <Group gap="xs">
                      <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                        View:
                      </Text>
                      <SegmentedControl
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'table' | 'threads')}
                        data={[
                          { label: 'Table', value: 'table' },
                          { label: 'Threads', value: 'threads' },
                        ]}
                        size="xs"
                      />
                    </Group>
                    <Group gap="xs">
                      <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                        Show:
                      </Text>
                      <SegmentedControl
                        value={threadFilter}
                        onChange={(v) => setThreadFilter(v as 'all' | 'mine')}
                        data={[
                          { label: 'All', value: 'all' },
                          { label: 'My threads', value: 'mine' },
                        ]}
                        size="xs"
                      />
                    </Group>
                  </Group>
                  {filteredComments.some((c) => !c.is_read) && (
                    <Button
                      size="xs"
                      variant="filled"
                      color="blue"
                      leftSection={<IconChecks size={14} />}
                      onClick={() =>
                        handleMarkRead(
                          filteredComments.filter((c) => !c.is_read).map((c) => c.id)
                        )
                      }
                    >
                      Mark all as read
                    </Button>
                  )}
                </Group>

                {/* Comments List */}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <PurpleLoader />
                  </div>
                ) : viewMode === 'threads' ? (
                  <CommentsThreadList
                    comments={filteredComments}
                    onMarkRead={handleMarkRead}
                    onNavigateToEpic={handleNavigateToEpic}
                    onOpenThread={handleOpenCommentsModal}
                    loading={loading}
                    previewRepliesCount={3}
                  />
                ) : (
                  <CommentsList
                    comments={filteredComments}
                    onMarkRead={handleMarkRead}
                    onNavigateToEpic={handleNavigateToEpic}
                    onOpenCommentsModal={handleOpenCommentsModal}
                    loading={loading}
                    showBulkActions={true}
                  />
                )}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="my-epics" pt="md">
              <Stack gap="md">
                {/* Filters */}
                <Group mb="lg" align="flex-end" gap="sm">
                  <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                    Filters:
                  </Text>
                  <Box
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: '16px',
                      padding: '8px 0',
                    }}
                  >
                    <Select
                      placeholder="All Statuses"
                      data={STATUS_OPTIONS}
                      value={selectedStatus}
                      onChange={(value) => setSelectedStatus(value || '')}
                      clearable
                      style={{ minWidth: 160 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <TextInput
                      type="date"
                      label="Start Date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.currentTarget.value)}
                      style={{ minWidth: 150 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    <TextInput
                      type="date"
                      label="End Date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.currentTarget.value)}
                      style={{ minWidth: 150 }}
                      styles={{
                        input: {
                          borderRadius: 8,
                          border: '1px solid var(--color-gray-300)',
                          backgroundColor: 'var(--color-gray-50)',
                          fontFamily: 'var(--font-body)',
                        },
                      }}
                    />
                    {(selectedStatus || startDate || endDate) && (
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                          setSelectedStatus('');
                          setStartDate('');
                          setEndDate('');
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </Box>
                </Group>

                <Group mb="md" justify="space-between">
                  <Group gap="md">
                    <Group gap="xs">
                      <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                        View:
                      </Text>
                      <SegmentedControl
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'table' | 'threads')}
                        data={[
                          { label: 'Table', value: 'table' },
                          { label: 'Threads', value: 'threads' },
                        ]}
                        size="xs"
                      />
                    </Group>
                    <Group gap="xs">
                      <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>
                        Show:
                      </Text>
                      <SegmentedControl
                        value={threadFilter}
                        onChange={(v) => setThreadFilter(v as 'all' | 'mine')}
                        data={[
                          { label: 'All', value: 'all' },
                          { label: 'My threads', value: 'mine' },
                        ]}
                        size="xs"
                      />
                    </Group>
                  </Group>
                  {filteredComments.some((c) => !c.is_read) && (
                    <Button
                      size="xs"
                      variant="filled"
                      color="blue"
                      leftSection={<IconChecks size={14} />}
                      onClick={() =>
                        handleMarkRead(
                          filteredComments.filter((c) => !c.is_read).map((c) => c.id)
                        )
                      }
                    >
                      Mark all as read
                    </Button>
                  )}
                </Group>

                {/* Comments List */}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <PurpleLoader />
                  </div>
                ) : viewMode === 'threads' ? (
                  <CommentsThreadList
                    comments={filteredComments}
                    onMarkRead={handleMarkRead}
                    onNavigateToEpic={handleNavigateToEpic}
                    onOpenThread={handleOpenCommentsModal}
                    loading={loading}
                    previewRepliesCount={3}
                  />
                ) : (
                  <CommentsList
                    comments={filteredComments}
                    onMarkRead={handleMarkRead}
                    onNavigateToEpic={handleNavigateToEpic}
                    onOpenCommentsModal={handleOpenCommentsModal}
                    loading={loading}
                    showBulkActions={true}
                  />
                )}
              </Stack>
            </Tabs.Panel>
        </Tabs>
      </Stack>

        {/* Comments Modal */}
        {selectedCommentForModal && (
          <CommentsModal
            opened={commentsModalOpen}
            onClose={handleCloseCommentsModal}
            epicId={selectedCommentForModal.epicId}
            taskId={selectedCommentForModal.taskId}
            taskLabel={selectedCommentForModal.taskLabel}
            currentUserEmail={currentUserEmail}
            initialTab="comments"
          />
        )}
      </div>
    </div>
  );
}
